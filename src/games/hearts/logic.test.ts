import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { parseCards, type Card } from '../../cards/deck'
import {
  aiPass,
  aiPlay,
  choosePass,
  collect,
  deal,
  legalCards,
  newGame,
  passDir,
  playCard,
  trickWinner,
  winners,
  type HState,
} from './logic'

const id = (t: string) => parseCards(t)[0].id

function setup(hands: Card[][], extra: Partial<HState> = {}): HState {
  const base = newGame(['A', 'B', 'C', 'D'], mulberry32(1))
  return { ...base, hands, phase: 'play', turn: 0, trick: [], trickNo: 1, log: [], ...extra }
}

describe('hearts passing', () => {
  it('rotates left, right, across, none', () => {
    expect([1, 2, 3, 4, 5].map(passDir)).toEqual(['left', 'right', 'across', 'none', 'left'])
  })
  it('moves three cards to the left player and starts with ♣2', () => {
    let s = newGame(['A', 'B', 'C', 'D'], mulberry32(4))
    expect(s.phase).toBe('pass')
    const picks = s.hands.map((h) => h.slice(-3).map((c) => c.id))
    for (let p = 0; p < 4; p++) s = choosePass(s, p, picks[p])
    expect(s.phase).toBe('play')
    expect(s.hands[1].map((c) => c.id)).toEqual(expect.arrayContaining(picks[0]))
    expect(s.hands.every((h) => h.length === 13)).toBe(true)
    expect(s.hands[s.turn].some((c) => c.id === 'C2')).toBe(true)
  })
  it('AI passes the queen of spades and void-makes on hard', () => {
    const hand = parseCards('QS 3S 4S AH KH 2C 5C 9C 3D 4D 6D 7D 8D')
    expect(aiPass(hand, 'normal')).toContain('S12')
    const hard = aiPass(parseCards('QS 3S 4S 5S 9H 2C 7D 8D 9D 10D JD 3H 4H'), 'hard')
    expect(hard).toContain('S12')
  })
})

describe('hearts legality', () => {
  it('first trick must start with ♣2 and carries no points', () => {
    const s = setup(
      [parseCards('2C 3C AH'), parseCards('QS KH 4D'), parseCards('5C 6C 7C'), parseCards('8C 9C 10C')],
      { trickNo: 0 },
    )
    expect(legalCards(s, 0).map((c) => c.id)).toEqual(['C2'])
    const s2 = playCard(s, 0, 'C2')
    expect(legalCards(s2, 1).map((c) => c.id)).toEqual(['D4']) // void in clubs, no points
  })
  it('must follow suit; hearts cannot lead until broken', () => {
    const s = setup([parseCards('2H 5D 9H'), parseCards('3D 4H'), parseCards('6D'), parseCards('7D')])
    expect(legalCards(s, 0).map((c) => c.id)).toEqual(['D5'])
    const s2 = playCard(s, 0, 'D5')
    expect(legalCards(s2, 1).map((c) => c.id)).toEqual(['D3'])
    const onlyHearts = setup([parseCards('2H 9H'), [], [], []])
    expect(legalCards(onlyHearts, 0)).toHaveLength(2)
  })
  it('trick winner is the highest card of the led suit', () => {
    const plays = [
      { p: 0, card: parseCards('5D')[0] },
      { p: 1, card: parseCards('AS')[0] },
      { p: 2, card: parseCards('KD')[0] },
      { p: 3, card: parseCards('9D')[0] },
    ]
    expect(trickWinner(plays)).toBe(2)
  })
})

describe('hearts scoring', () => {
  it('scores hearts and the queen and passes the lead to the winner', () => {
    let s = setup([parseCards('5D 2C'), parseCards('QS 3C'), parseCards('KD 4C'), parseCards('2H 5C')])
    s = playCard(s, 0, 'D5')
    s = playCard(s, 1, 'S12')
    s = playCard(s, 2, 'D13')
    s = playCard(s, 3, 'H2')
    expect(s.turn).toBe(-1)
    s = collect(s)
    expect(s.turn).toBe(2)
    expect(s.taken[2].length).toBe(2)
    expect(s.heartsBroken).toBe(true)
  })
  it('shooting the moon gives everyone else 26', () => {
    const all: Card[] = [...parseCards('QS 2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH')]
    let s = setup([parseCards('AC'), parseCards('2C'), parseCards('3C'), parseCards('4C')], {
      trickNo: 12,
      taken: [all.slice(0, 13), [], [], []],
    })
    // Last trick: player 0 wins and takes the remaining heart that we pre-add.
    s = { ...s, taken: [all, [], [], []] }
    s = playCard(s, 0, id('AC'))
    s = playCard(s, 1, id('2C'))
    s = playCard(s, 2, id('3C'))
    s = playCard(s, 3, id('4C'))
    s = collect(s)
    expect(s.moon).toBe(0)
    expect(s.lastHand).toEqual([0, 26, 26, 26])
    expect(s.phase).toBe('handEnd')
  })
})

describe('hearts AI', () => {
  it('ducks under the winning card and dumps the queen when void', () => {
    let s = setup([parseCards('10D'), parseCards('4D QD 2D'), [], []])
    s = playCard(s, 0, 'D10')
    expect(aiPlay(s, 1, 'normal')).toBe('D4')
    let t = setup([parseCards('10D'), parseCards('QS 4C AH'), [], []])
    t = playCard(t, 0, 'D10')
    expect(aiPlay(t, 1, 'normal')).toBe('S12')
  })
  it('full AI games reach 100 with 26 points per hand', () => {
    for (const diff of ['easy', 'normal', 'hard'] as const) {
      for (let seed = 1; seed <= 4; seed++) {
        const rng = mulberry32(seed * 7)
        let s = newGame(['A', 'B', 'C', 'D'], rng)
        let guard = 0
        while (s.phase !== 'over' && guard++ < 20000) {
          if (s.phase === 'handEnd') {
            expect(s.lastHand!.reduce((a, b) => a + b, 0) % 26).toBe(0)
            s = deal(s, rng)
          } else if (s.phase === 'pass') {
            for (let p = 0; p < 4; p++) if (!s.passSel[p]) s = choosePass(s, p, aiPass(s.hands[p], diff, rng))
          } else if (s.trick.length === 4) s = collect(s)
          else {
            const next = playCard(s, s.turn, aiPlay(s, s.turn, diff, rng))
            expect(next).not.toBe(s)
            s = next
          }
        }
        expect(s.phase).toBe('over')
        expect(Math.max(...s.scores)).toBeGreaterThanOrEqual(100)
        expect(winners(s).length).toBeGreaterThan(0)
      }
    }
  })
})
