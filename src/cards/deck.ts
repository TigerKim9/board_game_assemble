/**
 * Shared playing-card (트럼프 카드) model and deck helpers.
 *
 * Conventions
 * - Suits: 'S' 스페이드 ♠, 'H' 하트 ♥, 'D' 다이아몬드 ♦, 'C' 클로버 ♣.
 * - Ranks: 1 = A, 2..10, 11 = J, 12 = Q, 13 = K. Use `rankValue(rank, true)` for ace-high (A = 14).
 * - Jokers have rank 0. Black joker uses suit 'S', red (colour) joker uses suit 'H'.
 * - Every card has a unique `id` inside one deck (also across multiple decks), handy for React keys.
 *
 * All helpers are pure; randomness is injectable (`rng`) so deals can be seeded with `mulberry32`.
 */
import { shuffle } from '../lib/random'

export type Suit = 'S' | 'H' | 'D' | 'C'
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13

export interface Card {
  /** Unique id, e.g. "S1", "H10", "D13" (second deck: "D13_1", jokers: "JK0", "JK1"). */
  id: string
  suit: Suit
  /** 1=A … 13=K, 0=joker. */
  rank: Rank
}

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C']
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

export const SUIT_SYMBOL: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
}
export const SUIT_NAME_KO: Record<Suit, string> = {
  S: '스페이드',
  H: '하트',
  D: '다이아몬드',
  C: '클로버',
}

/** Short rank label as printed on the card: A, 2…10, J, Q, K (joker → "JOKER"). */
export function rankLabel(rank: Rank): string {
  if (rank === 0) return 'JOKER'
  if (rank === 1) return 'A'
  if (rank === 11) return 'J'
  if (rank === 12) return 'Q'
  if (rank === 13) return 'K'
  return String(rank)
}

export const isJoker = (c: Card) => c.rank === 0
export const isRedSuit = (s: Suit) => s === 'H' || s === 'D'
export const isRed = (c: Card) => isRedSuit(c.suit)
/** True when the two cards have different colours (red vs black) — the solitaire stacking rule. */
export const oppositeColor = (a: Card, b: Card) => isRed(a) !== isRed(b)

/** Numeric value of a rank. With `aceHigh`, A = 14 (poker, high-low…). */
export function rankValue(rank: Rank, aceHigh = false): number {
  return aceHigh && rank === 1 ? 14 : rank
}

/** "♠A", "♥10" — compact text label. */
export function cardLabel(c: Card): string {
  if (isJoker(c)) return isRed(c) ? '컬러 조커' : '흑백 조커'
  return SUIT_SYMBOL[c.suit] + rankLabel(c.rank)
}

/** "스페이드 A" — Korean spoken name, good for aria-labels and logs. */
export function cardNameKo(c: Card): string {
  if (isJoker(c)) return isRed(c) ? '컬러 조커' : '흑백 조커'
  return `${SUIT_NAME_KO[c.suit]} ${rankLabel(c.rank)}`
}

export function makeCard(suit: Suit, rank: Rank, copy = 0): Card {
  const base = rank === 0 ? `JK${suit === 'H' ? 1 : 0}` : `${suit}${rank}`
  return { id: copy ? `${base}_${copy}` : base, suit, rank }
}

export interface DeckOptions {
  /** Number of 52-card decks to combine (default 1). */
  decks?: number
  /** Jokers per deck (0–2, default 0). The first is black, the second red. */
  jokers?: number
  /** Restrict to these suits (e.g. Spider 1-suit). Cards are still `decks * 52` total, cycling suits. */
  suits?: readonly Suit[]
}

/** New ordered deck (♠A…♠K, ♥A…, ♦A…, ♣A…). Shuffle with `shuffleDeck`. */
export function createDeck(opts: DeckOptions = {}): Card[] {
  const decks = opts.decks ?? 1
  const jokers = opts.jokers ?? 0
  const suits = opts.suits ?? SUITS
  const out: Card[] = []
  const copies = new Map<string, number>()
  for (let d = 0; d < decks; d++) {
    for (let s = 0; s < 4; s++) {
      const suit = suits[s % suits.length]
      for (const rank of RANKS) {
        const key = suit + rank
        const n = copies.get(key) ?? 0
        copies.set(key, n + 1)
        out.push(makeCard(suit, rank, n))
      }
    }
    for (let j = 0; j < jokers; j++) out.push(makeCard(j === 0 ? 'S' : 'H', 0, d))
  }
  return out
}

/** Fisher–Yates shuffle (returns a new array). Pass `mulberry32(seed)` for reproducible deals. */
export function shuffleDeck(cards: readonly Card[], rng: () => number = Math.random): Card[] {
  return shuffle(cards, rng)
}

/** Take `n` cards from the top (front) of the deck: returns [drawn, rest]. */
export function draw(deck: readonly Card[], n = 1): [Card[], Card[]] {
  return [deck.slice(0, n), deck.slice(n)]
}

/**
 * Deal `perHand` cards to `hands` players round-robin (one at a time, like a real dealer).
 * Returns the hands and the remaining deck.
 */
export function deal(deck: readonly Card[], hands: number, perHand: number): { hands: Card[][]; rest: Card[] } {
  const out: Card[][] = Array.from({ length: hands }, () => [])
  let i = 0
  for (let r = 0; r < perHand; r++) for (let h = 0; h < hands; h++) out[h].push(deck[i++])
  return { hands: out, rest: deck.slice(i) }
}

export interface SortOptions {
  aceHigh?: boolean
  /** Group by suit first (default true). */
  bySuit?: boolean
  suitOrder?: readonly Suit[]
}

/** Sorted copy of a hand — by suit then rank (default) or by rank then suit. */
export function sortCards(cards: readonly Card[], opts: SortOptions = {}): Card[] {
  const { aceHigh = false, bySuit = true, suitOrder = SUITS } = opts
  const sv = (c: Card) => suitOrder.indexOf(c.suit)
  const rv = (c: Card) => (isJoker(c) ? 99 : rankValue(c.rank, aceHigh))
  return cards.slice().sort((a, b) => (bySuit ? sv(a) - sv(b) || rv(a) - rv(b) : rv(a) - rv(b) || sv(a) - sv(b)))
}

/**
 * Parse compact notation for tests and fixtures: "AS KD 10H 2c JK".
 * Rank: A,2-10,J,Q,K (or T for 10); suit letter S/H/D/C. "JK" = black joker, "JKR" = red joker.
 */
export function parseCard(s: string): Card {
  const t = s.trim().toUpperCase()
  if (t === 'JK' || t === 'JKB') return makeCard('S', 0)
  if (t === 'JKR') return makeCard('H', 0)
  const suit = t.slice(-1) as Suit
  const r = t.slice(0, -1)
  const map: Record<string, number> = { A: 1, T: 10, J: 11, Q: 12, K: 13 }
  const rank = (map[r] ?? Number(r)) as Rank
  if (!SUITS.includes(suit) || !(rank >= 1 && rank <= 13)) throw new Error(`bad card: ${s}`)
  return makeCard(suit, rank)
}

export function parseCards(s: string): Card[] {
  return s.trim().split(/\s+/).filter(Boolean).map(parseCard)
}
