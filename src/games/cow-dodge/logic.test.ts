import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { aiChooseCard, aiChooseRow, cheapestRow, deal, heads, placeCard, resolveAll, sumHeads, takeRow, targetRow } from './logic'

describe('cow-dodge cards', () => {
  it('assigns heads', () => {
    expect(heads(55)).toBe(7)
    expect(heads(22)).toBe(5)
    expect(heads(30)).toBe(3)
    expect(heads(15)).toBe(2)
    expect(heads(7)).toBe(1)
    let total = 0
    for (let c = 1; c <= 104; c++) total += heads(c)
    expect(total).toBe(171)
  })
  it('deals 10 cards each and 4 rows without overlap', () => {
    const d = deal(10, mulberry32(1))
    const all = [...d.hands.flat(), ...d.rows.flat()]
    expect(all.length).toBe(104)
    expect(new Set(all).size).toBe(104)
    expect(d.hands.every((h) => h.length === 10)).toBe(true)
  })
})

describe('cow-dodge placement', () => {
  const rows = [[10], [20, 25], [40], [3]]
  it('goes to the closest lower row end', () => {
    expect(targetRow(rows, 30)).toBe(1)
    expect(targetRow(rows, 12)).toBe(0)
    expect(targetRow(rows, 50)).toBe(2)
    expect(targetRow(rows, 2)).toBe(-1)
  })
  it('sixth card takes the row', () => {
    const full = [[1, 2, 3, 4, 5], [50], [60], [70]]
    const r = placeCard(full, 6)
    expect(r.taken).toEqual([1, 2, 3, 4, 5])
    expect(r.rows[0]).toEqual([6])
  })
  it('low card takes the chosen row', () => {
    const r = takeRow(rows, 1, 2)
    expect(r.taken).toEqual([20, 25])
    expect(r.rows[1]).toEqual([2])
  })
  it('cheapest row prefers fewer heads', () => {
    expect(cheapestRow([[55], [1, 2], [11], [10]])).toBe(1)
    expect(cheapestRow([[55], [1, 2, 3], [11], [10]])).toBe(3)
    expect(sumHeads([55, 11])).toBe(12)
  })
  it('resolves plays in ascending order', () => {
    const r = resolveAll([[10], [20], [30], [40]], [
      { player: 0, card: 21 },
      { player: 1, card: 5 },
    ])
    // 5 is lower than all: player 1 takes the cheapest row ([10], 3 heads? 10 is 3 heads; 20 is 3; 30 is 3; 40 is 3 → first)
    expect(r.taken[1]).toEqual([10])
    expect(r.rows[0]).toEqual([5])
    expect(r.rows[1]).toEqual([20, 21])
  })
})

describe('cow-dodge AI', () => {
  it('avoids being the sixth card', () => {
    const rows = [[1, 2, 3, 4, 5], [60], [70], [80]]
    const card = aiChooseCard(rows, [6, 61], 0, new Set(), 'hard', mulberry32(3))
    expect(card).toBe(61)
  })
  it('picks a row with fewest heads', () => {
    expect(aiChooseRow([[55], [1], [11], [10]], 'hard')).toBe(1)
  })
  it('returns a card from hand on every level', () => {
    const d = deal(5, mulberry32(4))
    for (const diff of ['easy', 'normal', 'hard'] as const) {
      const c = aiChooseCard(d.rows, d.hands[0], 4, new Set(), diff, mulberry32(5))
      expect(d.hands[0]).toContain(c)
    }
  })
  it('hard AI beats random play on average', () => {
    const rng = mulberry32(8)
    let smart = 0
    let dumb = 0
    for (let g = 0; g < 12; g++) {
      const d = deal(4, rng)
      let rows = d.rows
      const hands = d.hands.map((h) => h.slice())
      const seen = new Set<number>()
      for (let t = 0; t < 10; t++) {
        const plays = hands.map((h, p) => {
          const card = p === 0 ? aiChooseCard(rows, h, 3, seen, 'hard', rng) : h[Math.floor(rng() * h.length)]
          return { player: p, card }
        })
        plays.forEach(({ player, card }) => {
          hands[player].splice(hands[player].indexOf(card), 1)
          seen.add(card)
        })
        const r = resolveAll(rows, plays)
        rows = r.rows
        smart += sumHeads(r.taken[0])
        dumb += (sumHeads(r.taken[1]) + sumHeads(r.taken[2]) + sumHeads(r.taken[3])) / 3
      }
    }
    expect(smart).toBeLessThan(dumb)
  })
})
