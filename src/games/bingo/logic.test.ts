import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import {
  FREE,
  autoMark,
  callOrder,
  canMark,
  closestLineMissing,
  countLines,
  initialMarks,
  label,
  makeCard,
  winnersFor,
} from './logic'

describe('bingo cards', () => {
  it('builds valid 75-ball cards', () => {
    const rng = mulberry32(3)
    for (let k = 0; k < 20; k++) {
      const card = makeCard('75', rng)
      expect(card[12]).toBe(FREE)
      expect(new Set(card).size).toBe(25)
      card.forEach((n, i) => {
        if (i === 12) return
        const c = i % 5
        expect(n).toBeGreaterThanOrEqual(c * 15 + 1)
        expect(n).toBeLessThanOrEqual(c * 15 + 15)
      })
    }
  })
  it('builds 1~25 cards', () => {
    const card = makeCard('25', mulberry32(1))
    expect([...card].sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1))
    expect(initialMarks(card).some(Boolean)).toBe(false)
  })
  it('call order covers every number once', () => {
    expect(new Set(callOrder('75', mulberry32(2))).size).toBe(75)
    expect(callOrder('25').length).toBe(25)
  })
})

describe('bingo lines', () => {
  it('counts rows, columns and diagonals', () => {
    const m = Array<boolean>(25).fill(false)
    expect(countLines(m)).toBe(0)
    for (let c = 0; c < 5; c++) m[c] = true // top row
    expect(countLines(m)).toBe(1)
    for (let r = 0; r < 5; r++) m[r * 5] = true // left column
    expect(countLines(m)).toBe(2)
    for (const i of [6, 12, 18, 24]) m[i] = true // diagonal
    expect(countLines(m)).toBe(3)
    expect(countLines(Array(25).fill(true))).toBe(12)
  })
  it('free center helps the middle lines', () => {
    const card = makeCard('75', mulberry32(9))
    const m = initialMarks(card)
    expect(m[12]).toBe(true)
    expect(closestLineMissing(m)).toBe(4)
  })
  it('auto-marks called numbers and validates human marks', () => {
    const card = makeCard('25', mulberry32(5))
    const called = [card[0], card[1], card[2], card[3], card[4]]
    const marked = autoMark(card, initialMarks(card), called)
    expect(countLines(marked)).toBe(1)
    expect(canMark(card, 0, called)).toBe(true)
    expect(canMark(card, 5, called)).toBe(false)
    expect(winnersFor([marked, initialMarks(card)], 1)).toEqual([0])
    expect(winnersFor([marked], 2)).toEqual([])
  })
  it('labels balls', () => {
    expect(label(1, '75')).toBe('B-1')
    expect(label(31, '75')).toBe('N-31')
    expect(label(75, '75')).toBe('O-75')
    expect(label(7, '25')).toBe('7')
  })
})
