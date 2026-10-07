import type { Card } from '../../cards/deck'
import {
  aiGiveBack,
  aiMove,
  analyze,
  beats,
  giveBack,
  newGame,
  pass,
  play,
  standings,
  startRound,
  type Exchange,
  type Options,
  type PRState,
} from '../../games/president/logic'
import { assertLegal, type OnlineGame } from '../engine'
import { pickCards, seatTokens } from './onecard-shared'

/**
 * 대통령 online: 3 rounds, no jokers, 혁명 on. Every seat picks its own give-back cards in the
 * exchange phase (simultaneous when 대통령 and 부통령 both give back). Between rounds everyone
 * presses "다음 라운드" (bots right away).
 */
export const PRESIDENT_OPTS: Options = { jokers: false, revolution: true, rounds: 3 }

export interface PROnline {
  g: PRState
  /** Seats that pressed "다음 라운드" on the round-end screen. */
  ready: boolean[]
}

export type PresidentAction =
  | { type: 'play'; cardIds: string[] }
  | { type: 'pass' }
  | { type: 'give'; cardIds: string[] }
  | { type: 'next' }

export type PresidentView = Omit<PRState, 'hands' | 'exchanges'> & {
  counts: number[]
  hand: Card[] | null
  /** Only the exchanges I took part in. */
  exchanges: Exchange[]
  ready: boolean[]
}

const allSeats = (n: number) => Array.from({ length: n }, (_, i) => i)

function toAct(s: PROnline): number[] {
  const g = s.g
  if (g.phase === 'play') return [g.turn]
  if (g.phase === 'exchange') return g.pendingGive.map((p) => p.from)
  if (g.phase === 'roundEnd') return allSeats(g.n).filter((i) => !s.ready[i])
  return []
}

export const president: OnlineGame<PROnline, PresidentAction, PresidentView> = {
  id: 'president',
  name: '대통령',
  emoji: '👑',
  minPlayers: 3,
  maxPlayers: 6,
  bots: true,
  setup: (n, rng) => ({ g: newGame(seatTokens(n), PRESIDENT_OPTS, rng), ready: Array(n).fill(false) }),
  toAct,
  apply(s, seat, a, rng) {
    const g = s.g
    assertLegal(toAct(s).includes(seat), '지금은 내 차례가 아니에요')
    assertLegal(a && typeof a === 'object', '잘못된 요청이에요')
    switch (a.type) {
      case 'play': {
        assertLegal(g.phase === 'play', '지금은 카드를 낼 수 없어요')
        const cards = pickCards(g.hands[seat], a.cardIds)
        assertLegal(cards && cards.length > 0, '손에 없는 카드예요')
        const combo = analyze(cards)
        assertLegal(combo, '같은 숫자만 함께 낼 수 있어요')
        assertLegal(
          beats(combo, g.current, g.revolution),
          g.current && combo.count !== g.current.count ? `${g.current.count}장을 내야 해요` : '더 센 카드를 내야 해요',
        )
        return { ...s, g: play(g, seat, cards.map((c) => c.id)) }
      }
      case 'pass':
        assertLegal(g.phase === 'play', '지금은 패스할 수 없어요')
        assertLegal(g.current, '선은 패스할 수 없어요')
        return { ...s, g: pass(g, seat) }
      case 'give': {
        assertLegal(g.phase === 'exchange', '지금은 카드를 줄 때가 아니에요')
        const pend = g.pendingGive.find((p) => p.from === seat)!
        const cards = pickCards(g.hands[seat], a.cardIds, pend.count)
        assertLegal(cards, `돌려줄 카드 ${pend.count}장을 골라 주세요`)
        return { ...s, g: giveBack(g, seat, cards.map((c) => c.id)) }
      }
      case 'next': {
        assertLegal(g.phase === 'roundEnd', '지금은 다음 라운드로 갈 수 없어요')
        const ready = s.ready.slice()
        ready[seat] = true
        if (ready.every(Boolean)) return { g: startRound(g, allSeats(g.n), rng), ready: Array(g.n).fill(false) }
        return { ...s, ready }
      }
      default:
        assertLegal(false, '알 수 없는 동작이에요')
    }
  },
  view(s, seat) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { hands, exchanges, ...pub } = s.g
    return {
      ...pub,
      counts: hands.map((h) => h.length),
      hand: seat == null ? null : hands[seat].slice(),
      exchanges: seat == null ? [] : exchanges.filter((e) => e.from === seat || e.to === seat),
      ready: s.ready,
    }
  },
  result(s) {
    if (s.g.phase !== 'over') return null
    const order = standings(s.g)
    const best = s.g.scores[order[0]]
    return {
      winners: order.filter((p) => s.g.scores[p] === best),
      summary: `${s.g.opts.rounds}라운드 총점이 가장 높은 사람이 이겨요 👑`,
      scores: s.g.scores,
    }
  },
  bot(s, seat, rng) {
    const g = s.g
    if (g.phase === 'exchange') {
      const pend = g.pendingGive.find((p) => p.from === seat)!
      return { type: 'give', cardIds: aiGiveBack(g.hands[seat], pend.count).map((c) => c.id) }
    }
    if (g.phase === 'roundEnd') return { type: 'next' }
    const m = aiMove(g, seat, 'normal', rng)
    return m.type === 'pass' ? m : { type: 'play', cardIds: m.cardIds }
  },
}
