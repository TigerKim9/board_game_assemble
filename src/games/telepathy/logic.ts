import { shuffle } from '../../lib/random'
import type { Difficulty } from '../../lib/types'

export const MAX_LIVES = 5
export const MAX_STARS = 3

export function maxLevel(players: number): number {
  if (players <= 2) return 12
  if (players === 3) return 10
  return 8
}

export type Reward = 'life' | 'star'

/** Reward granted for clearing a level. */
export const REWARDS: Record<number, Reward> = { 2: 'star', 3: 'life', 5: 'star', 6: 'life', 8: 'star', 9: 'life' }

export type Status = 'playing' | 'clear' | 'won' | 'lost'

export interface TState {
  players: number
  level: number
  lives: number
  stars: number
  hands: number[][]
  pile: number[]
  /** Cards lost to mistakes or throwing stars this level. */
  discarded: number[]
  status: Status
  /** Reward given for the level just cleared. */
  reward: Reward | null
}

export function dealHands(players: number, level: number, rng: () => number = Math.random): number[][] {
  const deck = shuffle(
    Array.from({ length: 100 }, (_, i) => i + 1),
    rng,
  )
  return Array.from({ length: players }, (_, p) => deck.slice(p * level, (p + 1) * level).sort((a, b) => a - b))
}

export function newGame(players: number, rng: () => number = Math.random): TState {
  return {
    players,
    level: 1,
    lives: players,
    stars: 1,
    hands: dealHands(players, 1, rng),
    pile: [],
    discarded: [],
    status: 'playing',
    reward: null,
  }
}

export function topCard(s: TState): number {
  return s.pile.length ? s.pile[s.pile.length - 1] : 0
}

export function cardsLeft(s: TState): number {
  return s.hands.reduce((a, h) => a + h.length, 0)
}

function afterChange(s: TState): TState {
  if (s.lives <= 0) return { ...s, lives: 0, status: 'lost' }
  if (cardsLeft(s) > 0) return s
  if (s.level >= maxLevel(s.players)) return { ...s, status: 'won', reward: null }
  const reward = REWARDS[s.level] ?? null
  return {
    ...s,
    status: 'clear',
    reward,
    lives: reward === 'life' ? Math.min(MAX_LIVES, s.lives + 1) : s.lives,
    stars: reward === 'star' ? Math.min(MAX_STARS, s.stars + 1) : s.stars,
  }
}

export interface Mistake {
  /** Lower cards that were still in someone's hand, with their owners. */
  lower: { player: number; card: number }[]
}

/** Player plays their lowest card. Any lower card still held anywhere is a mistake. */
export function play(s: TState, player: number): { state: TState; mistake: Mistake | null } {
  if (s.status !== 'playing' || !s.hands[player]?.length) return { state: s, mistake: null }
  const card = s.hands[player][0]
  const lower: { player: number; card: number }[] = []
  s.hands.forEach((h, p) => {
    for (const c of h) if (c < card) lower.push({ player: p, card: c })
  })
  const hands = s.hands.map((h) => h.filter((c) => c > card))
  const next: TState = {
    ...s,
    hands,
    pile: [...s.pile, card],
    discarded: [...s.discarded, ...lower.map((l) => l.card)],
    lives: lower.length ? s.lives - 1 : s.lives,
  }
  return { state: afterChange(next), mistake: lower.length ? { lower } : null }
}

/** Everyone agrees to throw a star: each player discards their lowest card. */
export function throwStar(s: TState): { state: TState; thrown: { player: number; card: number }[] } {
  if (s.status !== 'playing' || s.stars <= 0) return { state: s, thrown: [] }
  const thrown: { player: number; card: number }[] = []
  const hands = s.hands.map((h, p) => {
    if (h.length) thrown.push({ player: p, card: h[0] })
    return h.slice(1)
  })
  const next: TState = { ...s, hands, stars: s.stars - 1, discarded: [...s.discarded, ...thrown.map((t) => t.card)] }
  return { state: afterChange(next), thrown }
}

export function nextLevel(s: TState, rng: () => number = Math.random): TState {
  if (s.status !== 'clear') return s
  const level = s.level + 1
  return { ...s, level, hands: dealHands(s.players, level, rng), pile: [], discarded: [], status: 'playing', reward: null }
}

/** Milliseconds of silence per number of gap — the shared "inner count" tempo. */
export const TEMPO = 165

const NOISE: Record<Difficulty, number> = { easy: 0.32, normal: 0.18, hard: 0.09 }

function gauss(rng: () => number): number {
  const u = Math.max(1e-9, rng())
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * How long an AI teammate waits before playing its lowest card. The AI silently counts
 * up from the top card at a steady tempo; difficulty controls how steady that count is.
 */
export function aiDelay(lowest: number, top: number, diff: Difficulty, rng: () => number = Math.random): number {
  const gap = Math.max(1, lowest - top)
  const base = 450 + gap * TEMPO
  const noisy = base * (1 + gauss(rng) * NOISE[diff])
  // Very small gaps: play almost at once (still a hair of hesitation).
  if (gap <= 2) return Math.round(350 + rng() * 250 * (diff === 'hard' ? 0.5 : 1))
  return Math.round(Math.max(300, noisy))
}

/** Would an AI teammate like to throw a star right now? (Big gap and nothing near.) */
export function aiAgreesStar(lowest: number | undefined, top: number): boolean {
  if (lowest == null) return true
  return lowest - top > 3
}
