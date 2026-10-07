import { createDeck, shuffleDeck, type Card } from '../../cards/deck'

export const DECKS = 6
export const SHOE_SIZE = DECKS * 52
/** Reshuffle once fewer than this many cards remain (cut card at ~75%). */
export const CUT = Math.round(SHOE_SIZE * 0.25)
export const START_CHIPS = 1000
export const MIN_BET = 10
export const MAX_HANDS = 4

export function newShoe(rng: () => number = Math.random): Card[] {
  return shuffleDeck(createDeck({ decks: DECKS }), rng)
}

/** Blackjack value of one card: A = 1 (or 11, see handValue), faces = 10. */
export const cardPoints = (c: Card) => (c.rank >= 10 ? 10 : c.rank)

export function handValue(cards: readonly Card[]): {
  total: number
  soft: boolean
} {
  let total = 0
  let aces = 0
  for (const c of cards) {
    total += cardPoints(c)
    if (c.rank === 1) aces++
  }
  const soft = aces > 0 && total + 10 <= 21
  return { total: soft ? total + 10 : total, soft }
}

export interface Hand {
  cards: Card[]
  bet: number
  doubled: boolean
  /** Created by splitting (a 21 here is not a blackjack). */
  split: boolean
  /** Finished acting (stand, bust, 21, double, split aces). */
  done: boolean
  outcome?: Outcome
  /** Chips returned at settlement (stake included). */
  payout?: number
}

export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust'

export const newHand = (bet: number, cards: Card[] = [], split = false): Hand => ({
  cards,
  bet,
  doubled: false,
  split,
  done: false,
})

export const isBlackjack = (h: Pick<Hand, 'cards' | 'split'>) =>
  !h.split && h.cards.length === 2 && handValue(h.cards).total === 21
export const isBust = (cards: readonly Card[]) => handValue(cards).total > 21

export function canDouble(h: Hand, chips: number): boolean {
  return !h.done && h.cards.length === 2 && chips >= h.bet && !(h.split && h.cards[0].rank === 1)
}

export function canSplit(h: Hand, chips: number, handCount: number): boolean {
  return (
    !h.done &&
    h.cards.length === 2 &&
    cardPoints(h.cards[0]) === cardPoints(h.cards[1]) &&
    handCount < MAX_HANDS &&
    chips >= h.bet
  )
}

/** Dealer draws to 16 and stands on all 17s, including soft 17. */
export const dealerShouldHit = (cards: readonly Card[]) => handValue(cards).total < 17

/** Settle one player hand against the dealer's final cards. */
export function settle(h: Hand, dealer: readonly Card[]): { outcome: Outcome; payout: number } {
  const p = handValue(h.cards).total
  if (p > 21) return { outcome: 'bust', payout: 0 }
  const pBJ = isBlackjack(h)
  const dBJ = dealer.length === 2 && handValue(dealer).total === 21
  if (pBJ && dBJ) return { outcome: 'push', payout: h.bet }
  if (pBJ) return { outcome: 'blackjack', payout: h.bet + Math.floor(h.bet * 1.5) }
  if (dBJ) return { outcome: 'lose', payout: 0 }
  const d = handValue(dealer).total
  if (d > 21 || p > d) return { outcome: 'win', payout: h.bet * 2 }
  if (p === d) return { outcome: 'push', payout: h.bet }
  return { outcome: 'lose', payout: 0 }
}

export type Action = 'hit' | 'stand' | 'double' | 'split'

/**
 * Basic strategy for 6 decks, dealer stands on soft 17, double after split allowed.
 * `up` is the dealer's face-up card.
 */
export function basicStrategy(
  cards: readonly Card[],
  up: Card,
  opts: { canDouble: boolean; canSplit: boolean },
): Action {
  const d = up.rank === 1 ? 11 : cardPoints(up)
  const dbl = (fallback: Action): Action => (opts.canDouble ? 'double' : fallback)

  if (opts.canSplit && cards.length === 2 && cardPoints(cards[0]) === cardPoints(cards[1])) {
    const v = cards[0].rank === 1 ? 11 : cardPoints(cards[0])
    if (v === 11 || v === 8) return 'split'
    if (v === 9 && d !== 7 && d < 10) return 'split'
    if ((v === 7 || v === 3 || v === 2) && d <= 7) return 'split'
    if (v === 6 && d <= 6) return 'split'
    if (v === 4 && (d === 5 || d === 6)) return 'split'
    // 10s and 5s are never split — fall through to totals
  }

  const { total, soft } = handValue(cards)
  if (soft) {
    if (total >= 20) return 'stand'
    if (total === 19) return d === 6 ? dbl('stand') : 'stand'
    if (total === 18) {
      if (d >= 3 && d <= 6) return dbl('stand')
      return d <= 8 ? 'stand' : 'hit'
    }
    if (total === 17) return d >= 3 && d <= 6 ? dbl('hit') : 'hit'
    if (total >= 15) return d >= 4 && d <= 6 ? dbl('hit') : 'hit'
    return d >= 5 && d <= 6 ? dbl('hit') : 'hit'
  }
  if (total >= 17) return 'stand'
  if (total >= 13) return d <= 6 ? 'stand' : 'hit'
  if (total === 12) return d >= 4 && d <= 6 ? 'stand' : 'hit'
  if (total === 11) return d <= 10 ? dbl('hit') : 'hit'
  if (total === 10) return d <= 9 ? dbl('hit') : 'hit'
  if (total === 9) return d >= 3 && d <= 6 ? dbl('hit') : 'hit'
  return 'hit'
}

/** AI bet: about 5% of the stack in steps of 10 (10–200). */
export function aiBet(chips: number): number {
  const b = Math.round((chips * 0.05) / 10) * 10
  return Math.max(MIN_BET, Math.min(200, b, Math.floor(chips / 10) * 10))
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  blackjack: '블랙잭!',
  win: '승리',
  push: '무승부',
  lose: '패배',
  bust: '버스트',
}

/** "소프트 17" style label. */
export function totalLabel(cards: readonly Card[]): string {
  if (!cards.length) return ''
  const { total, soft } = handValue(cards)
  if (cards.length === 2 && total === 21) return '21'
  return soft && total < 21 ? `${total - 10}/${total}` : String(total)
}

/* ------------------------------------------------------------------ */
/* Table flow (pure reducers driven by the UI with small delays)        */
/* ------------------------------------------------------------------ */

export interface Seat {
  name: string
  isAI: boolean
  chips: number
  /** Bet for the next/current round (0 = sitting out). */
  bet: number
  hands: Hand[]
}

export type Phase = 'bet' | 'dealing' | 'play' | 'dealer' | 'done'

export interface Table {
  seats: Seat[]
  dealer: Card[]
  holeUp: boolean
  shoe: Card[]
  phase: Phase
  turn: { seat: number; hand: number } | null
  /** Deal order for the opening cards: seat index or 'D' (dealer). */
  order: (number | 'D')[]
  step: number
  shuffled: boolean
}

export function newTable(
  players: { name: string; isAI: boolean; chips: number }[],
  rng: () => number = Math.random,
): Table {
  return {
    seats: players.map((p) => ({
      ...p,
      bet: p.isAI ? aiBet(p.chips) : Math.min(50, Math.floor(p.chips / 10) * 10),
      hands: [],
    })),
    dealer: [],
    holeUp: false,
    shoe: newShoe(rng),
    phase: 'bet',
    turn: null,
    order: [],
    step: 0,
    shuffled: false,
  }
}

const cloneSeats = (seats: Seat[]) =>
  seats.map((s) => ({
    ...s,
    hands: s.hands.map((h) => ({ ...h, cards: h.cards.slice() })),
  }))

function drawFrom(t: Table): Card {
  const c = t.shoe[0]
  t.shoe = t.shoe.slice(1)
  return c
}

export const canStart = (t: Table) => t.phase === 'bet' && t.seats.some((s) => s.bet >= MIN_BET && s.bet <= s.chips)

/** Take the bets and prepare the opening deal. */
export function startRound(t: Table, rng: () => number = Math.random): Table {
  if (!canStart(t)) return t
  const reshuffle = t.shoe.length < CUT
  const seats = t.seats.map((s) => {
    const bet = s.bet >= MIN_BET && s.bet <= s.chips ? s.bet : 0
    return {
      ...s,
      bet,
      chips: s.chips - bet,
      hands: bet ? [newHand(bet)] : [],
    }
  })
  const playing = seats.map((s, i) => (s.bet ? i : -1)).filter((i) => i >= 0)
  return {
    ...t,
    seats,
    dealer: [],
    holeUp: false,
    shoe: reshuffle ? newShoe(rng) : t.shoe,
    shuffled: reshuffle,
    phase: 'dealing',
    turn: null,
    order: [...playing, 'D', ...playing, 'D'],
    step: 0,
  }
}

/** Deal the next opening card; after the last one, check for dealer blackjack and start play. */
export function dealStep(t0: Table): Table {
  if (t0.phase !== 'dealing') return t0
  const t: Table = {
    ...t0,
    seats: cloneSeats(t0.seats),
    dealer: t0.dealer.slice(),
  }
  const who = t.order[t.step]
  const card = drawFrom(t)
  if (who === 'D') t.dealer.push(card)
  else t.seats[who].hands[0].cards.push(card)
  t.step++
  if (t.step < t.order.length) return t
  // dealer peeks when showing an ace or a ten
  if (handValue(t.dealer).total === 21) {
    t.holeUp = true
    return settleAll(t)
  }
  for (const s of t.seats) for (const h of s.hands) if (isBlackjack(h)) h.done = true
  t.turn = nextTurn(t, 0, 0)
  t.phase = t.turn ? 'play' : 'dealer'
  return t
}

function nextTurn(t: Table, seat: number, hand: number): Table['turn'] {
  for (let s = seat; s < t.seats.length; s++) {
    const hands = t.seats[s].hands
    for (let h = s === seat ? hand : 0; h < hands.length; h++) if (!hands[h].done) return { seat: s, hand: h }
  }
  return null
}

export function currentHand(t: Table): Hand | null {
  return t.turn ? t.seats[t.turn.seat].hands[t.turn.hand] : null
}

export function legalActions(t: Table): Action[] {
  const h = currentHand(t)
  if (t.phase !== 'play' || !h) return []
  const seat = t.seats[t.turn!.seat]
  const out: Action[] = ['hit', 'stand']
  if (canDouble(h, seat.chips)) out.push('double')
  if (canSplit(h, seat.chips, seat.hands.length)) out.push('split')
  return out
}

/** Apply a player action to the current hand. */
export function act(t0: Table, action: Action): Table {
  if (!legalActions(t0).includes(action)) return t0
  const t: Table = { ...t0, seats: cloneSeats(t0.seats) }
  const { seat: si, hand: hi } = t.turn!
  const seat = t.seats[si]
  const h = seat.hands[hi]
  const finishIf21 = (x: Hand) => {
    if (handValue(x.cards).total >= 21) x.done = true
  }
  switch (action) {
    case 'hit':
      h.cards.push(drawFrom(t))
      finishIf21(h)
      break
    case 'stand':
      h.done = true
      break
    case 'double':
      seat.chips -= h.bet
      h.bet *= 2
      h.doubled = true
      h.cards.push(drawFrom(t))
      h.done = true
      break
    case 'split': {
      seat.chips -= h.bet
      const aces = h.cards[0].rank === 1
      const a = newHand(h.bet, [h.cards[0], drawFrom(t)], true)
      const b = newHand(h.bet, [h.cards[1], drawFrom(t)], true)
      for (const x of [a, b]) {
        if (aces) x.done = true
        else finishIf21(x)
      }
      seat.hands.splice(hi, 1, a, b)
      break
    }
  }
  if (seat.hands[hi].done) {
    t.turn = nextTurn(t, si, hi)
    if (!t.turn) t.phase = 'dealer'
  }
  return t
}

/** The AI's choice for the current hand (basic strategy). */
export function aiAction(t: Table): Action {
  const h = currentHand(t)!
  const legal = legalActions(t)
  return basicStrategy(h.cards, t.dealer[0], {
    canDouble: legal.includes('double'),
    canSplit: legal.includes('split'),
  })
}

/** True when the dealer must still play (some hand is neither bust nor a natural blackjack). */
export const dealerMustPlay = (t: Table) =>
  t.seats.some((s) => s.hands.some((h) => !isBust(h.cards) && !isBlackjack(h)))

/** One dealer action: reveal the hole card, draw, or settle. */
export function dealerStep(t0: Table): Table {
  if (t0.phase !== 'dealer') return t0
  if (!t0.holeUp) return { ...t0, holeUp: true }
  if (dealerMustPlay(t0) && dealerShouldHit(t0.dealer)) {
    const t = { ...t0, dealer: t0.dealer.slice() }
    t.dealer.push(drawFrom(t))
    return t
  }
  return settleAll(t0)
}

export function settleAll(t0: Table): Table {
  const t: Table = {
    ...t0,
    seats: cloneSeats(t0.seats),
    phase: 'done',
    turn: null,
    holeUp: true,
  }
  for (const s of t.seats) {
    for (const h of s.hands) {
      const r = settle(h, t.dealer)
      h.outcome = r.outcome
      h.payout = r.payout
      h.done = true
      s.chips += r.payout
    }
  }
  return t
}

/** Net result of the round for a seat (payouts minus stakes). */
export const seatNet = (s: Seat) => s.hands.reduce((a, h) => a + (h.payout ?? 0) - h.bet, 0)

/** Back to betting; broke AIs buy back in, bets carry over (capped to chips). */
export function nextRound(t: Table): Table {
  return {
    ...t,
    seats: t.seats.map((s) => {
      const chips = s.isAI && s.chips < MIN_BET ? START_CHIPS : s.chips
      const bet = s.isAI ? aiBet(chips) : Math.min(s.bet, Math.floor(chips / 10) * 10)
      return { ...s, chips, bet, hands: [] }
    }),
    dealer: [],
    holeUp: false,
    phase: 'bet',
    turn: null,
    order: [],
    step: 0,
    shuffled: false,
  }
}
