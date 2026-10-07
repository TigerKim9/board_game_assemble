import type { Difficulty } from '../../lib/types'

/** Calls closer together than this count as shouting at the same time. */
export const COLLISION_MS = 600

export interface NState {
  players: number
  /** Players who called successfully, in order (index = number − 1). */
  called: number[]
  /** A call that's still "in the air": others may collide with it. */
  window: { start: number; players: number[] } | null
  losers: number[] | null
  /** Why the round ended. */
  reason: 'collision' | 'last' | null
}

export function newRound(players: number): NState {
  return { players, called: [], window: null, losers: null, reason: null }
}

export function nextNumber(s: NState): number {
  return s.called.length + 1
}

export function remaining(s: NState): number[] {
  const out: number[] = []
  for (let p = 0; p < s.players; p++) if (!s.called.includes(p) && !s.window?.players.includes(p)) out.push(p)
  return out
}

export function canCall(s: NState, p: number): boolean {
  return !s.losers && !s.called.includes(p) && !(s.window?.players.includes(p) ?? false)
}

/** A player shouts the next number at time `now` (ms). */
export function call(s: NState, p: number, now: number): NState {
  if (!canCall(s, p)) return s
  if (s.window && now - s.window.start <= COLLISION_MS) {
    return { ...s, window: { ...s.window, players: [...s.window.players, p] } }
  }
  // An expired window must be settled first.
  const settled = s.window ? settle(s) : s
  if (settled.losers) return settled
  return { ...settled, window: { start: now, players: [p] } }
}

function settle(s: NState): NState {
  if (!s.window) return s
  const { players } = s.window
  if (players.length > 1) return { ...s, window: null, losers: players.slice(), reason: 'collision' }
  const called = [...s.called, players[0]]
  const next: NState = { ...s, called, window: null }
  const left = remaining(next)
  if (left.length === 1) return { ...next, losers: left, reason: 'last' }
  if (left.length === 0) return { ...next, losers: [], reason: 'last' }
  return next
}

/** Advance time: settle the open window once the collision time has passed. */
export function tick(s: NState, now: number): NState {
  if (s.losers || !s.window || now - s.window.start <= COLLISION_MS) return s
  return settle(s)
}

export interface AIStyle {
  /** Chance to hold back after hearing someone else's call. */
  hear: number
  /** Reaction time before a call can be heard (ms). */
  reaction: number
  /** Multiplier on how long the AI tends to wait. */
  patience: number
}

export const AI_STYLE: Record<Difficulty, AIStyle> = {
  easy: { hear: 0.35, reaction: 380, patience: 1.25 },
  normal: { hear: 0.65, reaction: 300, patience: 1 },
  hard: { hear: 0.9, reaction: 220, patience: 0.8 },
}

/**
 * How long an AI waits (ms) before trying to call, measured from the last settled call.
 * Fewer players left → more urgency (nobody wants to be last).
 */
export function aiDelay(left: number, total: number, diff: Difficulty, rng: () => number = Math.random): number {
  const style = AI_STYLE[diff]
  const spread = 900 + 650 * left + 300 * (total - left > 0 ? 1 : 0)
  // Mixture: some players jump in early, others wait it out.
  const r = rng()
  const base = r < 0.15 ? 250 + rng() * 700 : 500 + rng() * spread
  return Math.round(base * style.patience)
}

/** When an AI's moment comes while someone else's call is in the air, does it still shout? */
export function aiStillCalls(s: NState, now: number, diff: Difficulty, rng: () => number = Math.random): boolean {
  if (!s.window) return true
  const style = AI_STYLE[diff]
  if (now - s.window.start < style.reaction) return true // too fast to notice
  return rng() >= style.hear
}

/** Penalty totals → ranking (fewest penalties first) with shared places for ties. */
export function rankPenalties(pen: number[]): { player: number; pen: number; place: number }[] {
  const sorted = pen.map((v, i) => ({ player: i, pen: v })).sort((a, b) => a.pen - b.pen)
  return sorted.map((x) => ({ ...x, place: sorted.findIndex((y) => y.pen === x.pen) + 1 }))
}
