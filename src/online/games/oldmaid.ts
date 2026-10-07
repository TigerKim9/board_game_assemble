import { sortCards, type Card } from '../../cards/deck'
import { aiPick, drawFrom, newGame, ranking, targetOf, type OMState } from '../../games/oldmaid/logic'
import { assertLegal, type OnlineGame } from '../engine'
import { isInt, seatTokens } from './onecard-shared'

/**
 * 도둑잡기 online. Every hand is kept shuffled on the server (`shuffled` = true for all seats), so the
 * index the drawer picks among the neighbour's face-down cards tells nothing. Owners see their own
 * hand sorted.
 */
export type OldMaidAction = { index: number }

export type OldMaidView = Omit<OMState, 'hands' | 'shuffled' | 'last'> & {
  counts: number[]
  hand: Card[] | null
  /** Last draw; `card` only for the two players involved (or once it formed a public pair). */
  last?: { by: number; from: number; paired: boolean; card?: Card }
  /** The joker, shown once the game is over. */
  jokerCard?: Card
}

export const oldmaid: OnlineGame<OMState, OldMaidAction, OldMaidView> = {
  id: 'oldmaid',
  name: '도둑잡기',
  emoji: '🃏',
  minPlayers: 2,
  maxPlayers: 6,
  bots: true,
  setup: (n, rng) => newGame(seatTokens(n), Array(n).fill(true), rng),
  toAct: (s) => (s.over ? [] : [s.turn]),
  apply(s, seat, a, rng) {
    assertLegal(!s.over && seat === s.turn, '지금은 내 차례가 아니에요')
    const from = targetOf(s, seat)
    assertLegal(from >= 0, '뽑을 상대가 없어요')
    assertLegal(isInt(a?.index) && a.index >= 0 && a.index < s.hands[from].length, '잘못된 카드 위치예요')
    return drawFrom(s, seat, a.index, rng)
  },
  view(s, seat) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { hands, shuffled, last, ...pub } = s
    const v: OldMaidView = {
      ...pub,
      counts: hands.map((h) => h.length),
      hand: seat == null ? null : sortCards(hands[seat]),
    }
    if (last) {
      const sees = last.paired || seat === last.by || seat === last.from
      v.last = { by: last.by, from: last.from, paired: last.paired, ...(sees ? { card: last.card } : {}) }
    }
    if (s.over && s.loser !== null) v.jokerCard = hands[s.loser][0]
    return v
  },
  result(s) {
    if (!s.over) return null
    const order = ranking(s)
    const winners = s.loser === null ? [] : order.filter((p) => p !== s.loser)
    return { winners, summary: s.loser === null ? '도둑이 없어요' : '마지막에 조커를 쥔 사람이 도둑이에요 🃏' }
  },
  bot: (s, seat, rng) => ({ index: aiPick(s, seat, rng) }),
}
