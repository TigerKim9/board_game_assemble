import { describe, expect, it } from 'vitest'
import { parseCards } from '../../cards/deck'
import { mulberry32 } from '../../lib/random'
import { autoTarget, canDrop, dealBlocked, dealRow, findHint, isWon, move, newGame, pickUp, type SState } from './logic'

const blank = (): SState => ({
  cols: Array.from({ length: 10 }, () => ({ down: [], up: [] })),
  stock: [],
  done: [],
  moves: 0,
  suits: 4,
})

describe('spider deal', () => {
  it('deals 54 cards (6,6,6,6,5…) and keeps 50 in stock', () => {
    const s = newGame(4, mulberry32(1))
    expect(s.cols.map((c) => c.down.length + c.up.length)).toEqual([6, 6, 6, 6, 5, 5, 5, 5, 5, 5])
    expect(s.stock).toHaveLength(50)
  })
  it('uses only the chosen suits', () => {
    const one = newGame(1, mulberry32(2))
    const all = [...one.stock, ...one.cols.flatMap((c) => [...c.down, ...c.up])]
    expect(new Set(all.map((c) => c.suit))).toEqual(new Set(['S']))
    const two = newGame(2, mulberry32(2))
    const all2 = [...two.stock, ...two.cols.flatMap((c) => [...c.down, ...c.up])]
    expect(all2.filter((c) => c.suit === 'H')).toHaveLength(52)
  })
})

describe('spider rules', () => {
  it('moves only same-suit runs, onto any suit one higher', () => {
    const s = blank()
    s.cols[0].up = parseCards('9S 8S 7H')
    s.cols[1].up = parseCards('9D')
    s.cols[2].up = parseCards('10H')
    expect(pickUp(s, 't0', 0)).toBeNull() // mixed suits
    expect(pickUp(s, 't0', 2)).toHaveLength(1)
    s.cols[0].up = parseCards('9S 8S 7S')
    expect(canDrop(s, pickUp(s, 't0', 0)!, 't2')).toBe(true)
    expect(canDrop(s, pickUp(s, 't0', 0)!, 't1')).toBe(false)
  })
  it('removes a completed K→A run and flips the card below', () => {
    const s = blank()
    s.cols[0] = {
      down: parseCards('3D'),
      up: parseCards('KS QS JS 10S 9S 8S 7S 6S 5S 4S 3S 2S'),
    }
    s.cols[1].up = parseCards('AS')
    const n = move(s, 't1', 0, 't0')!
    expect(n.done).toEqual(['S'])
    expect(n.cols[0].up.map((c) => c.id)).toEqual(['D3'])
    expect(n.cols[0].down).toHaveLength(0)
  })
  it('cannot deal with an empty column', () => {
    const s = newGame(1, mulberry32(3))
    expect(dealBlocked(s)).toBeNull()
    const d = dealRow(s)!
    expect(d.stock).toHaveLength(40)
    expect(d.cols.every((c, i) => c.up.length === s.cols[i].up.length + 1)).toBe(true)
    const e = {
      ...d,
      cols: d.cols.map((c, i) => (i === 0 ? { down: [], up: [] } : c)),
    }
    expect(dealBlocked(e)).toBe('empty')
    expect(dealRow(e)).toBeNull()
  })
  it('double-tap prefers same suit', () => {
    const s = blank()
    s.cols[0].up = parseCards('5H 4S')
    s.cols[1].up = parseCards('5D')
    s.cols[2].up = parseCards('5S')
    expect(autoTarget(s, 't0', 1)).toBe('t2')
  })
  it('hints at a useful move', () => {
    const s = blank()
    s.cols[0] = { down: parseCards('KH'), up: parseCards('4S') }
    s.cols[1].up = parseCards('5S')
    s.cols[2].up = parseCards('9D')
    expect(findHint(s)).toEqual({ pile: 't0', index: 1, target: 't1' })
  })
  it('suggests filling an empty column before dealing', () => {
    const s = blank()
    s.stock = parseCards('2H 3H 4H 5H 6H 7H 8H 9H 10H JH')
    s.cols[0].up = parseCards('9S 8S')
    for (let i = 1; i < 9; i++) s.cols[i].up = parseCards('2D')
    expect(findHint(s, new Set())).toEqual({ pile: 't0', index: 1, target: 't9' })
  })
  it('wins with 8 runs', () => {
    expect(isWon({ ...blank(), done: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'] })).toBe(true)
  })
})
