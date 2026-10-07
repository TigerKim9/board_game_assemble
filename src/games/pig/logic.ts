import type { Difficulty, PlayerConfig } from '../../lib/types'

export const TARGET = 100

export interface PigState {
  players: PlayerConfig[]
  scores: number[]
  /** Number of turns each player has finished (used for the solo record). */
  turns: number[]
  turn: number
  turnTotal: number
  /** Rolls made this turn. */
  rolls: number
  die: number
  rolling: boolean
  /** A 1 was just rolled; the turn ends after a short pause. */
  bust: boolean
  winner: number | null
}

export function newGame(players: PlayerConfig[]): PigState {
  return {
    players,
    scores: players.map(() => 0),
    turns: players.map(() => 0),
    turn: 0,
    turnTotal: 0,
    rolls: 0,
    die: 1,
    rolling: false,
    bust: false,
    winner: null,
  }
}

export function startRoll(s: PigState): PigState {
  if (s.winner != null || s.rolling || s.bust) return s
  return { ...s, rolling: true }
}

export function applyRoll(s: PigState, value: number): PigState {
  if (value === 1) return { ...s, die: 1, rolling: false, bust: true, turnTotal: 0, rolls: s.rolls + 1 }
  return { ...s, die: value, rolling: false, turnTotal: s.turnTotal + value, rolls: s.rolls + 1 }
}

function nextTurn(s: PigState, scores: number[]): PigState {
  const turns = s.turns.map((t, i) => (i === s.turn ? t + 1 : t))
  return {
    ...s,
    scores,
    turns,
    turn: (s.turn + 1) % s.players.length,
    turnTotal: 0,
    rolls: 0,
    bust: false,
    rolling: false,
  }
}

/** Ends a busted turn. */
export function endBust(s: PigState): PigState {
  return nextTurn(s, s.scores)
}

export function hold(s: PigState): PigState {
  if (s.winner != null || s.rolling || s.bust || s.turnTotal === 0) return s
  const scores = s.scores.map((v, i) => (i === s.turn ? v + s.turnTotal : v))
  if (scores[s.turn] >= TARGET) {
    const turns = s.turns.map((t, i) => (i === s.turn ? t + 1 : t))
    return { ...s, scores, turns, turnTotal: 0, winner: s.turn }
  }
  return nextTurn(s, scores)
}

/**
 * Should the AI roll again?
 * easy: timid & random, normal: classic "hold at 20", hard: adapts to the race.
 */
export function aiShouldRoll(
  turnTotal: number,
  myScore: number,
  oppBest: number,
  difficulty: Difficulty,
  rng: () => number = Math.random,
): boolean {
  if (turnTotal === 0) return true
  if (myScore + turnTotal >= TARGET) return false
  if (difficulty === 'easy') {
    if (turnTotal >= 6 && rng() < 0.25) return false
    return turnTotal < 12
  }
  if (difficulty === 'normal') return turnTotal < 20
  // hard: if an opponent is about to win, keep going for it.
  if (oppBest >= 71) return true
  const limit = 21 + Math.round((oppBest - myScore) / 8)
  return turnTotal < Math.max(14, Math.min(30, limit))
}
