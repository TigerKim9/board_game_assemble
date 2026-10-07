import {
  END_SCORE,
  HAND_SIZE,
  MAX_CARD,
  aiChooseCard,
  aiChooseRow,
  deal,
  placeCard,
  sumHeads,
  takeRow,
  targetRow,
} from '../../games/cow-dodge/logic'
import { IllegalAction, assertLegal, type OnlineGame, type Rng } from '../engine'

export interface CowPlay {
  player: number
  card: number
}

export interface CowTake {
  player: number
  cards: number[]
  /** True when the player chose the row because their card was too low. */
  chosen: boolean
}

export interface CowState {
  rows: number[][]
  hands: number[][]
  total: number[]
  roundPen: number[]
  /** Every card revealed so far this round (for the AI). */
  seen: number[]
  round: number
  /** Turn within the round, 0..HAND_SIZE-1. */
  turn: number
  phase: 'choose' | 'pickRow' | 'over'
  /** Secret picks for the turn being chosen. */
  picks: (number | null)[]
  /** The latest revealed turn, sorted by card (public). */
  reveal: CowPlay[]
  /** How many of `reveal` have been placed. */
  placed: number
  takes: CowTake[]
  /** Seat that must choose a row (phase 'pickRow'). */
  pickSeat: number | null
  /** Summary of the previous round, shown at the start of the next one. */
  lastRound: { round: number; roundPen: number[] } | null
}

export type CowAction = { type: 'card'; card: number } | { type: 'row'; row: number }

export interface CowView extends Omit<CowState, 'hands' | 'picks'> {
  /** My hand (empty for spectators). */
  hand: number[]
  handCounts: number[]
  /** Who has already chosen this turn (cards stay hidden until everyone has). */
  picked: boolean[]
  /** My own secret pick. */
  myPick: number | null
}

function newDeal(n: number, rng: Rng) {
  const d = deal(n, rng)
  return { rows: d.rows, hands: d.hands }
}

/** Place revealed cards in order until done or a player must choose a row. */
function resolve(s: CowState, rng: Rng): CowState {
  let { rows, total, roundPen, placed } = s
  const takes = s.takes.slice()
  while (placed < s.reveal.length) {
    const { player, card } = s.reveal[placed]
    if (targetRow(rows, card) < 0) return { ...s, rows, total, roundPen, placed, takes, phase: 'pickRow', pickSeat: player }
    const r = placeCard(rows, card)
    rows = r.rows
    if (r.taken.length) {
      const pen = sumHeads(r.taken)
      roundPen = roundPen.map((v, i) => (i === player ? v + pen : v))
      total = total.map((v, i) => (i === player ? v + pen : v))
      takes.push({ player, cards: r.taken, chosen: false })
    }
    placed++
  }
  const n = s.hands.length
  const seen = [...s.seen, ...s.reveal.map((p) => p.card)]
  const turn = s.turn + 1
  const base: CowState = { ...s, rows, total, roundPen, placed, takes, seen, turn, phase: 'choose', pickSeat: null, picks: Array(n).fill(null) }
  if (turn < HAND_SIZE) return base
  if (total.some((t) => t >= END_SCORE)) return { ...base, phase: 'over' }
  // Next round: deal again automatically.
  return {
    ...base,
    ...newDeal(n, rng),
    seen: [],
    turn: 0,
    round: s.round + 1,
    roundPen: Array(n).fill(0),
    lastRound: { round: s.round, roundPen },
  }
}

export const cowDodge: OnlineGame<CowState, CowAction, CowView> = {
  id: 'cow-dodge',
  name: '소 떼 피하기',
  emoji: '🐮',
  minPlayers: 2,
  maxPlayers: 10,
  bots: true,
  setup(n, rng) {
    return {
      ...newDeal(n, rng),
      total: Array(n).fill(0),
      roundPen: Array(n).fill(0),
      seen: [],
      round: 1,
      turn: 0,
      phase: 'choose',
      picks: Array(n).fill(null),
      reveal: [],
      placed: 0,
      takes: [],
      pickSeat: null,
      lastRound: null,
    }
  },
  toAct(s) {
    if (s.phase === 'choose') return s.picks.flatMap((p, i) => (p == null ? [i] : []))
    if (s.phase === 'pickRow' && s.pickSeat != null) return [s.pickSeat]
    return []
  },
  apply(s, seat, a, rng) {
    if (a?.type === 'card') {
      assertLegal(s.phase === 'choose', '지금은 카드를 낼 때가 아니에요')
      assertLegal(s.picks[seat] == null, '이미 카드를 골랐어요')
      assertLegal(Number.isInteger(a.card) && a.card >= 1 && a.card <= MAX_CARD && s.hands[seat].includes(a.card), '내 패에 없는 카드예요')
      const picks = s.picks.map((p, i) => (i === seat ? a.card : p))
      if (picks.some((p) => p == null)) return { ...s, picks }
      // Everyone has chosen: reveal and resolve.
      const reveal = picks.map((card, player) => ({ player, card: card as number })).sort((x, y) => x.card - y.card)
      const hands = s.hands.map((h, i) => h.filter((c) => c !== picks[i]))
      return resolve({ ...s, picks, hands, reveal, placed: 0, takes: [] }, rng)
    }
    if (a?.type === 'row') {
      assertLegal(s.phase === 'pickRow' && seat === s.pickSeat, '지금은 줄을 고를 때가 아니에요')
      assertLegal(Number.isInteger(a.row) && a.row >= 0 && a.row < s.rows.length, '없는 줄이에요')
      const { card } = s.reveal[s.placed]
      const r = takeRow(s.rows, a.row, card)
      const pen = sumHeads(r.taken)
      return resolve(
        {
          ...s,
          rows: r.rows,
          roundPen: s.roundPen.map((v, i) => (i === seat ? v + pen : v)),
          total: s.total.map((v, i) => (i === seat ? v + pen : v)),
          takes: [...s.takes, { player: seat, cards: r.taken, chosen: true }],
          placed: s.placed + 1,
          phase: 'choose',
          pickSeat: null,
        },
        rng,
      )
    }
    throw new IllegalAction('알 수 없는 동작이에요')
  },
  view(s, seat) {
    const { hands, picks, ...rest } = s
    return {
      ...rest,
      hand: seat != null ? hands[seat].slice() : [],
      handCounts: hands.map((h) => h.length),
      picked: picks.map((p) => p != null),
      myPick: seat != null ? picks[seat] : null,
    }
  },
  result(s) {
    if (s.phase !== 'over') return null
    const low = Math.min(...s.total)
    return {
      winners: s.total.flatMap((t, i) => (t === low ? [i] : [])),
      summary: `누군가 소 ${END_SCORE}마리를 넘겼어요! 🐮 ${low}마리로 가장 적게 모은 사람 승리`,
      scores: s.total,
    }
  },
  bot(s, seat, rng) {
    if (s.phase === 'pickRow') return { type: 'row', row: aiChooseRow(s.rows, 'normal', rng) }
    const n = s.hands.length
    return { type: 'card', card: aiChooseCard(s.rows, s.hands[seat], n - 1, new Set(s.seen), 'normal', rng) }
  },
}
