/**
 * 도둑잡기 (Old Maid with one joker) — pure rules + AI.
 * 53 cards (52 + 1 joker) are dealt out; everyone discards pairs of equal rank.
 * On your turn draw one face-down card from the next player still holding cards; discard a pair
 * if it makes one. Players who run out of cards escape. The last player holding the joker is the 도둑.
 */
import { createDeck, isJoker, rankLabel, shuffleDeck, sortCards, type Card } from '../../cards/deck'
import { shuffle } from '../../lib/random'
import { pushLog, type LogEntry } from '../onecard/log'

export interface OMState {
  n: number
  names: string[]
  /** Seats whose hand order is kept secret by shuffling (AI seats). */
  shuffled: boolean[]
  hands: Card[][]
  /** Current drawer. */
  turn: number
  /** Players who escaped, in order. */
  out: number[]
  loser: number | null
  over: boolean
  /** Number of discarded pairs. */
  pairs: number
  lastPair: Card[] | null
  log: LogEntry[]
  last?: { by: number; from: number; card: Card; paired: boolean }
}

/** Remove every pair of equal rank. Returns the kept cards and the discarded pairs (flat). */
export function removePairs(hand: readonly Card[]): { kept: Card[]; removed: Card[] } {
  const byRank = new Map<number, Card[]>()
  for (const c of hand) {
    if (isJoker(c)) continue
    byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c])
  }
  const removed: Card[] = []
  for (const cards of byRank.values()) {
    const k = cards.length - (cards.length % 2)
    removed.push(...cards.slice(0, k))
  }
  const ids = new Set(removed.map((c) => c.id))
  return { kept: hand.filter((c) => !ids.has(c.id)), removed }
}

export const hasCards = (s: OMState, p: number) => s.hands[p].length > 0

/** First player after `p` (clockwise) who still holds cards; -1 if none. */
export function nextWithCards(s: Pick<OMState, 'n' | 'hands'>, p: number, includeSelf = false): number {
  for (let k = includeSelf ? 0 : 1; k <= s.n; k++) {
    const i = (p + k) % s.n
    if (s.hands[i].length > 0 && (includeSelf || i !== p)) return i
  }
  return -1
}

/** The player `p` draws from. */
export const targetOf = (s: OMState, p: number) => nextWithCards(s, p)

function settle(s: OMState): OMState {
  const left = s.hands.map((h, i) => (h.length ? i : -1)).filter((i) => i >= 0)
  if (left.length <= 1) {
    const loser = left.length ? left[0] : null
    return {
      ...s,
      over: true,
      loser,
      log: loser !== null ? pushLog(s.log, `🃏 ${s.names[loser]}님이 도둑(조커)을 쥐었어요!`, 'bad') : s.log,
    }
  }
  return s
}

export function newGame(names: string[], shuffled: boolean[], rng: () => number = Math.random): OMState {
  const n = names.length
  const deck = shuffleDeck(createDeck({ jokers: 1 }), rng)
  const hands: Card[][] = Array.from({ length: n }, () => [])
  deck.forEach((c, i) => hands[i % n].push(c))
  let pairs = 0
  const cleaned = hands.map((h, i) => {
    const r = removePairs(h)
    pairs += r.removed.length / 2
    return shuffled[i] ? shuffle(r.kept, rng) : sortCards(r.kept)
  })
  const start = Math.floor(rng() * n)
  let s: OMState = {
    n,
    names,
    shuffled,
    hands: cleaned,
    turn: start,
    out: [],
    loser: null,
    over: false,
    pairs,
    lastPair: null,
    log: pushLog([], `짝 ${pairs}쌍을 먼저 버렸어요. ${names[start]}부터 시작!`, 'info'),
  }
  // Rarely someone is dealt only pairs.
  const out = cleaned.map((h, i) => (h.length ? -1 : i)).filter((i) => i >= 0)
  if (out.length) s = { ...s, out }
  if (!hasCards(s, s.turn)) s = { ...s, turn: nextWithCards(s, s.turn) }
  return settle(s)
}

/** Player `p` (must be the current drawer) takes card `index` from their target. */
export function drawFrom(s: OMState, p: number, index: number, rng: () => number = Math.random): OMState {
  if (s.over || s.turn !== p) return s
  const from = targetOf(s, p)
  if (from < 0 || index < 0 || index >= s.hands[from].length) return s
  const card = s.hands[from][index]
  const hands = s.hands.slice()
  hands[from] = hands[from].filter((_, i) => i !== index)
  const match = hands[p].find((c) => !isJoker(card) && c.rank === card.rank)
  let pairs = s.pairs
  let lastPair = s.lastPair
  const by = s.names[p]
  let log = s.log
  if (match) {
    hands[p] = hands[p].filter((c) => c.id !== match.id)
    pairs++
    lastPair = [match, card]
    log = pushLog(log, `${by}: ${s.names[from]}에게서 뽑아 ${rankLabel(card.rank)} 짝! 🎯`, 'good')
  } else {
    hands[p] = s.shuffled[p] ? shuffle([...hands[p], card], rng) : [...hands[p], card]
    log = pushLog(log, `${by}: ${s.names[from]}에게서 한 장 뽑았어요`)
  }
  const out = s.out.slice()
  for (const i of [from, p]) {
    if (hands[i].length === 0 && !out.includes(i)) {
      out.push(i)
      log = pushLog(log, `🎉 ${s.names[i]} 탈출!`, 'good')
    }
  }
  let next: OMState = { ...s, hands, pairs, lastPair, out, log, last: { by: p, from, card, paired: !!match } }
  next = settle(next)
  if (!next.over) next.turn = nextWithCards(next, from, true)
  return next
}

/** Human (or AI) shuffles their own hand. */
export function shuffleHand(s: OMState, p: number, rng: () => number = Math.random): OMState {
  const hands = s.hands.slice()
  hands[p] = shuffle(hands[p], rng)
  return { ...s, hands }
}

/** AI picks a card index from its target (blind). */
export function aiPick(s: OMState, p: number, rng: () => number = Math.random): number {
  const from = targetOf(s, p)
  return Math.floor(rng() * s.hands[from].length)
}

/** Final order, best first: escapees in order, loser last. */
export function ranking(s: OMState): number[] {
  const rest = Array.from({ length: s.n }, (_, i) => i).filter((i) => !s.out.includes(i) && i !== s.loser)
  return [...s.out, ...rest, ...(s.loser !== null ? [s.loser] : [])]
}
