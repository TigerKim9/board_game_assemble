import { describe, expect, it } from 'vitest'
import { DONE, OFF, addThrow, applyMove, chooseMove, destination, legalMoves, newGame, throwSticks } from './logic'
import { mulberry32 } from '../../lib/random'

const settings = { piecesPerPlayer: 4, backdo: true }

describe('yut board movement', () => {
  it('enters the board on the outer ring', () => {
    expect(destination(OFF, 'do')).toBe(1)
    expect(destination(OFF, 'mo')).toBe(5)
  })
  it('takes the shortcut from corner 5', () => {
    expect(destination(5, 'do')).toBe(20)
    expect(destination(5, 'geol')).toBe(22)
    expect(destination(5, 'mo')).toBe(24)
  })
  it('goes from the center towards the goal', () => {
    expect(destination(22, 'gae')).toBe(28)
    expect(destination(22, 'geol')).toBe(DONE)
  })
  it('passes straight through the center when not stopping', () => {
    expect(destination(21, 'gae')).toBe(23)
  })
  it('takes the shortcut from corner 10', () => {
    expect(destination(10, 'geol')).toBe(22)
    expect(destination(10, 'mo')).toBe(28)
  })
  it('finishes from the outer ring', () => {
    expect(destination(18, 'do')).toBe(19)
    expect(destination(18, 'gae')).toBe(DONE)
    expect(destination(24, 'do')).toBe(15)
  })
  it('handles backdo', () => {
    expect(destination(OFF, 'backdo')).toBeNull()
    expect(destination(3, 'backdo')).toBe(2)
    expect(destination(1, 'backdo')).toBe(0)
    expect(destination(0, 'do')).toBe(DONE)
    expect(destination(20, 'backdo')).toBe(5)
  })
})

describe('yut game flow', () => {
  it('captures and grants another throw', () => {
    let g = newGame(2, settings)
    g = { ...g, pieces: g.pieces.map((p, i) => (i === 4 ? { ...p, pos: 3 } : p)) }
    g = addThrow(g, 'geol')
    const move = legalMoves(g).find((m) => m.to === 3)!
    const out = applyMove(g, move)
    expect(out.captured).toBe(1)
    expect(out.state.pieces[4].pos).toBe(OFF)
    expect(out.state.canThrow).toBe(true)
    expect(out.state.turn).toBe(0)
  })
  it('stacks own pieces and moves them together', () => {
    let g = newGame(2, settings)
    g = { ...g, pieces: g.pieces.map((p, i) => (i === 0 ? { ...p, pos: 2 } : p)) }
    g = addThrow(g, 'gae')
    const move = legalMoves(g).find((m) => g.pieces[m.piece].pos === OFF)!
    const s1 = applyMove(g, move).state
    expect(s1.pieces.filter((p) => p.owner === 0 && p.pos === 2)).toHaveLength(2)
    const s2 = addThrow({ ...s1, turn: 0, canThrow: true }, 'do')
    const s3 = applyMove(s2, legalMoves(s2).find((m) => s2.pieces[m.piece].pos === 2)!).state
    expect(s3.pieces.filter((p) => p.owner === 0 && p.pos === 3)).toHaveLength(2)
  })
  it('passes the turn when only backdo with nothing on board', () => {
    const g = addThrow(newGame(2, settings), 'backdo')
    expect(g.turn).toBe(1)
    expect(g.pending).toHaveLength(0)
  })
  it('yut grants another throw', () => {
    const g = addThrow(newGame(2, settings), 'yut')
    expect(g.canThrow).toBe(true)
  })
  it('detects winner', () => {
    let g = newGame(2, { piecesPerPlayer: 1, backdo: true })
    g = { ...g, pieces: g.pieces.map((p, i) => (i === 0 ? { ...p, pos: 19 } : p)) }
    g = addThrow(g, 'do')
    expect(applyMove(g, legalMoves(g)[0]).state.winner).toBe(0)
  })
  it('throw distribution looks right', () => {
    const rng = mulberry32(7)
    const counts: Record<string, number> = {}
    for (let i = 0; i < 16000; i++) {
      const r = throwSticks(rng).result
      counts[r] = (counts[r] ?? 0) + 1
    }
    expect(counts.gae / 16000).toBeCloseTo(6 / 16, 1)
    expect(counts.mo / 16000).toBeCloseTo(1 / 16, 1)
  })
})

describe('yut AI', () => {
  it('prefers capturing', () => {
    let g = newGame(2, settings)
    g = { ...g, pieces: g.pieces.map((p, i) => (i === 0 ? { ...p, pos: 1 } : i === 4 ? { ...p, pos: 3 } : p)) }
    g = addThrow(g, 'gae')
    const m = chooseMove(g, 'hard')!
    expect(m.to).toBe(3)
  })
})
