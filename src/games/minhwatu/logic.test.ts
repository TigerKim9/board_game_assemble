import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { eulReul, euroRo, aiChoose, aiPlay, chooseFlip, chooseHand, deal, flip, playCard, ranking, scoreOf, type MState } from './logic'

const base = (over: Partial<MState>): MState => ({
  players: [
    { name: 'A', isAI: false, hand: [], captured: [] },
    { name: 'B', isAI: true, hand: [], captured: [] },
  ],
  floor: [],
  deck: [],
  turn: 0,
  phase: { kind: 'play' },
  message: '',
  flipped: null,
  played: null,
  ...over,
})

describe('minhwatu scoring', () => {
  it('counts card points', () => {
    expect(scoreOf([0, 1, 2, 4]).base).toBe(20 + 5 + 0 + 10)
  })
  it('adds yaks', () => {
    const s = scoreOf([1, 5, 9]) // 홍단
    expect(s.yaks.map((y) => y.name)).toEqual(['홍단'])
    expect(s.total).toBe(15 + 30)
    expect(scoreOf([44, 45, 46, 47]).yaks.map((y) => y.name)).toEqual(['비약'])
    expect(scoreOf([12, 13, 14, 15]).yaks.map((y) => y.name)).toEqual(['초약(흑싸리)'])
  })
  it('totals 240 base points for the whole deck', () => {
    expect(scoreOf(Array.from({ length: 48 }, (_, i) => i)).base).toBe(240)
  })
})

describe('josa', () => {
  it('picks particles', () => {
    expect(eulReul('비광')).toBe('비광을')
    expect(eulReul('송학 피')).toBe('송학 피를')
    expect(euroRo('공산 광')).toBe('공산 광으로')
    expect(euroRo('국화 피')).toBe('국화 피로')
    expect(euroRo('공산 기러기')).toBe('공산 기러기로')
  })
})

describe('minhwatu flow', () => {
  it('deals 10/8 for two and 7/6 for three', () => {
    const s = deal([{ name: 'a', isAI: false }, { name: 'b', isAI: true }], mulberry32(1))
    expect(s.players[0].hand).toHaveLength(10)
    expect(s.floor).toHaveLength(8)
    expect(s.deck).toHaveLength(20)
    const t = deal([{ name: 'a', isAI: false }, { name: 'b', isAI: true }, { name: 'c', isAI: true }], mulberry32(1))
    expect(t.players[2].hand).toHaveLength(7)
    expect(t.floor).toHaveLength(6)
    expect(t.deck).toHaveLength(21)
  })
  it('captures a single match, then flips', () => {
    let s = base({ floor: [1, 20], deck: [40] })
    s.players[0].hand = [0, 30]
    s = playCard(s, 0)
    expect(s.players[0].captured).toEqual([0, 1])
    expect(s.phase.kind).toBe('flip')
    s = flip(s)
    expect(s.floor).toEqual([20, 40])
    expect(s.turn).toBe(1)
  })
  it('asks to choose between two matches', () => {
    let s = base({ floor: [1, 2, 20], deck: [21] })
    s.players[0].hand = [0, 30]
    s = playCard(s, 0)
    expect(s.phase).toEqual({ kind: 'chooseHand', card: 0, options: [1, 2] })
    s = chooseHand(s, 2)
    expect(s.players[0].captured).toEqual([0, 2])
    s = flip(s) // 21 matches 20
    expect(s.players[0].captured).toEqual([0, 2, 21, 20])
  })
  it('takes all three when the fourth is played', () => {
    let s = base({ floor: [1, 2, 3], deck: [10] })
    s.players[0].hand = [0, 30]
    s = playCard(s, 0)
    expect(s.players[0].captured.sort()).toEqual([0, 1, 2, 3])
  })
  it('flip choice', () => {
    let s = base({ floor: [5, 6], deck: [4] })
    s.players[0].hand = [30, 31]
    s = playCard(s, 30)
    s = flip(s)
    expect(s.phase.kind).toBe('chooseFlip')
    s = chooseFlip(s, 6)
    expect(s.players[0].captured).toEqual([4, 6])
  })
  it('AI plays full random games to the end with all cards accounted for', () => {
    for (const n of [2, 3]) {
      for (const diff of ['easy', 'normal', 'hard'] as const) {
        const rng = mulberry32(n * 10 + diff.length)
        let s = deal(
          Array.from({ length: n }, (_, i) => ({ name: `p${i}`, isAI: true })),
          rng,
        )
        let guard = 0
        while (s.phase.kind !== 'over' && guard++ < 500) {
          if (s.phase.kind === 'play') s = playCard(s, aiPlay(s, diff, rng))
          else if (s.phase.kind === 'flip') s = flip(s)
          else if (s.phase.kind === 'chooseHand') s = chooseHand(s, aiChoose(s, diff, rng))
          else if (s.phase.kind === 'chooseFlip') s = chooseFlip(s, aiChoose(s, diff, rng))
        }
        expect(s.phase.kind).toBe('over')
        expect(s.deck).toHaveLength(0)
        const all = [...s.floor, ...s.players.flatMap((p) => p.captured)]
        expect(all.sort((a, b) => a - b)).toEqual(Array.from({ length: 48 }, (_, i) => i))
        expect(ranking(s)).toHaveLength(n)
      }
    }
  })
  it('AI prefers capturing a gwang', () => {
    const s = base({ floor: [29, 22] })
    s.players[0].hand = [28, 21] // 8월 광 ↔ 8월 열끗, 6월 띠 ↔ 6월 피
    expect(aiPlay(s, 'hard', mulberry32(1))).toBe(28)
  })
  it('hard AI beats easy AI on average', () => {
    let hardWins = 0
    let games = 0
    const rng = mulberry32(42)
    for (let g = 0; g < 60; g++) {
      let s = deal(
        [
          { name: 'h', isAI: true },
          { name: 'e', isAI: true },
        ],
        rng,
        g % 2,
      )
      const diffOf = (i: number) => (i === 0 ? 'hard' : 'easy')
      while (s.phase.kind !== 'over') {
        const d = diffOf(s.turn)
        if (s.phase.kind === 'play') s = playCard(s, aiPlay(s, d, rng))
        else if (s.phase.kind === 'flip') s = flip(s)
        else s = s.phase.kind === 'chooseHand' ? chooseHand(s, aiChoose(s, d, rng)) : chooseFlip(s, aiChoose(s, d, rng))
      }
      const r = ranking(s)
      if (r[0].score.total !== r[1].score.total) {
        games++
        if (r[0].i === 0) hardWins++
      }
    }
    expect(hardWins / games).toBeGreaterThan(0.55)
  })
})
