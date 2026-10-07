import type { Difficulty } from '../../lib/types'

export type Mode = 'signal' | 'color'

export const COLOR_WORDS = [
  { word: '빨강', color: '#e53935' },
  { word: '파랑', color: '#1e6fd9' },
  { word: '초록', color: '#2ea44f' },
  { word: '노랑', color: '#f2b705' },
  { word: '보라', color: '#8e44ad' },
]

export interface Card {
  word: number
  ink: number
}
export const isMatch = (c: Card) => c.word === c.ink

export const SOLO_TRIES = 5
export const SOLO_COLOR_CARDS = 20

/** Random wait before the signal (ms). */
export function randomDelay(rng: () => number = Math.random, min = 1500, max = 4500): number {
  return Math.round(min + rng() * (max - min))
}

/** A card whose word and ink colour do (or don't) match. */
export function makeCard(match: boolean, rng: () => number = Math.random, prev?: Card): Card {
  const n = COLOR_WORDS.length
  for (let tries = 0; tries < 20; tries++) {
    const word = Math.floor(rng() * n)
    let ink = word
    if (!match) ink = (word + 1 + Math.floor(rng() * (n - 1))) % n
    const c = { word, ink }
    if (!prev || prev.word !== c.word || prev.ink !== c.ink) return c
  }
  return { word: 0, ink: match ? 0 : 1 }
}

/** How many non-matching cards to show before the next matching one. */
export function decoysBeforeMatch(rng: () => number = Math.random): number {
  return 1 + Math.floor(rng() * 5) // 1..5
}

/** Solo colour run: a fixed sequence of cards with roughly a third matching, never two matches in a row. */
export function colorRun(rng: () => number = Math.random, length = SOLO_COLOR_CARDS): Card[] {
  const out: Card[] = []
  let sinceMatch = 0
  for (let i = 0; i < length; i++) {
    const match = i > 0 && sinceMatch >= 1 && (rng() < 0.38 || sinceMatch >= 4)
    const c = makeCard(match, rng, out[i - 1])
    out.push(c)
    sinceMatch = match ? 0 : sinceMatch + 1
  }
  return out
}

/** How long a card stays on screen in colour mode (ms). Speeds up over time. */
export function cardDuration(index: number): number {
  return Math.max(700, 1250 - index * 20)
}

// ---------- AI ----------

const AI_MS: Record<Difficulty, [number, number]> = {
  easy: [360, 520],
  normal: [270, 370],
  hard: [195, 265],
}

/** Reaction time of an AI player for one signal (ms). Colour mode needs extra time to read the word. */
export function aiReaction(difficulty: Difficulty, mode: Mode, rng: () => number = Math.random): number {
  const [lo, hi] = AI_MS[difficulty]
  return Math.round(lo + rng() * (hi - lo) + (mode === 'color' ? 220 : 0))
}

/** Chance that an AI taps a decoy card in colour mode. */
export const AI_FOUL: Record<Difficulty, number> = { easy: 0.1, normal: 0.05, hard: 0.02 }

// ---------- scoring ----------

export function average(times: number[]): number {
  if (!times.length) return 0
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length)
}

export function rating(ms: number): string {
  if (ms < 200) return '⚡ 번개 같은 반사신경!'
  if (ms < 250) return '🚀 아주 빨라요!'
  if (ms < 300) return '👍 좋아요!'
  if (ms < 360) return '🙂 평균 정도예요'
  if (ms < 450) return '🐢 조금 느긋하네요'
  return '😴 졸린가요?'
}

export interface ColorRunResult {
  hits: number
  misses: number
  fouls: number
  times: number[]
}

/** Solo colour score: 100 per hit plus a speed bonus, −50 per wrong tap or missed match. */
export function colorScore(r: ColorRunResult): number {
  const bonus = r.times.reduce((a, t) => a + Math.max(0, Math.round((900 - t) / 6)), 0)
  return Math.max(0, r.hits * 100 + bonus - r.fouls * 50 - r.misses * 50)
}

/** Earliest valid tap wins; fouled players are ignored. Returns null when nobody tapped. */
export function roundWinner(taps: { player: number; at: number }[], fouled: boolean[]): number | null {
  let best: { player: number; at: number } | null = null
  for (const t of taps) {
    if (fouled[t.player]) continue
    if (!best || t.at < best.at) best = t
  }
  return best ? best.player : null
}

export function matchWinner(scores: number[], target: number): number | null {
  const i = scores.findIndex((s) => s >= target)
  return i >= 0 ? i : null
}
