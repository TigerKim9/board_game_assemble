import { createDeck, rankValue, shuffleDeck, type Card } from '../../cards/deck'
import type { Difficulty } from '../../lib/types'

export type Guess = 'higher' | 'lower'
export type Outcome = 'right' | 'wrong' | 'same'

/** Points needed to win the multiplayer race. */
export const TARGET = 10

/** A is high (14), 2 is low. */
export const value = (c: Card) => rankValue(c.rank, true)

export function judge(guess: Guess, current: Card, next: Card): Outcome {
  const a = value(current)
  const b = value(next)
  if (a === b) return 'same'
  return b > a === (guess === 'higher') ? 'right' : 'wrong'
}

export interface Shoe {
  deck: Card[]
  current: Card
  /** Cards already seen since the last shuffle (oldest first), including `current`. */
  seen: Card[]
}

export function newShoe(rng: () => number = Math.random): Shoe {
  const deck = shuffleDeck(createDeck(), rng)
  return { deck: deck.slice(1), current: deck[0], seen: [deck[0]] }
}

/** Flip the next card. When the deck runs out, the other 51 cards are reshuffled. */
export function flip(s: Shoe, rng: () => number = Math.random): { shoe: Shoe; card: Card; reshuffled: boolean } {
  let deck = s.deck
  let seen = s.seen
  let reshuffled = false
  if (deck.length === 0) {
    deck = shuffleDeck(
      createDeck().filter((c) => c.id !== s.current.id),
      rng,
    )
    seen = [s.current]
    reshuffled = true
  }
  const card = deck[0]
  return {
    shoe: { deck: deck.slice(1), current: card, seen: [...seen, card] },
    card,
    reshuffled,
  }
}

/** How many of the remaining cards are higher / lower / equal to the current card. */
export function odds(deck: readonly Card[], current: Card): { higher: number; lower: number; same: number } {
  const v = value(current)
  let higher = 0
  let lower = 0
  let same = 0
  for (const c of deck) {
    const w = value(c)
    if (w > v) higher++
    else if (w < v) lower++
    else same++
  }
  return { higher, lower, same }
}

/** Odds assuming a fresh 52-card deck (what a player who isn't counting would estimate). */
export function naiveOdds(current: Card): {
  higher: number
  lower: number
  same: number
} {
  const v = value(current)
  return { higher: (14 - v) * 4, lower: (v - 2) * 4, same: 3 }
}

/** Chance (0..1) that the better guess is right, plus that guess. */
export function bestGuess(deck: readonly Card[], current: Card, counting: boolean): { guess: Guess; p: number } {
  const o = counting && deck.length ? odds(deck, current) : naiveOdds(current)
  const total = o.higher + o.lower + o.same || 1
  return o.higher >= o.lower ? { guess: 'higher', p: o.higher / total } : { guess: 'lower', p: o.lower / total }
}

export function aiGuess(
  deck: readonly Card[],
  current: Card,
  diff: Difficulty,
  rng: () => number = Math.random,
): Guess {
  const best = bestGuess(deck, current, diff === 'hard')
  if (diff === 'easy' && rng() < 0.3) return rng() < 0.5 ? 'higher' : 'lower'
  return best.guess
}

/**
 * Should the AI bank its pot now? `pot` = points at risk this turn, `score` = banked points.
 * Easy: stops at a fixed 3. Normal: stops once the next guess looks shaky. Hard: compares the
 * chance of success with the value at risk, and grabs the win when it can.
 */
export function aiShouldStop(pot: number, score: number, p: number, diff: Difficulty): boolean {
  if (pot === 0) return false
  if (score + pot >= TARGET) return true
  if (diff === 'easy') return pot >= 3
  if (diff === 'normal') return pot >= 4 || (pot >= 2 && p < 0.7)
  return p < (pot + 1) / (pot + 3)
}
