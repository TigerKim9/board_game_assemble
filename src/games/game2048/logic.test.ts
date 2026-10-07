import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { canMove, fromMatrix, live, move, newGame, settle, slide, toMatrix } from './logic'

describe('2048 slide', () => {
  it('merges towards the edge, once per tile', () => {
    const s = fromMatrix([
      [2, 2, 2, 0],
      [4, 4, 4, 4],
      [2, 0, 0, 2],
      [8, 4, 0, 0],
    ])
    const left = slide(s, 'left')!
    expect(toMatrix(left.state)).toEqual([
      [4, 2, 0, 0],
      [8, 8, 0, 0],
      [4, 0, 0, 0],
      [8, 4, 0, 0],
    ])
    expect(left.gained).toBe(4 + 8 + 8 + 4)
    const right = slide(s, 'right')!
    expect(toMatrix(right.state)[0]).toEqual([0, 0, 2, 4])
  })
  it('slides vertically', () => {
    const s = fromMatrix([
      [2, 0, 0],
      [2, 0, 0],
      [4, 0, 2],
    ])
    expect(toMatrix(slide(s, 'up')!.state)).toEqual([
      [4, 0, 2],
      [4, 0, 0],
      [0, 0, 0],
    ])
    expect(toMatrix(slide(s, 'down')!.state)).toEqual([
      [0, 0, 0],
      [4, 0, 0],
      [4, 0, 2],
    ])
  })
  it('returns null when nothing moves', () => {
    const s = fromMatrix([
      [2, 4],
      [0, 0],
    ])
    expect(slide(s, 'left')).toBeNull()
    expect(slide(s, 'up')).toBeNull()
    expect(slide(s, 'down')).not.toBeNull()
  })
  it('keeps merged tiles as dead ghosts for animation', () => {
    const s = slide(fromMatrix([[2, 2], [0, 0]]), 'left')!.state
    expect(s.tiles.filter((t) => t.dead)).toHaveLength(2)
    expect(live(s)).toHaveLength(1)
    expect(settle(s).tiles).toHaveLength(1)
  })
})

describe('2048 game', () => {
  it('starts with two tiles', () => {
    expect(live(newGame(4, mulberry32(1)))).toHaveLength(2)
    expect(live(newGame(5, mulberry32(1)))).toHaveLength(2)
  })
  it('spawns a tile after each move and detects game over', () => {
    const s = fromMatrix([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [2, 4, 2, 0],
    ])
    expect(canMove(s)).toBe(true)
    const seq = [0.5, 0.95]
    const n = move(s, 'right', () => seq.shift() ?? 0)!
    expect(live(n)).toHaveLength(16)
    expect(n.over).toBe(true)
  })
  it('flags a win at 2048', () => {
    const s = move(fromMatrix([[1024, 1024], [0, 0]]), 'left', () => 0.1)!
    expect(s.won).toBe(true)
    expect(s.score).toBe(2048)
  })
  it('random play terminates', () => {
    const rng = mulberry32(7)
    let s = newGame(4, rng)
    const dirs = ['left', 'up', 'right', 'down'] as const
    for (let k = 0; k < 5000 && !s.over; k++) s = move(s, dirs[Math.floor(rng() * 4)], rng) ?? s
    expect(s.over).toBe(true)
    expect(s.score).toBeGreaterThan(0)
  })
})
