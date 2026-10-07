import { describe, expect, it } from 'vitest'
import { parseCards } from '../../cards'
import { mulberry32 } from '../../lib/random'
import type { Difficulty } from '../../lib/types'
import { potTotal } from '../poker-core'
import {
  ANTE,
  BASE_BET,
  advance,
  aiBet,
  aiChoice,
  applyBet,
  boss,
  choose,
  createTable,
  equity,
  namedBets,
  openScore,
  solvent,
  startHand,
  type SPlayer,
  type Table,
} from './logic'

const people = (stacks: number[]): SPlayer[] => stacks.map((s, i) => ({ name: `P${i}`, isAI: true, stack: s }))
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const open = (s: string) => parseCards(s).map((card) => ({ card, open: true }))

function chooseAll(t: Table, diff: Difficulty, rng: () => number): Table {
  for (let i = 0; i < t.players.length; i++) {
    if (t.chosen[i]) continue
    const c = aiChoice(
      t.cards[i].map((x) => x.card),
      diff,
      rng,
    )
    t = choose(t, i, c.discard, c.open)
  }
  return t
}

function runHand(t: Table, diff: Difficulty, rng: () => number): Table {
  t = chooseAll(t, diff, rng)
  let guard = 0
  while (t.phase !== 'done' && guard++ < 300) {
    if (t.phase === 'betting') t = applyBet(t, aiBet(t, diff, rng))
    else t = advance(t)
  }
  expect(guard).toBeLessThan(300)
  return t
}

describe('seven poker deal & choice', () => {
  it('antes and deals four hidden cards', () => {
    const t = startHand(createTable(people([1000, 1000, 1000])), mulberry32(1))
    expect(t.phase).toBe('choice')
    expect(potTotal(t.bet)).toBe(ANTE * 3)
    expect(t.cards.every((h) => h.length === 4 && h.every((c) => !c.open))).toBe(true)
  })

  it('choice discards one, opens one, then deals the 4th card open', () => {
    let t = startHand(createTable(people([1000, 1000])), mulberry32(2))
    const keepOpen = t.cards[0][2].card
    const discarded = t.cards[0][0].card
    t = choose(t, 0, 0, 2)
    expect(t.cards[0].length).toBe(3)
    expect(t.cards[0].some((c) => c.card.id === discarded.id)).toBe(false)
    expect(t.cards[0].find((c) => c.card.id === keepOpen.id)!.open).toBe(true)
    expect(t.phase).toBe('choice')
    t = choose(t, 1, 3, 1)
    expect(t.phase).toBe('betting')
    expect(t.round).toBe(4)
    expect(t.cards.every((h) => h.length === 4 && h.filter((c) => c.open).length === 2)).toBe(true)
  })

  it('rejects choosing the same card for both', () => {
    const t = startHand(createTable(people([1000, 1000])), mulberry32(3))
    expect(choose(t, 0, 1, 1)).toBe(t)
  })
})

describe('boss and named bets', () => {
  it('best open cards act first', () => {
    expect(openScore(open('5S 5D'))).toBeGreaterThan(openScore(open('AS KD')))
    expect(openScore(open('KS'))).toBeGreaterThan(openScore(open('KH'))) // 무늬로 동점 깨기
    let t = startHand(createTable(people([1000, 1000, 1000])), mulberry32(4))
    t = chooseAll(t, 'normal', mulberry32(5))
    expect(t.bet.turn).toBe(boss(t))
  })

  it('bets: 삥 when no bet, 따당 doubles, 하프 = call + half pot', () => {
    let t = startHand(createTable(people([10000, 10000, 10000])), mulberry32(6))
    t = chooseAll(t, 'normal', mulberry32(7))
    const names = namedBets(t).map((b) => b.name)
    expect(names).toEqual(['die', 'check', 'bbing', 'half', 'full'])
    const pot = potTotal(t.bet) // 60
    expect(namedBets(t).find((b) => b.name === 'half')!.to).toBe(pot / 2)
    t = applyBet(t, 'bbing')
    expect(t.bet.currentBet).toBe(BASE_BET)
    const bets = namedBets(t)
    expect(bets.map((b) => b.name)).toEqual(['die', 'call', 'ddadang', 'half', 'full'])
    expect(bets.find((b) => b.name === 'ddadang')!.to).toBe(BASE_BET * 2)
    // 하프: 콜(20) 후 판돈 100의 절반 50 → 20 + 50 = 70
    expect(bets.find((b) => b.name === 'half')!.to).toBe(20 + (pot + 20 + 20) / 2)
    expect(bets.find((b) => b.name === 'full')!.to).toBe(20 + pot + 20 + 20)
  })

  it('bets turn into all-in when short', () => {
    let t = startHand(createTable(people([10000, 100, 10000])), mulberry32(8))
    t = chooseAll(t, 'normal', mulberry32(9))
    // 짧은 스택(1) 차례가 될 때까지 하프
    let guard = 0
    while (t.bet.turn !== 1 && guard++ < 5) t = applyBet(t, namedBets(t).some((b) => b.name === 'half') ? 'half' : 'call')
    const bets = namedBets(t)
    expect(bets.some((b) => b.allIn)).toBe(true)
  })

  it('folding to one player ends the hand', () => {
    let t = startHand(createTable(people([1000, 1000])), mulberry32(10))
    t = chooseAll(t, 'normal', mulberry32(11))
    const first = t.bet.turn
    t = applyBet(t, 'bbing')
    t = applyBet(t, 'die')
    expect(t.phase).toBe('advance')
    t = advance(t)
    expect(t.phase).toBe('done')
    expect(t.outcome!.showdown).toBe(false)
    expect(t.players[first].stack).toBe(1000 + ANTE)
  })
})

describe('full hands', () => {
  it('check-down deals 7 cards (2 hidden + 4 open + 1 hidden) and shows down', () => {
    let t = startHand(createTable(people([1000, 1000, 1000])), mulberry32(12))
    t = chooseAll(t, 'normal', mulberry32(13))
    while (t.phase !== 'done') {
      if (t.phase === 'betting') t = applyBet(t, 'check')
      else t = advance(t)
    }
    expect(t.cards.every((h) => h.length === 7)).toBe(true)
    expect(t.cards.every((h) => h.filter((c) => c.open).length === 4)).toBe(true)
    expect(t.outcome!.showdown).toBe(true)
    expect(sum(t.players.map((p) => p.stack))).toBe(3000)
  })

  it('seven players: last card becomes a community card when the deck runs short', () => {
    let t = startHand(createTable(people([1000, 1000, 1000, 1000, 1000, 1000, 1000])), mulberry32(14))
    t = chooseAll(t, 'normal', mulberry32(15))
    while (t.phase !== 'done') {
      if (t.phase === 'betting') t = applyBet(t, 'check')
      else t = advance(t)
    }
    expect(t.community).not.toBeNull()
    expect(t.cards.every((h) => h.length === 6)).toBe(true)
    const ids = new Set([...t.cards.flat().map((c) => c.card.id), t.community!.id])
    expect(ids.size).toBe(43)
  })

  it('AI-only sessions conserve chips', () => {
    for (const diff of ['easy', 'normal', 'hard'] as Difficulty[]) {
      const rng = mulberry32(diff.length * 31)
      let t = createTable(people([3000, 3000, 3000, 3000, 3000]))
      for (let h = 0; h < 25 && solvent(t).length > 1; h++) {
        t = startHand(t, rng)
        t = runHand(t, diff, rng)
        expect(sum(t.players.map((p) => p.stack))).toBe(15000)
        expect(t.players.every((p) => p.stack >= 0)).toBe(true)
      }
    }
  })
})

describe('seven poker AI', () => {
  it('choice keeps a pair hidden and discards the junk', () => {
    const hand = parseCards('9S 9D 2C KH')
    const c = aiChoice(hand, 'hard')
    expect(c.discard).toBe(2)
    expect(c.open).toBe(3)
  })

  it('equity uses visible cards: made quads ≈ 1', () => {
    let t = startHand(createTable(people([1000, 1000])), mulberry32(16))
    t = chooseAll(t, 'normal', mulberry32(17))
    const quads = parseCards('AS AD AH AC')
    const used = new Set(quads.map((c) => c.id))
    t = {
      ...t,
      cards: [
        quads.map((card, k) => ({ card, open: k >= 2 })),
        t.cards[1].filter((c) => !used.has(c.card.id)).slice(0, 4),
      ],
    }
    expect(equity(t, 0, 200, mulberry32(18))).toBeGreaterThan(0.95)
  })

  it('AI picks only available bets', () => {
    const rng = mulberry32(19)
    for (let k = 0; k < 20; k++) {
      let t = startHand(createTable(people([2000, 500 + k * 50, 3000, 800])), rng)
      t = chooseAll(t, 'hard', rng)
      while (t.phase !== 'done') {
        if (t.phase === 'advance') {
          t = advance(t)
          continue
        }
        const b = aiBet(t, (['easy', 'normal', 'hard'] as const)[k % 3], rng)
        expect(namedBets(t).map((x) => x.name)).toContain(b)
        t = applyBet(t, b)
      }
    }
  })
})
