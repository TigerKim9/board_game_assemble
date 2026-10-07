import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import {
  COLS,
  GARBAGE,
  ROWS,
  SHAPES,
  addGarbage,
  aiStep,
  attackFor,
  collides,
  createPlayer,
  emptyBoard,
  exchangeGarbage,
  ghostY,
  hardDrop,
  holdPiece,
  move,
  newController,
  rotate,
  tick,
  type Player,
} from './logic'

const fresh = (seed = 1) => createPlayer(mulberry32(seed))

function setPiece(p: Player, type: 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L', x = 3, y = 1, rot = 0) {
  p.piece = { type, rot, x, y }
}

describe('blocks pieces', () => {
  it('every rotation has 4 cells', () => {
    for (const rots of Object.values(SHAPES)) for (const r of rots) expect(r.length).toBe(4)
  })
  it('7-bag gives every piece once per 7', () => {
    const p = fresh()
    const seen = [p.piece!.type, ...p.queue.slice(0, 6)]
    expect(new Set(seen).size).toBe(7)
  })
  it('spawns in the middle near the top', () => {
    const p = fresh()
    expect(p.piece!.x).toBeGreaterThanOrEqual(3)
    expect(p.piece!.y).toBeLessThanOrEqual(1)
  })
})

describe('blocks movement', () => {
  it('moves and stops at walls', () => {
    const p = fresh()
    setPiece(p, 'O', 4)
    for (let i = 0; i < 10; i++) move(p, -1)
    expect(p.piece!.x).toBe(0)
    for (let i = 0; i < 20; i++) move(p, 1)
    expect(p.piece!.x).toBe(COLS - 2)
  })
  it('rotates T with wall kick against the left wall', () => {
    const p = fresh()
    setPiece(p, 'T', 0, 5, 1) // vertical T at the wall: cells in column 1..2
    move(p, -1)
    expect(p.piece!.x).toBe(-1)
    expect(rotate(p, 1)).toBe(true) // would poke out of the wall; kick moves it right
    expect(collides(p.board, 'T', p.piece!.rot, p.piece!.x, p.piece!.y)).toBe(false)
    expect(p.piece!.x).toBe(0)
  })
  it('I piece rotates four times back to start', () => {
    const p = fresh()
    setPiece(p, 'I', 3, 5)
    for (let i = 0; i < 4; i++) expect(rotate(p, 1)).toBe(true)
    expect(p.piece).toMatchObject({ rot: 0, x: 3, y: 5 })
  })
  it('hard drop lands on the ghost and scores 2 per cell', () => {
    const p = fresh()
    setPiece(p, 'O', 4, 1)
    const g = ghostY(p)
    expect(g).toBe(ROWS - 2)
    hardDrop(p)
    expect(p.board[ROWS - 1][4]).toBeTruthy()
    expect(p.score).toBe((ROWS - 3) * 2)
  })
  it('gravity drops and lock delay locks', () => {
    const p = fresh()
    setPiece(p, 'O', 4, ROWS - 3)
    const before = p.pieces
    for (let i = 0; i < 61; i++) tick(p, 1 / 60)
    expect(p.piece!.y).toBe(ROWS - 2)
    for (let i = 0; i < 20; i++) tick(p, 1 / 60)
    expect(p.pieces).toBe(before)
    for (let i = 0; i < 20; i++) tick(p, 1 / 60)
    expect(p.pieces).toBe(before + 1)
  })
  it('hold swaps once per piece', () => {
    const p = fresh()
    const first = p.piece!.type
    const next = p.queue[0]
    expect(holdPiece(p)).toBe(true)
    expect(p.hold).toBe(first)
    expect(p.piece!.type).toBe(next)
    expect(holdPiece(p)).toBe(false)
    hardDrop(p)
    expect(holdPiece(p)).toBe(true)
    expect(p.piece!.type).toBe(first)
  })
})

describe('blocks line clears', () => {
  it('clears a line and scores by level', () => {
    const p = fresh()
    for (let x = 0; x < COLS; x++) if (x < 4 || x > 5) p.board[ROWS - 1][x] = 1
    for (let x = 0; x < COLS; x++) if (x < 4 || x > 5) p.board[ROWS - 2][x] = 1
    setPiece(p, 'O', 4, 1)
    hardDrop(p)
    expect(p.lines).toBe(2)
    expect(p.board[ROWS - 1].every((c) => c === 0)).toBe(true)
    const clear = p.events.find((e) => e.type === 'clear')
    expect(clear && clear.type === 'clear' && clear.count).toBe(2)
    expect(p.outgoing).toBe(1)
  })
  it('a quad sends 4 and back-to-back adds one', () => {
    expect(attackFor(4, false, false, 0)).toBe(4)
    expect(attackFor(4, false, true, 0)).toBe(5)
    expect(attackFor(1, false, false, 0)).toBe(0)
    expect(attackFor(2, true, false, 0)).toBe(4)
  })
  it('levels up every 10 lines', () => {
    const p = fresh()
    p.lines = 9
    for (let x = 0; x < COLS; x++) if (x < 4 || x > 5) p.board[ROWS - 1][x] = 1
    setPiece(p, 'O', 4, 1)
    hardDrop(p)
    expect(p.level).toBe(2)
  })
  it('garbage arrives when no line is cleared and can top out', () => {
    const p = fresh()
    p.pending = 3
    setPiece(p, 'O', 0, 1)
    hardDrop(p)
    expect(p.pending).toBe(0)
    expect(p.board[ROWS - 1].filter((c) => c === GARBAGE).length).toBe(COLS - 1)
    const b = emptyBoard()
    b[0][0] = 1
    expect(addGarbage(b, 1, 3)).toBe(true)
  })
  it('exchanges garbage between players', () => {
    const a = fresh(1)
    const b = fresh(2)
    a.outgoing = 3
    exchangeGarbage(a, b)
    expect(b.pending).toBe(3)
    expect(a.outgoing).toBe(0)
  })
  it('tops out when the spawn area is blocked', () => {
    const p = fresh()
    for (let y = 1; y < ROWS; y++) for (let x = 3; x <= 6; x++) p.board[y][x] = 1
    setPiece(p, 'O', 0, 0)
    hardDrop(p)
    expect(p.over).toBe(true)
  })
})

describe('blocks AI', () => {
  const play = (difficulty: 'easy' | 'normal' | 'hard', pieces: number, seed: number) => {
    const p = createPlayer(mulberry32(seed))
    const c = newController()
    let guard = 0
    while (!p.over && p.pieces < pieces && guard++ < 100000) {
      aiStep(p, c, 0.05, difficulty)
      p.events = []
    }
    return p
  }
  it('normal AI clears lines and survives 150 pieces', () => {
    const p = play('normal', 150, 3)
    expect(p.over).toBe(false)
    expect(p.lines).toBeGreaterThan(40)
  })
  it('hard AI is at least as good as easy', () => {
    const hard = play('hard', 120, 4)
    const easy = play('easy', 120, 4)
    expect(hard.over).toBe(false)
    expect(hard.lines).toBeGreaterThanOrEqual(easy.over ? 0 : easy.lines - 5)
  })
})
