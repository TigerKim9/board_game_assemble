import {
  START_DICE,
  aiAction,
  challenge,
  currentBid,
  facesFor,
  isHigher,
  newLiar,
  nextRound,
  placeBid,
  rollHand,
  totalDice,
  type Bid,
  type LiarState,
  type Reveal,
} from '../../games/liars-dice/logic'
import { IllegalAction, assertLegal, type OnlineGame } from '../engine'

export interface LiarOnline {
  g: LiarState
  /** The previous round's challenge with every hand revealed (public once revealed). */
  last: (Reveal & { hands: number[][]; round: number }) | null
}

export type LiarAction = { type: 'bid'; bid: Bid } | { type: 'challenge' }

export interface LiarView {
  wild: boolean
  round: number
  turn: number
  /** Dice count per seat. */
  counts: number[]
  /** My own dice (null for spectators or when I'm out). */
  mine: number[] | null
  bids: { player: number; bid: Bid }[]
  last: LiarOnline['last']
  winner: number | null
}

const WILD = true

export const liarsDice: OnlineGame<LiarOnline, LiarAction, LiarView> = {
  id: 'liars-dice',
  name: '라이어 다이스',
  emoji: '🤥',
  minPlayers: 2,
  maxPlayers: 6,
  bots: true,
  setup(n, rng) {
    const players = Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isAI: false }))
    return { g: newLiar(players, WILD, players.map(() => rollHand(START_DICE, rng))), last: null }
  },
  toAct: (s) => (s.g.phase === 'bid' ? [s.g.turn] : []),
  apply(s, seat, a, rng) {
    const g = s.g
    assertLegal(g.phase === 'bid' && seat === g.turn, '지금은 내 차례가 아니에요')
    if (a?.type === 'bid') {
      const b = a.bid
      assertLegal(b && Number.isInteger(b.qty) && Number.isInteger(b.face), '잘못된 베팅이에요')
      assertLegal(facesFor(g.wild).includes(b.face), g.wild ? '1은 만능이라 부를 수 없어요' : '잘못된 눈이에요')
      assertLegal(b.qty >= 1 && b.qty <= totalDice(g), '전체 주사위 수보다 많이 부를 수 없어요')
      assertLegal(isHigher(b, currentBid(g)?.bid ?? null), '앞 사람보다 높게 불러야 해요')
      return { ...s, g: placeBid(g, { qty: b.qty, face: b.face }) }
    }
    if (a?.type === 'challenge') {
      assertLegal(currentBid(g) != null, '아직 베팅이 없어요')
      const rv = challenge(g)
      const reveal = rv.reveal!
      const counts = rv.hands.map((h, i) => h.length - (i === reveal.loser ? 1 : 0))
      const next = nextRound(rv, counts.map((c) => rollHand(c, rng)))
      return { g: next, last: { ...reveal, hands: rv.hands, round: g.round } }
    }
    throw new IllegalAction('알 수 없는 동작이에요')
  },
  view(s, seat) {
    const g = s.g
    return {
      wild: g.wild,
      round: g.round,
      turn: g.turn,
      counts: g.hands.map((h) => h.length),
      mine: seat != null && g.hands[seat]?.length ? g.hands[seat].slice() : null,
      bids: g.bids,
      last: s.last,
      winner: g.winner,
    }
  },
  result(s) {
    if (s.g.phase !== 'over' || s.g.winner == null) return null
    return { winners: [s.g.winner], summary: `마지막까지 주사위를 지켰어요 (${s.g.round - 1}라운드)`, scores: s.g.hands.map((h) => h.length) }
  },
  bot(s, seat, rng) {
    const g = s.g
    const act = aiAction(g.hands[seat], totalDice(g), currentBid(g)?.bid ?? null, g.wild, 'normal', rng)
    if (act.type === 'challenge' && !currentBid(g)) return { type: 'bid', bid: { qty: 1, face: facesFor(g.wild)[0] } }
    return act
  },
}
