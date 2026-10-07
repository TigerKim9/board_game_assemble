import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import {
  aiAction,
  atLeast,
  bidChance,
  challenge,
  countMatching,
  isHigher,
  minRaise,
  newLiar,
  nextRound,
  placeBid,
} from './logic'

const players = [
  { name: 'A', isAI: false },
  { name: 'B', isAI: true },
  { name: 'C', isAI: true },
]

describe('liars dice rules', () => {
  it('orders bids', () => {
    expect(isHigher({ qty: 3, face: 4 }, { qty: 3, face: 3 })).toBe(true)
    expect(isHigher({ qty: 3, face: 2 }, { qty: 3, face: 3 })).toBe(false)
    expect(isHigher({ qty: 4, face: 2 }, { qty: 3, face: 6 })).toBe(true)
    expect(minRaise({ qty: 3, face: 6 }, true)).toEqual({ qty: 4, face: 2 })
    expect(minRaise(null, false)).toEqual({ qty: 1, face: 1 })
  })
  it('counts wild ones', () => {
    expect(countMatching([1, 1, 4, 4, 5], 4, true)).toBe(4)
    expect(countMatching([1, 1, 4, 4, 5], 4, false)).toBe(2)
  })
  it('binomial tail', () => {
    expect(atLeast(5, 0, 0.5)).toBe(1)
    expect(atLeast(2, 3, 0.5)).toBe(0)
    expect(atLeast(2, 1, 0.5)).toBeCloseTo(0.75)
  })
  it('challenge: bidder loses when the bid is false', () => {
    let s = newLiar(players, true, [[2, 2, 3, 4, 5], [1, 3, 3, 6, 6], [2, 4, 5, 5, 6]])
    s = placeBid(s, { qty: 4, face: 2 }) // A: 2s → actual 2,2,1(wild),2 = 4
    s = placeBid(s, { qty: 5, face: 2 }) // B
    s = challenge(s) // C calls
    expect(s.reveal?.actual).toBe(4)
    expect(s.reveal?.loser).toBe(1)
    s = nextRound(s)
    expect(s.hands.map((h) => h.length)).toEqual([5, 4, 5])
    expect(s.turn).toBe(1)
  })
  it('challenge: challenger loses when the bid holds', () => {
    let s = newLiar(players, false, [[6, 6, 6, 1, 1], [6, 2, 3, 4, 5], [2, 3, 4, 5, 2]])
    s = placeBid(s, { qty: 4, face: 6 })
    s = challenge(s)
    expect(s.reveal?.loser).toBe(1)
  })
  it('rejects lower bids and wild-face bids', () => {
    let s = newLiar(players, true)
    s = placeBid(s, { qty: 3, face: 4 })
    expect(placeBid(s, { qty: 3, face: 3 })).toBe(s)
    expect(placeBid(s, { qty: 4, face: 1 })).toBe(s)
  })
  it('eliminates and ends the game', () => {
    let s = newLiar(players, false, [[6], [], [2]])
    s = { ...s, turn: 0 }
    s = placeBid(s, { qty: 2, face: 6 })
    s = challenge(s)
    expect(s.turn).toBe(2)
    expect(s.reveal?.loser).toBe(0)
    s = nextRound(s)
    expect(s.phase).toBe('over')
    expect(s.winner).toBe(2)
  })
})

describe('liars dice AI', () => {
  it('chance is 1 when the bid is in hand', () => {
    expect(bidChance({ qty: 3, face: 5 }, [5, 5, 5, 2, 3], 15, false)).toBe(1)
  })
  it('calls an impossible bid', () => {
    expect(aiAction([2, 3, 4, 5, 6], 10, { qty: 9, face: 6 }, false, 'hard').type).toBe('challenge')
    expect(aiAction([2, 3, 4, 5, 6], 10, { qty: 11, face: 6 }, false, 'easy').type).toBe('challenge')
  })
  it('raises a modest bid it believes', () => {
    const a = aiAction([4, 4, 4, 1, 2], 15, { qty: 3, face: 3 }, true, 'hard', mulberry32(3))
    expect(a.type).toBe('bid')
    if (a.type === 'bid') expect(isHigher(a.bid, { qty: 3, face: 3 })).toBe(true)
  })
  it('opens with a legal bid', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      for (let seed = 1; seed < 20; seed++) {
        const a = aiAction([1, 3, 3, 5, 6], 20, null, true, d, mulberry32(seed))
        expect(a.type).toBe('bid')
        if (a.type === 'bid') {
          expect(a.bid.face).not.toBe(1)
          expect(a.bid.qty).toBeGreaterThanOrEqual(1)
          expect(a.bid.qty).toBeLessThanOrEqual(20)
        }
      }
    }
  })
  it('always returns a legal action', () => {
    const rng = mulberry32(9)
    for (let i = 0; i < 200; i++) {
      const cur = { qty: 1 + Math.floor(rng() * 12), face: 2 + Math.floor(rng() * 5) }
      const a = aiAction([1, 2, 3, 4, 5], 12, cur, true, 'normal', rng)
      if (a.type === 'bid') {
        expect(isHigher(a.bid, cur)).toBe(true)
        expect(a.bid.qty).toBeLessThanOrEqual(12)
      }
    }
  })
})

describe('liars dice full game', () => {
  it('AI-only games always finish with one winner', () => {
    for (let g = 0; g < 30; g++) {
      let s = newLiar(players.map((p) => ({ ...p, isAI: true })), g % 2 === 0)
      let steps = 0
      while (s.phase !== 'over' && steps++ < 2000) {
        if (s.phase === 'reveal') s = nextRound(s)
        else {
          const cur = s.bids.length ? s.bids[s.bids.length - 1].bid : null
          const total = s.hands.reduce((a, h) => a + h.length, 0)
          const a = aiAction(s.hands[s.turn], total, cur, s.wild, (['easy', 'normal', 'hard'] as const)[g % 3])
          const next = a.type === 'challenge' ? challenge(s) : placeBid(s, a.bid)
          expect(next).not.toBe(s)
          s = next
        }
      }
      expect(s.phase).toBe('over')
      expect(s.hands.filter((h) => h.length > 0).length).toBe(1)
    }
  })
})
