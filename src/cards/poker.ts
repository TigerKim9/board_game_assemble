/**
 * Poker hand evaluation (no jokers).
 *
 * - `evaluate5(cards)` ranks exactly five cards.
 * - `bestHand(cards)` picks the best five out of 5–7 cards (Texas Hold'em, 7-card stud…).
 * - `compareHands(a, b)` > 0 when `a` wins, < 0 when `b` wins, 0 on a tie (split pot).
 *
 * Aces are high, except in the wheel A-2-3-4-5 (백 스트레이트), which is the lowest straight.
 * Suits never break ties.
 */
import { rankValue, type Card } from './deck'

export const HAND_CATEGORY = {
  HIGH_CARD: 0,
  ONE_PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
  ROYAL_FLUSH: 9,
} as const
export type HandCategory = (typeof HAND_CATEGORY)[keyof typeof HAND_CATEGORY]

/** Korean names, indexed by category. */
export const HAND_NAMES_KO: readonly string[] = [
  '하이 카드',
  '원페어',
  '투페어',
  '트리플',
  '스트레이트',
  '플러시',
  '풀하우스',
  '포카드',
  '스트레이트 플러시',
  '로열 스트레이트 플러시',
]

export interface HandResult {
  category: HandCategory
  /** Korean hand name, e.g. "풀하우스". */
  name: string
  /** Tie-break values (ace = 14; wheel straight top = 5), most significant first. */
  ranks: number[]
  /** The five cards that make the hand, ordered: grouped cards first, then kickers high→low. */
  cards: Card[]
}

/** Evaluate exactly five cards. */
export function evaluate5(cards: readonly Card[]): HandResult {
  if (cards.length !== 5) throw new Error('evaluate5 needs exactly 5 cards')
  const vals = cards.map((c) => rankValue(c.rank, true))
  const flush = cards.every((c) => c.suit === cards[0].suit)

  // Group by value: sort by (count desc, value desc).
  const count = new Map<number, number>()
  for (const v of vals) count.set(v, (count.get(v) ?? 0) + 1)
  const groups = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const distinct = groups.map((g) => g[0])

  let straightTop = 0
  if (groups.length === 5) {
    const sorted = distinct.slice().sort((a, b) => b - a)
    if (sorted[0] - sorted[4] === 4) straightTop = sorted[0]
    else if (sorted.join() === '14,5,4,3,2') straightTop = 5
  }

  const ordered = orderCards(
    cards,
    groups.map((g) => g[0]),
    straightTop,
  )
  const make = (category: HandCategory, ranks: number[]): HandResult => ({
    category,
    name: HAND_NAMES_KO[category],
    ranks,
    cards: ordered,
  })

  if (straightTop && flush) return make(straightTop === 14 ? 9 : 8, [straightTop])
  if (groups[0][1] === 4) return make(7, distinct)
  if (groups[0][1] === 3 && groups[1][1] === 2) return make(6, distinct)
  if (flush) return make(5, distinct)
  if (straightTop) return make(4, [straightTop])
  if (groups[0][1] === 3) return make(3, distinct)
  if (groups[0][1] === 2 && groups[1][1] === 2) return make(2, distinct)
  if (groups[0][1] === 2) return make(1, distinct)
  return make(0, distinct)
}

function orderCards(cards: readonly Card[], valueOrder: number[], straightTop: number): Card[] {
  const v = (c: Card) => rankValue(c.rank, true)
  if (straightTop === 5) {
    // wheel: 5 4 3 2 A
    return cards.slice().sort((a, b) => (v(b) === 14 ? 1 : v(b)) - (v(a) === 14 ? 1 : v(a)))
  }
  return cards.slice().sort((a, b) => valueOrder.indexOf(v(a)) - valueOrder.indexOf(v(b)))
}

/** Compare two evaluated hands: positive if `a` is better, negative if `b` is, 0 if equal. */
export function compareHands(a: HandResult, b: HandResult): number {
  if (a.category !== b.category) return a.category - b.category
  for (let i = 0; i < Math.max(a.ranks.length, b.ranks.length); i++) {
    const d = (a.ranks[i] ?? 0) - (b.ranks[i] ?? 0)
    if (d) return d
  }
  return 0
}

/** Best five-card hand out of 5–7 (or more) cards. */
export function bestHand(cards: readonly Card[]): HandResult {
  if (cards.length < 5) throw new Error('bestHand needs at least 5 cards')
  let best: HandResult | null = null
  const n = cards.length
  const idx = [0, 1, 2, 3, 4]
  // iterate all 5-combinations
  for (;;) {
    const r = evaluate5(idx.map((i) => cards[i]))
    if (!best || compareHands(r, best) > 0) best = r
    let k = 4
    while (k >= 0 && idx[k] === n - 5 + k) k--
    if (k < 0) break
    idx[k]++
    for (let j = k + 1; j < 5; j++) idx[j] = idx[j - 1] + 1
  }
  return best!
}

/** Indices of the winning hand(s) among several players' card sets (ties → several winners). */
export function winners(hands: readonly (readonly Card[])[]): number[] {
  const results = hands.map((h) => bestHand(h))
  let top: number[] = []
  results.forEach((r, i) => {
    if (top.length === 0) top = [i]
    else {
      const c = compareHands(r, results[top[0]])
      if (c > 0) top = [i]
      else if (c === 0) top.push(i)
    }
  })
  return top
}

/** Human-friendly Korean description, e.g. "K 원페어", "백 스트레이트", "A 하이 플러시". */
export function describeHand(h: HandResult): string {
  const name = (v: number) => (v === 14 ? 'A' : v === 13 ? 'K' : v === 12 ? 'Q' : v === 11 ? 'J' : String(v))
  switch (h.category) {
    case 0:
      return `${name(h.ranks[0])} 하이`
    case 1:
      return `${name(h.ranks[0])} 원페어`
    case 2:
      return `${name(h.ranks[0])}·${name(h.ranks[1])} 투페어`
    case 3:
      return `${name(h.ranks[0])} 트리플`
    case 4:
      return h.ranks[0] === 5 ? '백 스트레이트' : h.ranks[0] === 14 ? '마운틴' : `${name(h.ranks[0])} 스트레이트`
    case 5:
      return `${name(h.ranks[0])} 하이 플러시`
    case 6:
      return `${name(h.ranks[0])} 풀하우스`
    case 7:
      return `${name(h.ranks[0])} 포카드`
    case 8:
      return h.ranks[0] === 5 ? '백 스트레이트 플러시' : `${name(h.ranks[0])} 스트레이트 플러시`
    default:
      return '로열 스트레이트 플러시'
  }
}
