import { rollDie } from '../../lib/random'
import type { Difficulty } from '../../lib/types'

// ---------- scoring ----------

function counts(dice: number[]): number[] {
  const c = [0, 0, 0, 0, 0, 0, 0]
  for (const d of dice) c[d]++
  return c
}

const SINGLE: Record<number, number> = { 1: 100, 5: 50 }

/** Score for k (≥3) dice of the same face. */
export function kindScore(face: number, k: number): number {
  if (k === 3) return face === 1 ? 1000 : face * 100
  if (k === 4) return 1000
  if (k === 5) return 2000
  if (k === 6) return 3000
  return 0
}

/** Best score using the given count of one face, or null when some die can't score. */
function faceScore(face: number, c: number): number | null {
  if (c === 0) return 0
  let best: number | null = null
  for (const k of [0, 3, 4, 5, 6]) {
    if (k > c) continue
    const rest = c - k
    if (rest > 0 && !SINGLE[face]) continue
    const v = (k ? kindScore(face, k) : 0) + rest * (SINGLE[face] ?? 0)
    if (best == null || v > best) best = v
  }
  return best
}

/**
 * Score of a set-aside selection where EVERY die must count.
 * Returns null when the selection contains a non-scoring die (or is empty).
 */
export function scoreSelection(dice: number[]): number | null {
  if (dice.length === 0) return null
  const c = counts(dice)
  let best: number | null = null
  if (dice.length === 6) {
    const nz = c.filter((n) => n > 0).sort()
    if (nz.length === 6) best = 1500 // 1-2-3-4-5-6
    else if (nz.length === 3 && nz.every((n) => n === 2)) best = 1500 // three pairs
    else if (nz.length === 2 && nz[0] === 2 && nz[1] === 4) best = 1500 // four of a kind + pair
    else if (nz.length === 2 && nz[0] === 3 && nz[1] === 3) best = 2500 // two triplets
  }
  let sum = 0
  for (let f = 1; f <= 6; f++) {
    const v = faceScore(f, c[f])
    if (v == null) {
      sum = -1
      break
    }
    sum += v
  }
  if (sum >= 0 && (best == null || sum > best)) best = sum
  return best
}

/** Every index subset of the dice that scores, with its score. */
export function scoringSubsets(dice: number[]): { idx: number[]; score: number }[] {
  const out: { idx: number[]; score: number }[] = []
  const n = dice.length
  for (let m = 1; m < 1 << n; m++) {
    const idx: number[] = []
    for (let i = 0; i < n; i++) if ((m >> i) & 1) idx.push(i)
    const sc = scoreSelection(idx.map((i) => dice[i]))
    if (sc != null) out.push({ idx, score: sc })
  }
  return out
}

/** Highest possible score from any subset of a roll; 0 means FARKLE. */
export function bestRollScore(dice: number[]): number {
  let best = 0
  for (const s of scoringSubsets(dice)) best = Math.max(best, s.score)
  return best
}

export const isFarkle = (dice: number[]) => bestRollScore(dice) === 0

export function rollN(n: number): number[] {
  return Array.from({ length: n }, () => rollDie())
}

// ---------- AI ----------

/** Rough value of being able to roll n more dice (n = 0 means hot dice → 6). */
const ROLL_VALUE = [400, 25, 50, 90, 150, 250, 400]
/** Chance a roll of n dice scores nothing. */
export const FARKLE_CHANCE = [0, 2 / 3, 4 / 9, 0.278, 0.157, 0.077, 0.023]

export interface AiContext {
  turnTotal: number
  myScore: number
  target: number
  /** Score to beat during the final round, otherwise null. */
  mustBeat: number | null
  /** Best opponent score. */
  oppBest: number
  difficulty: Difficulty
  rng?: () => number
}

/** Pick which dice to set aside from a (non-farkle) roll. */
export function aiChooseKeep(dice: number[], ctx: AiContext): number[] {
  const subsets = scoringSubsets(dice)
  if (ctx.difficulty === 'easy') {
    // Grab every scoring die there is.
    return subsets.reduce((a, b) => (b.score > a.score || (b.score === a.score && b.idx.length > a.idx.length) ? b : a)).idx
  }
  let best = subsets[0]
  let bestV = -Infinity
  for (const s of subsets) {
    const left = dice.length - s.idx.length
    const v = s.score + ROLL_VALUE[left] * (ctx.difficulty === 'hard' ? 1 : 0.6)
    if (v > bestV || (v === bestV && s.score > best.score)) {
      bestV = v
      best = s
    }
  }
  return best.idx
}

const BANK_AT: Record<Difficulty, number[]> = {
  // index = dice left to roll (0 → hot dice, always roll)
  easy: [Infinity, 200, 250, 300, 350, 400, 99999],
  normal: [Infinity, 300, 300, 350, 500, 1000, 99999],
  hard: [Infinity, 250, 300, 400, 700, 2000, 99999],
}

/** After setting dice aside: true = bank now, false = keep rolling. */
export function aiShouldBank(turnTotal: number, diceLeft: number, ctx: AiContext): boolean {
  const rng = ctx.rng ?? Math.random
  const total = ctx.myScore + turnTotal
  if (diceLeft === 0) {
    // Hot dice: rolling all six is almost free — but bank if it wins outright.
    return ctx.mustBeat == null && total >= ctx.target
  }
  if (ctx.mustBeat != null) return total > ctx.mustBeat
  if (total >= ctx.target) return true
  let limit = BANK_AT[ctx.difficulty][diceLeft]
  if (ctx.difficulty === 'easy') {
    if (rng() < 0.2) return rng() < 0.5
  }
  if (ctx.difficulty === 'hard') {
    // Chase harder when far behind, play safe when ahead.
    const gap = ctx.oppBest - ctx.myScore
    if (gap > 3000) limit *= 1.5
    else if (gap < -2000) limit *= 0.8
  }
  return turnTotal >= limit
}
