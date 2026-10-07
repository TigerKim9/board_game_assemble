import type { Card } from '../../cards/deck'
import {
  MIN_BET,
  START_CHIPS,
  act,
  aiAction,
  aiBet,
  dealStep,
  dealerStep,
  legalActions,
  newTable,
  nextRound,
  startRound,
  type Action,
  type Table,
} from '../../games/blackjack/logic'
import { assertLegal, type OnlineGame } from '../engine'
import { isInt, seatTokens } from './onecard-shared'

/**
 * 블랙잭 online (1~5 players vs the dealer). Virtual chips live only in this match: everyone starts
 * with START_CHIPS and the match lasts ROUNDS rounds (or until everyone is broke); most chips wins.
 * Betting is simultaneous and the amounts stay hidden until the cards are dealt. The opening deal and
 * the dealer's play run instantly on the server; the hole card stays hidden until the dealer plays.
 */
export const ROUNDS = 8

export interface BJOnline {
  t: Table
  round: number
  /** Seats that placed their bet this round. */
  betDone: boolean[]
  /** Seats that pressed "다음 판" after the round. */
  ready: boolean[]
  /** Last action label per seat (shown on the table). */
  notes: (string | null)[]
  over: boolean
}

export type BlackjackAction = { type: 'bet'; amount: number } | { type: 'act'; action: Action } | { type: 'next' }

export type BlackjackView = Omit<Table, 'shoe' | 'dealer' | 'order' | 'step'> & {
  shoeCount: number
  /** Dealer cards that are face up. */
  dealer: Card[]
  /** Number of face-down dealer cards (the hole card). */
  dealerHidden: number
  round: number
  rounds: number
  betDone: boolean[]
  ready: boolean[]
  notes: (string | null)[]
  over: boolean
}

export const ACTION_KO: Record<Action, string> = { hit: '히트', stand: '스탠드', double: '더블', split: '스플릿' }

const canBet = (s: BJOnline, i: number) => s.t.seats[i].chips >= MIN_BET

function toAct(s: BJOnline): number[] {
  if (s.over) return []
  const t = s.t
  if (t.phase === 'bet') return t.seats.map((_, i) => i).filter((i) => !s.betDone[i] && canBet(s, i))
  if (t.phase === 'play') return t.turn ? [t.turn.seat] : []
  if (t.phase === 'done') return t.seats.map((_, i) => i).filter((i) => !s.ready[i])
  return []
}

/** Run the automatic parts (deal, dealer) until a player must act again. */
function runAuto(t0: Table): Table {
  let t = t0
  for (let guard = 0; guard < 500; guard++) {
    if (t.phase === 'dealing') t = dealStep(t)
    else if (t.phase === 'dealer') t = dealerStep(t)
    else break
  }
  return t
}

function beginBetting(s: BJOnline): BJOnline {
  return { ...s, betDone: s.t.seats.map(() => false), ready: s.t.seats.map(() => false), notes: s.t.seats.map(() => null) }
}

export const blackjack: OnlineGame<BJOnline, BlackjackAction, BlackjackView> = {
  id: 'blackjack',
  name: '블랙잭',
  emoji: '🎰',
  minPlayers: 1,
  maxPlayers: 5,
  bots: true,
  setup(n, rng) {
    const t = newTable(
      seatTokens(n).map((name) => ({ name, isAI: false, chips: START_CHIPS })),
      rng,
    )
    t.seats = t.seats.map((x) => ({ ...x, bet: 0 }))
    return beginBetting({ t, round: 1, betDone: [], ready: [], notes: [], over: false })
  },
  toAct,
  apply(s, seat, a, rng) {
    assertLegal(toAct(s).includes(seat), '지금은 내 차례가 아니에요')
    assertLegal(a && typeof a === 'object', '잘못된 요청이에요')
    const t = s.t
    switch (a.type) {
      case 'bet': {
        assertLegal(t.phase === 'bet', '지금은 베팅할 때가 아니에요')
        const chips = t.seats[seat].chips
        assertLegal(isInt(a.amount) && a.amount >= MIN_BET, `최소 ${MIN_BET}칩은 걸어야 해요`)
        assertLegal(a.amount <= chips, '칩이 모자라요')
        const seats = t.seats.map((x, i) => (i === seat ? { ...x, bet: a.amount } : x))
        const betDone = s.betDone.slice()
        betDone[seat] = true
        let next: BJOnline = { ...s, t: { ...t, seats }, betDone }
        if (toAct(next).length === 0) next = { ...next, t: runAuto(startRound(next.t, rng)) }
        return next
      }
      case 'act': {
        assertLegal(t.phase === 'play', '지금은 카드를 받을 때가 아니에요')
        assertLegal(legalActions(t).includes(a.action), '지금은 할 수 없는 동작이에요')
        const notes = s.notes.slice()
        notes[seat] = ACTION_KO[a.action]
        return { ...s, t: runAuto(act(t, a.action)), notes }
      }
      case 'next': {
        assertLegal(t.phase === 'done', '라운드가 아직 끝나지 않았어요')
        const ready = s.ready.slice()
        ready[seat] = true
        if (!ready.every(Boolean)) return { ...s, ready }
        const broke = t.seats.every((x) => x.chips < MIN_BET)
        if (s.round >= ROUNDS || broke) return { ...s, ready, over: true }
        const nt = nextRound(t)
        nt.seats = nt.seats.map((x) => ({ ...x, bet: 0 }))
        return beginBetting({ ...s, t: nt, round: s.round + 1 })
      }
      default:
        assertLegal(false, '알 수 없는 동작이에요')
    }
  },
  view(s, seat) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { shoe, dealer, order, step, ...pub } = s.t
    const shown = pub.holeUp ? dealer : dealer.slice(0, 1)
    return {
      ...pub,
      // Bets are secret while people are still choosing.
      seats: pub.seats.map((x, i) => (pub.phase === 'bet' && i !== seat ? { ...x, bet: 0 } : x)),
      shoeCount: shoe.length,
      dealer: shown,
      dealerHidden: dealer.length - shown.length,
      round: s.round,
      rounds: ROUNDS,
      betDone: s.betDone,
      ready: s.ready,
      notes: s.notes,
      over: s.over,
    }
  },
  result(s) {
    if (!s.over) return null
    const chips = s.t.seats.map((x) => x.chips)
    const best = Math.max(...chips)
    return {
      winners: chips.map((c, i) => (c === best ? i : -1)).filter((i) => i >= 0),
      summary: `${s.round}판 끝 — 칩이 가장 많은 사람이 이겨요 (가상 칩)`,
      scores: chips,
    }
  },
  bot(s, seat) {
    const t = s.t
    if (t.phase === 'bet') return { type: 'bet', amount: aiBet(t.seats[seat].chips) }
    if (t.phase === 'done') return { type: 'next' }
    return { type: 'act', action: aiAction(t) }
  },
}
