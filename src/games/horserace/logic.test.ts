import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { TRACK, betOptions, leaderAt, makeField, oddsFor, payout, positionAt, simulateRace } from './logic'

describe('horserace', () => {
  it('gives weaker horses bigger odds', () => {
    expect(oddsFor(0.1)).toBeGreaterThan(oddsFor(0.5))
    expect(oddsFor(0.99)).toBeGreaterThanOrEqual(1.1)
    expect(oddsFor(0)).toBeLessThanOrEqual(30)
    const field = makeField(6, mulberry32(8))
    const strongest = field.reduce((a, b) => (b.strength > a.strength ? b : a))
    const weakest = field.reduce((a, b) => (b.strength < a.strength ? b : a))
    if (strongest.strength > weakest.strength + 1) expect(strongest.odds).toBeLessThan(weakest.odds)
  })
  it('every horse finishes and the order matches finish times', () => {
    const rng = mulberry32(9)
    for (let g = 0; g < 50; g++) {
      const field = makeField(2 + (g % 7), rng)
      const race = simulateRace(field, rng)
      expect(race.order).toHaveLength(field.length)
      expect(new Set(race.order).size).toBe(field.length)
      for (let k = 1; k < race.order.length; k++) {
        expect(race.finish[race.order[k - 1]]).toBeLessThanOrEqual(race.finish[race.order[k]])
      }
      const last = race.frames[race.frames.length - 1]
      expect(last.every((p) => p === TRACK)).toBe(true)
      expect(race.frames.length).toBeGreaterThan(30)
      expect(race.frames.length).toBeLessThan(200)
    }
  })
  it('stronger horses win more often', () => {
    const rng = mulberry32(5)
    let strongWins = 0
    for (let g = 0; g < 400; g++) {
      const field = [
        { id: 0, name: 'a', color: '', strength: 5, odds: 1.5 },
        { id: 1, name: 'b', color: '', strength: 1, odds: 4 },
      ]
      if (simulateRace(field, rng).order[0] === 0) strongWins++
    }
    expect(strongWins).toBeGreaterThan(220)
    expect(strongWins).toBeLessThan(400) // still an upset sometimes
  })
  it('handles bets and interpolation', () => {
    expect(payout(300, 2.5)).toBe(750)
    expect(betOptions(250)).toEqual([100, 250])
    expect(betOptions(50)).toEqual([])
    const race = simulateRace(makeField(3, mulberry32(1)), mulberry32(2))
    const p = positionAt(race, 0, 1.5)
    expect(p).toBeGreaterThanOrEqual(race.frames[1][0])
    expect(p).toBeLessThanOrEqual(race.frames[2][0])
    expect(positionAt(race, 0, 9999)).toBe(TRACK)
    expect(leaderAt(race, 0)).toBe(0)
  })
})
