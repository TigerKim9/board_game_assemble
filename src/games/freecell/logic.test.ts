import { describe, expect, it } from 'vitest'
import { parseCard, parseCards, type Card } from '../../cards/deck'
import {
  autoPlaySafe,
  autoSolve,
  autoTarget,
  canDrop,
  hasAnyMove,
  isWon,
  maxMovable,
  move,
  newGame,
  pickUp,
  type FState,
} from './logic'

const blank = (): FState => ({
  cells: [null, null, null, null],
  found: [[], [], [], []],
  cols: Array.from({ length: 8 }, () => [] as Card[]),
  moves: 0,
  deal: 1,
})

describe('freecell deal', () => {
  it('deals 52 cards 7/7/7/7/6/6/6/6 and is reproducible by deal number', () => {
    const a = newGame(12345)
    expect(a.cols.map((c) => c.length)).toEqual([7, 7, 7, 7, 6, 6, 6, 6])
    expect(newGame(12345).cols).toEqual(a.cols)
    expect(newGame(12346).cols).not.toEqual(a.cols)
  })
})

describe('freecell rules', () => {
  it('computes the supermove limit', () => {
    const s = blank()
    s.cols.forEach((c, i) => i < 6 && c.push(parseCard('KS'))) // 2 empty columns
    expect(maxMovable(s, 't0')).toBe(5 * 4)
    expect(maxMovable(s, 't7')).toBe(5 * 2) // moving into an empty column
    s.cells = [parseCard('2H'), parseCard('3H'), parseCard('4H'), null]
    expect(maxMovable(s, 't0')).toBe(2 * 4)
  })
  it('refuses runs longer than the limit', () => {
    const s = blank()
    s.cells = parseCards('2C 3C 4C')
    s.cells.push(null)
    s.cols = [parseCards('9S'), parseCards('8H 7S 6H'), ...Array.from({ length: 6 }, () => parseCards('KD'))]
    // 1 free cell, 0 empty columns → 2 cards max
    expect(pickUp(s, 't1', 0)).toHaveLength(3)
    expect(canDrop(s, pickUp(s, 't1', 0)!, 't0')).toBe(false)
    s.cells[0] = null // 2 free cells → 3 cards
    expect(canDrop(s, pickUp(s, 't1', 0)!, 't0')).toBe(true)
  })
  it('foundations are fixed by suit and built upward', () => {
    const s = blank()
    expect(canDrop(s, [parseCard('AS')], 'f0')).toBe(true)
    expect(canDrop(s, [parseCard('AH')], 'f0')).toBe(false)
    expect(canDrop(s, [parseCard('AH')], 'f1')).toBe(true)
  })
  it('only one card per free cell', () => {
    const s = blank()
    s.cells[0] = parseCard('5D')
    expect(canDrop(s, [parseCard('7C')], 'c0')).toBe(false)
    expect(canDrop(s, [parseCard('7C')], 'c1')).toBe(true)
  })
  it('auto-plays safe cards only', () => {
    const s = blank()
    s.cols[0] = parseCards('3S AS')
    s.cols[1] = parseCards('2S')
    const n = autoPlaySafe(s)
    expect(n.found[0].map((c) => c.rank)).toEqual([1, 2])
    expect(n.cols[0].map((c) => c.id)).toEqual(['S3']) // 3♠ waits until red 2s are up
  })
  it('moves and counts', () => {
    const s = blank()
    s.cols[0] = parseCards('9S')
    s.cols[1] = parseCards('KC 8H')
    const n = move(s, 't1', 1, 't0')!
    expect(n.cols[0].map((c) => c.id)).toEqual(['S9', 'H8'])
    expect(n.moves).toBe(1)
    expect(move(s, 't0', 0, 't1')).toBeNull()
  })
  it('double-tap target prefers foundation, then columns, then a free cell', () => {
    const s = blank()
    s.found[1] = parseCards('AH')
    s.cols[0] = parseCards('KS 2H')
    expect(autoTarget(s, 't0', 1)).toBe('f1')
    s.cols[0] = parseCards('KS 5D')
    s.cols[1] = parseCards('6C')
    expect(autoTarget(s, 't0', 1)).toBe('t1')
    s.cols[1] = parseCards('QH')
    s.cols.forEach((c, i) => i > 1 && c.push(parseCard('KD')))
    expect(autoTarget(s, 't0', 1)).toBe('c0')
  })
  it('auto-solves sorted positions', () => {
    const s = blank()
    s.cols[0] = parseCards('KS QS JS 10S 9S 8S 7S 6S 5S 4S 3S 2S AS')
    s.cols[1] = parseCards('KH QH JH 10H 9H 8H 7H 6H 5H 4H 3H 2H AH')
    s.cols[2] = parseCards('KD QD JD 10D 9D 8D 7D 6D 5D 4D 3D 2D AD')
    s.cols[3] = parseCards('KC QC JC 10C 9C 8C 7C 6C 5C 4C 3C 2C AC')
    const steps = autoSolve(s)!
    expect(steps).toHaveLength(52)
    expect(isWon(steps[51])).toBe(true)
    expect(autoSolve(newGame(1))).toBeNull()
  })
  it('detects being stuck', () => {
    expect(hasAnyMove(newGame(7))).toBe(true)
    const s = blank()
    s.cells = parseCards('KS KH KD KC')
    s.cols = [
      parseCards('2S'),
      parseCards('2H'),
      parseCards('2D'),
      parseCards('2C'),
      parseCards('QS'),
      parseCards('QH'),
      parseCards('QD'),
      parseCards('QC'),
    ]
    expect(hasAnyMove(s)).toBe(false)
  })
})
