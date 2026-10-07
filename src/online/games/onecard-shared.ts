// Helpers shared by the online card-game adapters (원카드 · 도둑잡기 · 대통령 · 하트 · 블랙잭).
// The engine's setup() only knows the seat count, so the pure logic gets placeholder names
// ("{0}", "{1}" …) that the online screens replace with the real seat names when showing logs.
import type { Card } from '../../cards/deck'

export const seatTokens = (n: number) => Array.from({ length: n }, (_, i) => `{${i}}`)

/** Replace "{3}" placeholders in a log line with seat names. */
export function fillNames(text: string, names: readonly string[]): string {
  return text.replace(/\{(\d)\}/g, (_, d: string) => names[Number(d)] || `${Number(d) + 1}번`)
}

export const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x)

/** Validates a list of distinct card ids that are all in `hand`; returns the cards or null. */
export function pickCards(hand: readonly Card[], ids: unknown, count?: number): Card[] | null {
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) return null
  if (new Set(ids).size !== ids.length) return null
  if (count != null && ids.length !== count) return null
  const cards = ids.map((id) => hand.find((c) => c.id === id))
  return cards.every(Boolean) ? (cards as Card[]) : null
}
