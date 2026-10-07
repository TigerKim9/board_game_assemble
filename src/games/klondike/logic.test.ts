import { describe, expect, it } from 'vitest'
import { parseCard, parseCards } from '../../cards/deck'
import { mulberry32 } from '../../lib/random'
import { autoSolve, autoTarget, canDrop, drawStock, isWon, move, newGame, pickUp, type KState } from './logic'

const empty = (): KState => ({
  stock: [],
  waste: [],
  found: [[], [], [], []],
  tab: Array.from({ length: 7 }, () => ({ down: [], up: [] })),
  draw: 1,
  moves: 0,
})

describe('klondike deal', () => {
  it('deals 28 cards to 7 columns and 24 to the stock', () => {
    const s = newGame(1, mulberry32(1))
    expect(s.tab.map((c) => c.down.length)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(s.tab.every((c) => c.up.length === 1)).toBe(true)
    expect(s.stock).toHaveLength(24)
  })
  it('draws 1 or 3 and recycles the waste', () => {
    let s = newGame(3, mulberry32(2))
    s = drawStock(s)!
    expect(s.waste).toHaveLength(3)
    for (let i = 0; i < 7; i++) s = drawStock(s)!
    expect(s.stock).toHaveLength(0)
    expect(s.waste).toHaveLength(24)
    const firstWaste = s.waste[0]
    s = drawStock(s)!
    expect(s.stock).toHaveLength(24)
    expect(s.stock[0]).toEqual(firstWaste)
  })
})

describe('klondike rules', () => {
  it('stacks alternating colours descending', () => {
    const s = empty()
    s.tab[0].up = [parseCard('8S')]
    expect(canDrop(s, [parseCard('7H')], 't0')).toBe(true)
    expect(canDrop(s, [parseCard('7C')], 't0')).toBe(false)
    expect(canDrop(s, [parseCard('6H')], 't0')).toBe(false)
  })
  it('only kings go to empty columns, only aces start foundations', () => {
    const s = empty()
    expect(canDrop(s, [parseCard('KD')], 't1')).toBe(true)
    expect(canDrop(s, [parseCard('QD')], 't1')).toBe(false)
    expect(canDrop(s, [parseCard('AH')], 'f0')).toBe(true)
    expect(canDrop(s, [parseCard('2H')], 'f0')).toBe(false)
  })
  it('moves a run and flips the uncovered card', () => {
    const s = empty()
    s.tab[0] = { down: [parseCard('2C')], up: parseCards('9H 8S 7D') }
    s.tab[1] = { down: [], up: [parseCard('10S')] }
    expect(pickUp(s, 't0', 0)).toBeNull() // face-down
    const n = move(s, 't0', 1, 't1')!
    expect(n.tab[1].up.map((c) => c.id)).toEqual(['S10', 'H9', 'S8', 'D7'])
    expect(n.tab[0].up.map((c) => c.id)).toEqual(['C2'])
    expect(n.tab[0].down).toHaveLength(0)
    expect(n.moves).toBe(1)
  })
  it('double-tap prefers the foundation', () => {
    const s = empty()
    s.found[2] = [parseCard('AH')]
    s.tab[0].up = [parseCard('2H')]
    s.tab[1].up = [parseCard('3S')]
    expect(autoTarget(s, 't0', 0)).toBe('f2')
  })
  it('auto-solves when everything is face up', () => {
    const s = empty()
    // two columns holding a whole suit each way, rest in stock
    const all = parseCards('KS QH JS 10H 9S 8H 7S 6H 5S 4H 3S 2H AS')
    s.tab[0].up = all
    const rest = parseCards('KH QS JH 10S 9H 8S 7H 6S 5H 4S 3H 2S AH')
    s.tab[1].up = rest
    s.stock = parseCards('AD 2D 3D 4D 5D 6D 7D 8D 9D 10D JD QD KD AC 2C 3C 4C 5C 6C 7C 8C 9C 10C JC QC KC')
    const steps = autoSolve(s)!
    expect(steps).not.toBeNull()
    expect(isWon(steps[steps.length - 1])).toBe(true)
  })
  it('does not auto-solve with hidden cards', () => {
    expect(autoSolve(newGame(1, mulberry32(3)))).toBeNull()
  })
})
