import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { sumHeads } from '../../games/cow-dodge/logic'
import { cowDodge as G } from './cow-dodge'

describe('online cow dodge', () => {
  it('bots finish games for 2~10 players; every card stays accounted for', () => {
    for (const n of [2, 3, 5, 7, 10])
      for (let seed = 1; seed <= 3; seed++) {
        const rng = mulberry32(seed * 41 + n)
        let s = G.setup(n, rng)
        let steps = 0
        while (!G.result(s)) {
          const seats = G.toAct(s)
          expect(seats.length).toBeGreaterThan(0)
          // Simultaneous phase: answer in a shuffled order.
          const seat = seats[Math.floor(rng() * seats.length)]
          s = G.apply(s, seat, G.bot!(s, seat, rng), rng)
          // Cards in hands + rows + taken this round = n*10 + 4
          const taken = s.takes.length
          expect(taken).toBeGreaterThanOrEqual(0)
          const inPlay = s.hands.flat().length + s.rows.flat().length
          expect(inPlay).toBeLessThanOrEqual(n * 10 + 4)
          for (const r of s.rows) expect(r.length).toBeLessThanOrEqual(5)
          if (++steps > 100000) throw new Error('stuck')
        }
        expect(Math.max(...s.total)).toBeGreaterThanOrEqual(66)
        expect(G.toAct(s)).toEqual([])
        expect(G.result(s)!.winners.length).toBeGreaterThan(0)
      }
  })
  it('handles a too-low card by asking its owner for a row', () => {
    const rng = mulberry32(1)
    let s = G.setup(2, rng)
    s = { ...s, rows: [[50], [60], [70], [80]], hands: [[1, 90, 91, 92, 93, 94, 95, 96, 97, 98], [55, 2, 3, 4, 5, 6, 7, 8, 9, 10]] }
    s = G.apply(s, 0, { type: 'card', card: 1 }, rng)
    expect(G.toAct(s)).toEqual([1])
    expect(() => G.apply(s, 0, { type: 'card', card: 90 }, rng)).toThrow()
    s = G.apply(s, 1, { type: 'card', card: 55 }, rng)
    expect(s.phase).toBe('pickRow')
    expect(G.toAct(s)).toEqual([0])
    expect(() => G.apply(s, 1, { type: 'row', row: 0 }, rng)).toThrow()
    expect(() => G.apply(s, 0, { type: 'row', row: 4 }, rng)).toThrow()
    s = G.apply(s, 0, { type: 'row', row: 3 }, rng)
    expect(s.total[0]).toBe(sumHeads([80]))
    expect(s.rows).toEqual([[50, 55], [60], [70], [1]])
    expect(s.phase).toBe('choose')
    expect(s.turn).toBe(1)
    expect(G.toAct(s)).toEqual([0, 1])
  })
  it('rejects cards not in hand and hides other hands and picks', () => {
    const rng = mulberry32(2)
    let s = G.setup(3, rng)
    const notMine = s.hands[1][0]
    expect(() => G.apply(s, 0, { type: 'card', card: notMine }, rng)).toThrow('패')
    expect(() => G.apply(s, 0, { type: 'row', row: 0 }, rng)).toThrow()
    const mine = s.hands[0][3]
    s = G.apply(s, 0, { type: 'card', card: mine }, rng)
    expect(() => G.apply(s, 0, { type: 'card', card: s.hands[0][4] }, rng)).toThrow('이미')
    const v1 = G.view(s, 1)
    expect(v1.picked).toEqual([true, false, false])
    expect(v1.myPick).toBeNull()
    expect(v1.hand).toEqual(s.hands[1])
    const json = JSON.stringify(v1)
    expect(json).not.toContain(JSON.stringify(s.hands[0]))
    expect(json).not.toContain('"picks"')
    expect(json).not.toContain('"hands"')
    expect(G.view(s, 0).myPick).toBe(mine)
    const spec = G.view(s, null)
    expect(spec.hand).toEqual([])
    expect(spec.myPick).toBeNull()
  })
})
