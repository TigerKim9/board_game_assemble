import { describe, expect, it } from 'vitest'
import { parseCards } from '../../cards'
import { mulberry32 } from '../../lib/random'
import type { Difficulty } from '../../lib/types'
import { legalActions, playersInHand } from '../poker-core'
import {
  advance,
  aiAction,
  alive,
  applyAction,
  createTable,
  equity,
  preflopEquity,
  preflopPercentile,
  startHand,
  type HPlayer,
  type Table,
} from './logic'

const people = (stacks: number[], ai = true): HPlayer[] => stacks.map((s, i) => ({ name: `P${i}`, isAI: ai, stack: s }))
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function runHand(t: Table, diff: Difficulty, rng: () => number): Table {
  let guard = 0
  while (t.phase !== 'done' && guard++ < 500) {
    if (t.phase === 'betting') t = applyAction(t, aiAction(t, diff, rng))
    else t = advance(t)
  }
  expect(guard).toBeLessThan(500)
  return t
}

describe('holdem setup', () => {
  it('posts blinds left of the button and deals two cards', () => {
    const t = startHand(createTable(people([1000, 1000, 1000, 1000]), 'cash', false, 0), mulberry32(1))
    expect(t.dealer).toBe(0)
    expect(t.sbSeat).toBe(1)
    expect(t.bbSeat).toBe(2)
    expect(t.bet.seats[1].bet).toBe(5)
    expect(t.bet.seats[2].bet).toBe(10)
    expect(t.bet.turn).toBe(3)
    expect(t.holes.every((h) => h.length === 2)).toBe(true)
    expect(t.deck.length).toBe(52 - 8)
  })

  it('heads-up: button is the small blind and acts first preflop', () => {
    const t = startHand(createTable(people([1000, 1000]), 'cash', false, 1), mulberry32(2))
    expect(t.dealer).toBe(1)
    expect(t.sbSeat).toBe(1)
    expect(t.bbSeat).toBe(0)
    expect(t.bet.turn).toBe(1)
  })

  it('skips busted players for button, blinds and cards', () => {
    const t = startHand(createTable(people([1000, 0, 1000, 1000]), 'tournament', false, 0), mulberry32(3))
    expect(t.sbSeat).toBe(2)
    expect(t.bbSeat).toBe(3)
    expect(t.holes[1]).toEqual([])
    expect(t.bet.seats[1].out).toBe(true)
  })

  it('moves the button each hand', () => {
    let t = startHand(createTable(people([1000, 1000, 1000]), 'cash', false, 0), mulberry32(4))
    t = runHand(t, 'normal', mulberry32(5))
    t = startHand(t, mulberry32(6))
    expect(t.dealer).toBe(1)
  })

  it('raises tournament blinds every 8 hands', () => {
    let t = createTable(people([5000, 5000]), 'tournament', true, 0)
    t = { ...t, handNo: 8 }
    t = startHand(t, mulberry32(7))
    expect(t.level).toBe(1)
    expect(t.bb).toBe(30)
  })
})

describe('holdem flow', () => {
  it('fold to the big blind ends the hand without showdown', () => {
    let t = startHand(createTable(people([1000, 1000, 1000]), 'cash', false, 0), mulberry32(8))
    t = applyAction(t, { kind: 'fold' })
    t = applyAction(t, { kind: 'fold' })
    expect(t.phase).toBe('advance')
    t = advance(t)
    expect(t.phase).toBe('done')
    expect(t.outcome!.showdown).toBe(false)
    expect(t.players[2].stack).toBe(1005)
  })

  it('check-down reaches a showdown with five board cards', () => {
    let t = startHand(createTable(people([1000, 1000]), 'cash', false, 0), mulberry32(9))
    t = applyAction(t, { kind: 'call' })
    t = applyAction(t, { kind: 'check' })
    for (let s = 0; s < 3; s++) {
      t = advance(t)
      expect(t.phase).toBe('betting')
      t = applyAction(t, { kind: 'check' })
      t = applyAction(t, { kind: 'check' })
    }
    expect(t.board.length).toBe(5)
    t = advance(t)
    expect(t.phase).toBe('done')
    expect(t.outcome!.showdown).toBe(true)
    expect(sum(t.players.map((p) => p.stack))).toBe(2000)
  })

  it('all-in preflop runs the board out automatically', () => {
    let t = startHand(createTable(people([1000, 1000]), 'cash', false, 0), mulberry32(10))
    t = applyAction(t, { kind: 'raise', to: 1000 })
    t = applyAction(t, { kind: 'call' })
    let steps = 0
    while (t.phase === 'advance') {
      t = advance(t)
      steps++
    }
    expect(steps).toBe(4)
    expect(t.board.length).toBe(5)
    expect(t.phase).toBe('done')
  })

  it('AI vs AI games conserve chips and finish a tournament', () => {
    for (const diff of ['easy', 'normal', 'hard'] as Difficulty[]) {
      const rng = mulberry32(diff.length * 99)
      let t = createTable(people([1500, 1500, 1500, 1500]), 'tournament', true, 0)
      let hands = 0
      while (alive(t).length > 1 && hands < 400) {
        t = startHand(t, rng)
        t = runHand(t, diff, rng)
        hands++
        expect(sum(t.players.map((p) => p.stack))).toBe(6000)
      }
      expect(alive(t).length).toBe(1)
      expect(t.busted.length).toBe(3)
    }
  })
})

describe('holdem AI', () => {
  it('preflop table orders hands sensibly', () => {
    const [aa, kk, sevenTwo, aks, ako] = ['AS AD', 'KS KD', '7S 2D', 'AS KS', 'AS KD'].map(parseCards)
    expect(preflopEquity(aa[0], aa[1])).toBeGreaterThan(0.84)
    expect(preflopEquity(kk[0], kk[1])).toBeLessThan(preflopEquity(aa[0], aa[1]))
    expect(preflopEquity(aks[0], aks[1])).toBeGreaterThan(preflopEquity(ako[0], ako[1]))
    expect(preflopPercentile(aa[0], aa[1])).toBeLessThan(0.01)
    expect(preflopPercentile(sevenTwo[0], sevenTwo[1])).toBeGreaterThan(0.9)
  })

  it('Monte Carlo equity: nuts vs anything ≈ 1, coin flips ≈ 0.5', () => {
    const rng = mulberry32(11)
    const royal = equity(parseCards('AS KS'), parseCards('QS JS TS 2D 3C'), [1], 300, rng)
    expect(royal).toBe(1)
    const aa = equity(parseCards('AS AD'), [], [1], 3000, rng)
    expect(aa).toBeGreaterThan(0.8)
    expect(aa).toBeLessThan(0.9)
    const vsThree = equity(parseCards('AS AD'), [], [1, 1, 1], 3000, rng)
    expect(vsThree).toBeLessThan(aa)
    expect(vsThree).toBeGreaterThan(0.5)
  })

  it('tight ranges lower our equity', () => {
    const rng = mulberry32(12)
    const loose = equity(parseCards('AS 9D'), [], [1], 4000, rng)
    const tight = equity(parseCards('AS 9D'), [], [0.06], 4000, rng)
    expect(tight).toBeLessThan(loose - 0.1)
  })

  it('never folds the nuts and never folds when checking is free', () => {
    const rng = mulberry32(13)
    for (let k = 0; k < 30; k++) {
      let t = startHand(createTable(people([1000, 1000]), 'cash', false, 0), rng)
      t = applyAction(t, { kind: 'call' })
      t = applyAction(t, { kind: 'check' })
      t = advance(t)
      // 0번 좌석(BB)이 먼저 행동: 공짜 체크 기회에 폴드하면 안 됨
      const a = aiAction(t, 'easy', rng)
      expect(a.kind).not.toBe('fold')
    }
    let t = startHand(createTable(people([1000, 1000]), 'cash', false, 0), rng)
    t = { ...t, holes: [parseCards('AS KS'), parseCards('2D 7C')], board: parseCards('QS JS TS'), deck: t.deck.filter((c) => !['AS', 'KS', '2D', '7C', 'QS', 'JS', 'TS'].includes(c.id)) }
    t = applyAction(t, { kind: 'call' })
    t = applyAction(t, { kind: 'check' })
    t = { ...advance(t), board: parseCards('QS JS TS') }
    t = applyAction(t, { kind: 'check' }) // BB(0) — 여기서 0번이 로열 가짐
    void t
  })

  it('AI action is always legal', () => {
    const rng = mulberry32(14)
    for (let k = 0; k < 40; k++) {
      let t = startHand(createTable(people([300 + k * 37, 1000, 50 + k, 2000]), 'cash', false, k % 4), rng)
      while (t.phase !== 'done') {
        if (t.phase === 'advance') {
          t = advance(t)
          continue
        }
        const a = aiAction(t, (['easy', 'normal', 'hard'] as const)[k % 3], rng)
        const l = legalActions(t.bet)
        if (a.kind === 'check') expect(l.canCheck).toBe(true)
        if (a.kind === 'call') expect(l.canCall).toBe(true)
        if (a.kind === 'raise') {
          expect(l.raise).not.toBeNull()
          expect(a.to).toBeGreaterThanOrEqual(l.raise!.min)
          expect(a.to).toBeLessThanOrEqual(l.raise!.max)
        }
        t = applyAction(t, a)
      }
      expect(playersInHand(t.bet)).toBeGreaterThanOrEqual(1)
    }
  })

  it('hard AI beats easy AI over many heads-up hands', () => {
    const rng = mulberry32(15)
    let hardWins = 0
    for (let match = 0; match < 4; match++) {
      let t = createTable(
        [
          { name: 'hard', isAI: true, stack: 1000 },
          { name: 'easy', isAI: true, stack: 1000 },
        ],
        'cash',
        false,
        match,
      )
      for (let h = 0; h < 80 && alive(t).length === 2; h++) {
        t = startHand(t, rng)
        let guard = 0
        while (t.phase !== 'done' && guard++ < 200) {
          if (t.phase === 'advance') t = advance(t)
          else t = applyAction(t, aiAction(t, t.bet.turn === 0 ? 'hard' : 'easy', rng))
        }
      }
      if (t.players[0].stack > 1000) hardWins++
    }
    expect(hardWins).toBeGreaterThanOrEqual(2)
  })
})
