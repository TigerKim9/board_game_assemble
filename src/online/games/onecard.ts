import type { Card, Suit } from '../../cards/deck'
import { SUITS } from '../../cards/deck'
import {
  aiCatches,
  aiMove,
  canPlay,
  catchOne,
  declare,
  drawTurn,
  isActive,
  newGame,
  play,
  ranking,
  top,
  type OCState,
} from '../../games/onecard/logic'
import { assertLegal, type OnlineGame } from '../engine'
import { seatTokens } from './onecard-shared'

/**
 * 원카드 online.
 * The "원카드!" race: while someone sits on one card without calling it (`vulnerable`), every other
 * active seat may send `catch` and the vulnerable seat may send `declare` — whoever's message reaches
 * the server first wins. Those extra seats appear in toAct; a seat may also `pass` (decline) so bots
 * don't block the table. Passing seats leave toAct until the next action.
 */
export interface OCOnline {
  g: OCState
  /** Seats that declined to catch / declare during the current "원카드" window. */
  passed: number[]
}

export type OneCardAction =
  | { type: 'play'; cardId: string; suit?: Suit; declare?: boolean }
  | { type: 'draw' }
  | { type: 'declare' }
  | { type: 'catch' }
  | { type: 'pass' }

export type OneCardView = Omit<OCState, 'hands' | 'pile' | 'discard' | 'watch'> & {
  counts: number[]
  /** My hand (null for spectators). */
  hand: Card[] | null
  pileCount: number
  top: Card
  /** Seats that declined during the current 원카드 window. */
  passed: number[]
}

function toAct(s: OCOnline): number[] {
  const g = s.g
  if (g.over) return []
  const out = [g.turn]
  const v = g.vulnerable
  if (v !== null) {
    for (let i = 0; i < g.n; i++) {
      if (out.includes(i) || s.passed.includes(i) || !isActive(g, i)) continue
      out.push(i)
    }
  }
  return out
}

export const onecard: OnlineGame<OCOnline, OneCardAction, OneCardView> = {
  id: 'onecard',
  name: '원카드',
  emoji: '☝️',
  minPlayers: 2,
  maxPlayers: 6,
  bots: true,
  setup: (n, rng) => ({ g: newGame(seatTokens(n), [], rng), passed: [] }),
  toAct,
  apply(s, seat, a, rng) {
    const g = s.g
    assertLegal(!g.over, '게임이 끝났어요')
    assertLegal(a && typeof a === 'object', '잘못된 요청이에요')
    switch (a.type) {
      case 'play': {
        assertLegal(seat === g.turn, '지금은 내 차례가 아니에요')
        const card = g.hands[seat].find((c) => c.id === a.cardId)
        assertLegal(card, '손에 없는 카드예요')
        assertLegal(canPlay(g, card), g.attack > 0 ? '그 카드로는 공격을 막을 수 없어요' : '무늬나 숫자가 맞지 않아요')
        let suit: Suit | undefined
        if (card.rank === 7) {
          suit = a.suit ?? card.suit
          assertLegal(SUITS.includes(suit), '무늬를 골라 주세요')
        }
        return { g: play(g, seat, card.id, suit, !!a.declare), passed: [] }
      }
      case 'draw':
        assertLegal(seat === g.turn, '지금은 내 차례가 아니에요')
        return { g: drawTurn(g, seat, rng), passed: [] }
      case 'declare': {
        const ok =
          g.vulnerable === seat || (g.turn === seat && g.hands[seat].length === 2 && !g.predeclared[seat])
        assertLegal(ok, '지금은 원카드를 외칠 수 없어요')
        return { g: declare(g, seat), passed: [] }
      }
      case 'catch':
        assertLegal(g.vulnerable !== null, '잡을 사람이 없어요')
        assertLegal(g.vulnerable !== seat && isActive(g, seat), '지금은 잡을 수 없어요')
        return { g: catchOne(g, seat, rng), passed: [] }
      case 'pass':
        assertLegal(g.vulnerable !== null && seat !== g.turn, '지금은 넘길 수 없어요')
        return { ...s, passed: [...s.passed, seat] }
      default:
        assertLegal(false, '알 수 없는 동작이에요')
    }
  },
  view(s, seat) {
    const g = s.g
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { hands, pile, discard, watch, ...pub } = g
    return {
      ...pub,
      counts: hands.map((h) => h.length),
      hand: seat == null ? null : hands[seat].slice(),
      pileCount: pile.length,
      top: top(g),
      passed: s.passed,
    }
  },
  result(s) {
    if (!s.g.over) return null
    const order = ranking(s.g)
    // Seat names aren't known here (logs use "{n}" placeholders), so the summary stays nameless;
    // the screen shows the full ranking.
    return { winners: [order[0]], summary: '손패를 가장 먼저 비웠어요! ☝️' }
  },
  // While someone sits on one card, give humans ~2s to call/catch before bots react.
  botDelay: (s) => (s.g.vulnerable !== null ? 2000 : undefined),
  bot(s, seat, rng) {
    const g = s.g
    const v = g.vulnerable
    if (seat === g.turn) {
      if (v !== null && v !== seat && aiCatches(g, seat, 'normal', rng)) return { type: 'catch' }
      const m = aiMove(g, seat, 'normal', rng)
      return m.type === 'draw' ? m : { type: 'play', cardId: m.cardId, suit: m.suit, declare: m.declare }
    }
    // Not my turn: I'm only here for the 원카드 race.
    if (v === seat) return rng() < 0.5 ? { type: 'declare' } : { type: 'pass' }
    return aiCatches(g, seat, 'normal', rng) ? { type: 'catch' } : { type: 'pass' }
  },
}
