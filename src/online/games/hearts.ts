import type { Card } from '../../cards/deck'
import {
  aiPass,
  aiPlay,
  choosePass,
  collect,
  deal,
  legalCards,
  newGame,
  playCard,
  winners,
  type HState,
} from '../../games/hearts/logic'
import { assertLegal, type OnlineGame } from '../engine'
import { pickCards, seatTokens } from './onecard-shared'

/**
 * 하트 online (exactly 4). Passing is simultaneous: every seat that hasn't chosen yet is in toAct and
 * the chosen cards stay secret until all four have chosen. A finished trick is collected at once;
 * the view keeps it as `lastTrick` so screens can show who took it.
 */
export interface HOnline {
  g: HState
  ready: boolean[]
}

export type HeartsAction = { type: 'pass'; ids: string[] } | { type: 'play'; id: string } | { type: 'next' }

export type HeartsView = Omit<HState, 'hands' | 'passSel' | 'received'> & {
  counts: number[]
  hand: Card[] | null
  /** Who has already chosen their pass cards. */
  passDone: boolean[]
  /** My chosen pass cards (ids), if any. */
  myPass: string[] | null
  /** Cards I received this hand. */
  received: Card[]
  ready: boolean[]
}

function toAct(s: HOnline): number[] {
  const g = s.g
  if (g.phase === 'pass') return [0, 1, 2, 3].filter((i) => !g.passSel[i])
  if (g.phase === 'play') return g.turn >= 0 ? [g.turn] : []
  if (g.phase === 'handEnd') return [0, 1, 2, 3].filter((i) => !s.ready[i])
  return []
}

export const hearts: OnlineGame<HOnline, HeartsAction, HeartsView> = {
  id: 'hearts',
  name: '하트',
  emoji: '♥️',
  minPlayers: 4,
  maxPlayers: 4,
  bots: true,
  setup: (n, rng) => ({ g: newGame(seatTokens(n), rng), ready: [false, false, false, false] }),
  toAct,
  apply(s, seat, a, rng) {
    const g = s.g
    assertLegal(toAct(s).includes(seat), '지금은 내 차례가 아니에요')
    assertLegal(a && typeof a === 'object', '잘못된 요청이에요')
    switch (a.type) {
      case 'pass': {
        assertLegal(g.phase === 'pass', '지금은 카드를 넘길 때가 아니에요')
        const cards = pickCards(g.hands[seat], a.ids, 3)
        assertLegal(cards, '넘길 카드 3장을 골라 주세요')
        return { ...s, g: choosePass(g, seat, cards.map((c) => c.id)) }
      }
      case 'play': {
        assertLegal(g.phase === 'play', '지금은 카드를 낼 수 없어요')
        assertLegal(g.hands[seat].some((c) => c.id === a.id), '손에 없는 카드예요')
        const legal = legalCards(g, seat)
        assertLegal(
          legal.some((c) => c.id === a.id),
          g.trickNo === 0 && g.trick.length === 0
            ? '♣2로 시작해야 해요'
            : g.trick.length === 0
              ? '하트는 아직 먼저 낼 수 없어요'
              : g.hands[seat].some((c) => c.suit === g.trick[0].card.suit)
                ? '같은 무늬를 따라 내야 해요'
                : '첫 판에는 점수 카드를 낼 수 없어요',
        )
        let next = playCard(g, seat, a.id)
        if (next.trick.length === 4) next = collect(next)
        return { ...s, g: next }
      }
      case 'next': {
        assertLegal(g.phase === 'handEnd', '지금은 다음 판으로 갈 수 없어요')
        const ready = s.ready.slice()
        ready[seat] = true
        if (ready.every(Boolean)) return { g: deal(g, rng), ready: [false, false, false, false] }
        return { ...s, ready }
      }
      default:
        assertLegal(false, '알 수 없는 동작이에요')
    }
  },
  view(s, seat) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { hands, passSel, received, ...pub } = s.g
    return {
      ...pub,
      counts: hands.map((h) => h.length),
      hand: seat == null ? null : hands[seat].slice(),
      passDone: passSel.map((x) => !!x),
      myPass: seat == null ? null : passSel[seat],
      received: seat == null ? [] : received[seat],
      ready: s.ready,
    }
  },
  result(s) {
    if (s.g.phase !== 'over') return null
    return { winners: winners(s.g), summary: '점수가 가장 낮은 사람이 이겨요 ♥', scores: s.g.scores }
  },
  bot(s, seat, rng) {
    const g = s.g
    if (g.phase === 'pass') return { type: 'pass', ids: aiPass(g.hands[seat], 'normal', rng) }
    if (g.phase === 'handEnd') return { type: 'next' }
    return { type: 'play', id: aiPlay(g, seat, 'normal', rng) }
  },
}
