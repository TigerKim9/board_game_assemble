import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { makeCard, parseCards, type Card } from '../../cards/deck'
import {
  aiMove,
  allCombos,
  analyze,
  beats,
  giveBack,
  newGame,
  pass,
  play,
  standings,
  startRound,
  strength,
  titlesFor,
  type Options,
  type PRState,
} from './logic'

const JK = makeCard('S', 0)
const ids = (t: string) => parseCards(t).map((c) => c.id)
const OPTS: Options = { jokers: false, revolution: true, rounds: 3 }

function setup(hands: Card[][], extra: Partial<PRState> = {}): PRState {
  const base = newGame(hands.map((_, i) => `P${i}`), OPTS, mulberry32(1))
  return { ...base, hands, turn: 0, current: null, passed: hands.map(() => false), finished: [], log: [], ...extra }
}

describe('president ranks and combos', () => {
  it('2 is the strongest rank, 3 the weakest, joker above all', () => {
    const [c3, cA, c2] = parseCards('3S AS 2S')
    expect(strength(c3)).toBeLessThan(strength(cA))
    expect(strength(cA)).toBeLessThan(strength(c2))
    expect(strength(JK)).toBeGreaterThan(strength(c2))
  })
  it('analyzes same-rank sets with wild jokers', () => {
    expect(analyze(parseCards('7S 7H'))).toMatchObject({ count: 2, level: 4 })
    expect(analyze(parseCards('7S 8H'))).toBeNull()
    expect(analyze([...parseCards('9S'), JK])).toMatchObject({ count: 2, level: 6 })
    expect(analyze([JK])).toMatchObject({ count: 1, level: 13 })
    expect(analyze(parseCards('5S 5H 5D 5C 5S'))).toBeNull()
  })
  it('beats needs the same count and a higher rank; revolution flips', () => {
    const p7 = analyze(parseCards('7S 7H'))!
    const p9 = analyze(parseCards('9S 9H'))!
    const s9 = analyze(parseCards('9S'))!
    expect(beats(p9, p7, false)).toBe(true)
    expect(beats(p7, p9, false)).toBe(false)
    expect(beats(s9, p7, false)).toBe(false)
    expect(beats(p7, p9, true)).toBe(true)
    expect(beats(analyze([JK])!, analyze(parseCards('3S'))!, true)).toBe(true)
  })
  it('lists combos including joker fills', () => {
    const c = allCombos([...parseCards('4S 4H 9C'), JK])
    expect(c.some((x) => x.count === 3 && x.level === 1)).toBe(true)
    expect(c.some((x) => x.count === 2 && x.level === 6)).toBe(true)
    expect(c.some((x) => x.count === 1 && x.level === 13)).toBe(true)
  })
})

describe('president tricks', () => {
  it('trick ends when everyone else passes; last player leads', () => {
    let s = setup([parseCards('5S 9H'), parseCards('6S 3D'), parseCards('4C 3C')])
    s = play(s, 0, ids('5S'))
    expect(s.turn).toBe(1)
    s = play(s, 1, ids('6S'))
    s = pass(s, 2)
    expect(s.turn).toBe(0)
    s = pass(s, 0)
    expect(s.current).toBeNull()
    expect(s.turn).toBe(1)
  })
  it('rejects weaker or mismatched plays and passing on a lead', () => {
    let s = setup([parseCards('5S 9H 9D'), parseCards('6S 3D'), parseCards('4C 3C')])
    expect(pass(s, 0)).toBe(s)
    s = play(s, 0, ids('9H 9D'))
    expect(play(s, 1, ids('6S'))).toBe(s)
  })
  it('passed players sit out until the trick ends', () => {
    let s = setup([parseCards('5S 9H KD'), parseCards('6S 3D 8D'), parseCards('4C 3C 7C')])
    s = play(s, 0, ids('5S'))
    s = pass(s, 1)
    s = play(s, 2, ids('7C'))
    expect(s.turn).toBe(0) // player 1 skipped
    s = play(s, 0, ids('9H'))
    s = pass(s, 2)
    expect(s.current).toBeNull()
    expect(s.turn).toBe(0)
  })
  it('four of a kind starts a revolution', () => {
    let s = setup([parseCards('5S 5H 5D 5C 9H'), parseCards('6S'), parseCards('4C')])
    s = play(s, 0, ids('5S 5H 5D 5C'))
    expect(s.revolution).toBe(true)
  })
  it('round ends with titles and points, next round exchanges cards', () => {
    let s = setup([parseCards('2S'), parseCards('6S 7S'), parseCards('4C 8C'), parseCards('3C 9C')])
    s = play(s, 0, ids('2S')) // player 0 out
    expect(s.finished).toEqual([0])
    s = pass(s, 1)
    s = pass(s, 2)
    s = pass(s, 3)
    expect(s.turn).toBe(1)
    s = play(s, 1, ids('6S'))
    s = play(s, 2, ids('8C'))
    s = play(s, 3, ids('9C'))
    s = pass(s, 1)
    s = pass(s, 2)
    s = play(s, 3, ids('3C')) // player 3 out (2nd)
    s = play(s, 1, ids('7S')) // player 1 out (3rd) → player 2 last
    expect(s.phase).toBe('roundEnd')
    expect(s.titles).toEqual(['president', 'poor', 'slave', 'vice'])
    expect(s.scores).toEqual([4, 1, 0, 3])
    // Next round: human president (seat 0) must choose 2 cards to give back.
    const r2 = startRound(s, [0], mulberry32(9))
    expect(r2.phase).toBe('exchange')
    expect(r2.pendingGive[0]).toMatchObject({ from: 0, to: 2, count: 2 })
    expect(r2.hands[0].length).toBe(15)
    const give = r2.hands[0].slice(0, 2).map((c) => c.id)
    const r3 = giveBack(r2, 0, give)
    expect(r3.phase).toBe('play')
    expect(r3.hands[0].length).toBe(13)
    expect(r3.hands[2].length).toBe(13)
    expect(r3.turn).toBe(2) // slave leads
  })
  it('titles by player count', () => {
    expect(titlesFor(3)).toEqual(['president', 'citizen', 'slave'])
    expect(titlesFor(6)).toEqual(['president', 'vice', 'citizen', 'citizen', 'poor', 'slave'])
  })
})

describe('president AI', () => {
  it('leads its lowest set without breaking pairs', () => {
    const s = setup([parseCards('4S 4H 6D KC 2S'), parseCards('6S 7S 8S 9S 10S'), parseCards('4C 8C 9C JC QC')])
    const m = aiMove(s, 0, 'normal', mulberry32(1))
    expect(m).toEqual({ type: 'play', cardIds: ids('4S 4H') })
  })
  it('finishes when it can play the whole hand', () => {
    const s = setup([parseCards('9S 9H'), parseCards('6S 7S'), parseCards('4C 8C')], {
      current: { ...analyze(parseCards('5S 5H'))!, by: 1 },
    })
    expect(aiMove(s, 0, 'hard')).toEqual({ type: 'play', cardIds: ids('9S 9H') })
  })
  it('passes when nothing beats the trick', () => {
    const s = setup([parseCards('3S 4H'), parseCards('6S 7S'), parseCards('4C 8C')], {
      current: { ...analyze(parseCards('5S'))!, by: 1 },
    })
    expect(aiMove(s, 0, 'normal')).toEqual({ type: 'pass' })
  })
  it('full AI games finish with consistent scores', () => {
    for (const diff of ['easy', 'normal', 'hard'] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        const rng = mulberry32(seed)
        const n = 3 + (seed % 4)
        let s = newGame(Array.from({ length: n }, (_, i) => `p${i}`), { jokers: seed % 2 === 0, revolution: true, rounds: 3 }, rng)
        let steps = 0
        while (s.phase !== 'over' && steps < 5000) {
          if (s.phase === 'roundEnd') s = startRound(s, [], rng)
          else {
            const m = aiMove(s, s.turn, diff, rng)
            const next = m.type === 'pass' ? pass(s, s.turn) : play(s, s.turn, m.cardIds)
            expect(next).not.toBe(s)
            s = next
          }
          steps++
        }
        expect(s.phase).toBe('over')
        expect(s.round).toBe(3)
        expect(standings(s)).toHaveLength(n)
      }
    }
  })
})
