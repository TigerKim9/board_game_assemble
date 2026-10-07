import { shuffle } from '../../lib/random'
import type { Difficulty } from '../../lib/types'

export const LOW = 3
export const HIGH = 35
export const REMOVED = 9

export function startingChips(players: number): number {
  if (players >= 7) return 7
  if (players === 6) return 9
  return 11
}

export interface NTState {
  deck: number[]
  /** Card currently on offer (null when the game is over). */
  card: number | null
  pot: number
  hands: number[][]
  chips: number[]
  turn: number
  removed: number[]
}

export function newGame(players: number, rng: () => number = Math.random): NTState {
  const all = shuffle(
    Array.from({ length: HIGH - LOW + 1 }, (_, i) => LOW + i),
    rng,
  )
  const removed = all.slice(0, REMOVED).sort((a, b) => a - b)
  const deck = all.slice(REMOVED)
  const card = deck.pop() ?? null
  return {
    deck,
    card,
    pot: 0,
    hands: Array.from({ length: players }, () => []),
    chips: Array.from({ length: players }, () => startingChips(players)),
    turn: 0,
    removed,
  }
}

/** Sum of the lowest card of each run of consecutive numbers. */
export function cardPoints(hand: number[]): number {
  const s = [...hand].sort((a, b) => a - b)
  let sum = 0
  for (let i = 0; i < s.length; i++) if (i === 0 || s[i] !== s[i - 1] + 1) sum += s[i]
  return sum
}

export function score(hand: number[], chips: number): number {
  return cardPoints(hand) - chips
}

/** Group a hand into runs for display. */
export function runs(hand: number[]): number[][] {
  const s = [...hand].sort((a, b) => a - b)
  const out: number[][] = []
  for (const c of s) {
    const last = out[out.length - 1]
    if (last && last[last.length - 1] === c - 1) last.push(c)
    else out.push([c])
  }
  return out
}

export function canPass(s: NTState): boolean {
  return s.card != null && s.chips[s.turn] > 0
}

export function pass(s: NTState): NTState {
  if (!canPass(s)) return s
  const chips = s.chips.slice()
  chips[s.turn]--
  return { ...s, chips, pot: s.pot + 1, turn: (s.turn + 1) % s.hands.length }
}

/** Take the card and pot; the same player flips the next card. */
export function take(s: NTState): NTState {
  if (s.card == null) return s
  const hands = s.hands.map((h, i) => (i === s.turn ? [...h, s.card as number].sort((a, b) => a - b) : h))
  const chips = s.chips.map((c, i) => (i === s.turn ? c + s.pot : c))
  const deck = s.deck.slice()
  const card = deck.pop() ?? null
  return { ...s, hands, chips, deck, card, pot: 0 }
}

export function isOver(s: NTState): boolean {
  return s.card == null
}

export function scores(s: NTState): number[] {
  return s.hands.map((h, i) => score(h, s.chips[i]))
}

/** Points added to a hand's card total by taking this card. */
export function marginalCost(hand: number[], card: number): number {
  return cardPoints([...hand, card]) - cardPoints(hand)
}

/**
 * AI decision. Returns true to take the card.
 * The AI weighs how much the card hurts against the chips in the pot, values chips more
 * when running low, and (on harder levels) lets a card it likes travel around once more
 * to collect extra chips when nobody else is likely to grab it.
 */
export function aiShouldTake(s: NTState, diff: Difficulty, rng: () => number = Math.random): boolean {
  const me = s.turn
  const card = s.card
  if (card == null) return false
  if (s.chips[me] <= 0) return true
  const hand = s.hands[me]
  const cost = marginalCost(hand, card)
  const myChips = s.chips[me]
  // A chip is worth a bit more than one point when we're short of them.
  const chipValue = myChips <= 2 ? 2.2 : myChips <= 5 ? 1.5 : 1.1
  const net = cost - s.pot * chipValue

  if (diff === 'easy') {
    // Simple greedy rule with a lot of noise.
    if (cost <= 2 && rng() < 0.7) return true
    return net + (rng() - 0.5) * 16 < 3
  }

  const others = s.hands.map((_, i) => i).filter((i) => i !== me)
  const othersWant = others.some((i) => marginalCost(s.hands[i], card) <= 2 || s.chips[i] === 0)

  // A card that fits our run: milk it while it is safe.
  if (cost <= 1) {
    if (diff === 'hard' && !othersWant && s.pot < 4 && myChips > 2) return false
    return true
  }
  // Remaining deck size matters: late in the game chips are worth less.
  const lateness = 1 - s.deck.length / (HIGH - LOW + 1 - REMOVED)
  const threshold = diff === 'hard' ? 2 + lateness * 3 : 4 + (rng() - 0.5) * 6
  if (net <= threshold) return true
  // A cheap card early on with a decent pot is worth taking.
  return cost <= 8 && s.pot >= cost * (diff === 'hard' ? 0.55 : 0.7)
}
