import { aiShouldTake, canPass, isOver, newGame, pass, scores, take, type NTState } from '../../games/no-thanks/logic'
import { IllegalAction, assertLegal, type OnlineGame } from '../engine'

export interface NTLog {
  who: number
  kind: 'pass' | 'take'
  card: number
  pot: number
}

export interface NoThanksOnline {
  nt: NTState
  last: NTLog | null
  /** Increments whenever a new card is flipped. */
  flipNo: number
}

export type NoThanksAction = { type: 'take' } | { type: 'pass' }

export interface NoThanksView {
  card: number | null
  pot: number
  hands: number[][]
  chips: number[]
  turn: number
  deckCount: number
  /** The 9 removed cards: secret until the game ends. */
  removed: number[]
  last: NTLog | null
  flipNo: number
}

export const noThanks: OnlineGame<NoThanksOnline, NoThanksAction, NoThanksView> = {
  id: 'no-thanks',
  name: '노 땡큐',
  emoji: '🙅',
  minPlayers: 3,
  maxPlayers: 7,
  bots: true,
  setup: (n, rng) => ({ nt: newGame(n, rng), last: null, flipNo: 0 }),
  toAct: (s) => (isOver(s.nt) ? [] : [s.nt.turn]),
  apply(s, seat, a) {
    const nt = s.nt
    assertLegal(!isOver(nt) && seat === nt.turn, '지금은 내 차례가 아니에요')
    const card = nt.card as number
    if (a?.type === 'pass') {
      assertLegal(canPass(nt), '칩이 없어서 가져가야 해요')
      return { ...s, nt: pass(nt), last: { who: seat, kind: 'pass', card, pot: nt.pot } }
    }
    if (a?.type === 'take') {
      return { nt: take(nt), last: { who: seat, kind: 'take', card, pot: nt.pot }, flipNo: s.flipNo + 1 }
    }
    throw new IllegalAction('알 수 없는 동작이에요')
  },
  view: (s) => ({
    card: s.nt.card,
    pot: s.nt.pot,
    hands: s.nt.hands,
    chips: s.nt.chips,
    turn: s.nt.turn,
    deckCount: s.nt.deck.length,
    removed: isOver(s.nt) ? s.nt.removed : [],
    last: s.last,
    flipNo: s.flipNo,
  }),
  result(s) {
    if (!isOver(s.nt)) return null
    const sc = scores(s.nt)
    const low = Math.min(...sc)
    return { winners: sc.flatMap((v, i) => (v === low ? [i] : [])), summary: `가장 낮은 ${low}점 (낮을수록 좋아요)`, scores: sc }
  },
  bot: (s, _seat, rng) => ({ type: aiShouldTake(s.nt, 'normal', rng) ? 'take' : 'pass' }),
}
