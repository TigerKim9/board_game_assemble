import { shuffle } from '../../lib/random'
import type { Difficulty } from '../../lib/types'

export const MAX_CARD = 104
export const ROW_LIMIT = 5
export const HAND_SIZE = 10
export const END_SCORE = 66

/** Penalty heads printed on each card. */
export function heads(card: number): number {
  if (card === 55) return 7
  if (card % 11 === 0) return 5
  if (card % 10 === 0) return 3
  if (card % 5 === 0) return 2
  return 1
}

export function sumHeads(cards: number[]): number {
  return cards.reduce((a, c) => a + heads(c), 0)
}

export interface Deal {
  rows: number[][]
  hands: number[][]
}

export function deal(players: number, rng: () => number = Math.random): Deal {
  const deck = shuffle(
    Array.from({ length: MAX_CARD }, (_, i) => i + 1),
    rng,
  )
  const hands = Array.from({ length: players }, (_, p) =>
    deck.slice(p * HAND_SIZE, (p + 1) * HAND_SIZE).sort((a, b) => a - b),
  )
  const rest = deck.slice(players * HAND_SIZE)
  const rows = [0, 1, 2, 3].map((i) => [rest[i]])
  return { rows, hands }
}

/** Which row a card goes to: the row whose last card is the highest one still below it. -1 if none. */
export function targetRow(rows: number[][], card: number): number {
  let best = -1
  let bestTop = -1
  rows.forEach((r, i) => {
    const top = r[r.length - 1]
    if (top < card && top > bestTop) {
      best = i
      bestTop = top
    }
  })
  return best
}

export interface PlaceResult {
  rows: number[][]
  taken: number[]
}

/** Place a card by the normal rule (card must fit some row). */
export function placeCard(rows: number[][], card: number): PlaceResult & { row: number } {
  const row = targetRow(rows, card)
  if (row < 0) throw new Error('card is lower than every row')
  if (rows[row].length >= ROW_LIMIT) {
    return { row, taken: rows[row], rows: rows.map((r, i) => (i === row ? [card] : r)) }
  }
  return { row, taken: [], rows: rows.map((r, i) => (i === row ? [...r, card] : r)) }
}

/** A card lower than every row: its owner takes a row of their choice and the card starts it. */
export function takeRow(rows: number[][], row: number, card: number): PlaceResult {
  return { taken: rows[row], rows: rows.map((r, i) => (i === row ? [card] : r)) }
}

/** Cheapest row to take (fewest heads, then fewest cards). */
export function cheapestRow(rows: number[][]): number {
  let best = 0
  for (let i = 1; i < rows.length; i++) {
    const a = sumHeads(rows[i])
    const b = sumHeads(rows[best])
    if (a < b || (a === b && rows[i].length < rows[best].length)) best = i
  }
  return best
}

/** Resolve a full turn where every player has picked a card; others always take the cheapest row. */
export function resolveAll(rows: number[][], plays: { player: number; card: number }[]): { rows: number[][]; taken: number[][] } {
  const order = [...plays].sort((a, b) => a.card - b.card)
  const taken: number[][] = plays.map(() => [])
  const byPlayer = new Map<number, number>()
  plays.forEach((p, i) => byPlayer.set(p.player, i))
  let cur = rows
  for (const { player, card } of order) {
    const idx = byPlayer.get(player) as number
    if (targetRow(cur, card) < 0) {
      const r = takeRow(cur, cheapestRow(cur), card)
      taken[idx].push(...r.taken)
      cur = r.rows
    } else {
      const r = placeCard(cur, card)
      taken[idx].push(...r.taken)
      cur = r.rows
    }
  }
  return { rows: cur, taken }
}

const SAMPLES: Record<Difficulty, number> = { easy: 3, normal: 14, hard: 48 }

/**
 * Pick a card by Monte Carlo: for each candidate, sample what the other players might play
 * from the unseen cards and measure the penalty we'd take.
 */
export function aiChooseCard(
  rows: number[][],
  hand: number[],
  opponents: number,
  seen: Set<number>,
  diff: Difficulty,
  rng: () => number = Math.random,
): number {
  if (hand.length === 1) return hand[0]
  if (diff === 'easy' && rng() < 0.35) return hand[Math.floor(rng() * hand.length)]
  const known = new Set<number>([...seen, ...hand, ...rows.flat()])
  const unseen: number[] = []
  for (let c = 1; c <= MAX_CARD; c++) if (!known.has(c)) unseen.push(c)
  const samples = SAMPLES[diff]
  let best = hand[0]
  let bestScore = Infinity
  for (const card of hand) {
    let total = 0
    for (let k = 0; k < samples; k++) {
      const pool = shuffle(unseen, rng)
      const plays = [{ player: 0, card }]
      for (let o = 0; o < opponents && o < pool.length; o++) plays.push({ player: o + 1, card: pool[o] })
      total += sumHeads(resolveAll(rows, plays).taken[0])
    }
    let score = total / samples
    // Small preference to keep middle cards flexible and get rid of extreme high cards early on hard.
    if (diff === 'hard') score += Math.abs(card - 52) * 0.002
    if (diff !== 'hard') score += (rng() - 0.5) * (diff === 'easy' ? 2 : 0.6)
    if (score < bestScore) {
      bestScore = score
      best = card
    }
  }
  return best
}

/** AI choosing a row when its card is lower than every row. */
export function aiChooseRow(rows: number[][], diff: Difficulty, rng: () => number = Math.random): number {
  if (diff === 'easy' && rng() < 0.3) return Math.floor(rng() * rows.length)
  return cheapestRow(rows)
}
