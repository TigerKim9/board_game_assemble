import type { PlayerConfig } from '../../lib/types'
import { isFarkle, scoreSelection } from './logic'

export type Phase = 'start' | 'rolling' | 'choose' | 'farkle' | 'over'

export interface FarkleState {
  players: PlayerConfig[]
  target: number
  scores: number[]
  turnsTaken: number[]
  turn: number
  phase: Phase
  /** Dice currently on the table (the latest roll). */
  dice: number[]
  selected: boolean[]
  /** Groups of dice set aside earlier this turn. */
  kept: number[][]
  turnTotal: number
  /** How many dice the next roll uses. */
  toRoll: number
  hotDice: boolean
  /** Player who first reached the target; everybody else gets one last turn. */
  finalFrom: number | null
  winners: number[]
  log: string
}

export function newFarkle(players: PlayerConfig[], target: number): FarkleState {
  return {
    players,
    target,
    scores: players.map(() => 0),
    turnsTaken: players.map(() => 0),
    turn: 0,
    phase: 'start',
    dice: [1, 2, 3, 4, 5, 6],
    selected: Array(6).fill(false),
    kept: [],
    turnTotal: 0,
    toRoll: 6,
    hotDice: false,
    finalFrom: null,
    winners: [],
    log: '',
  }
}

export function startRoll(s: FarkleState): FarkleState {
  if (s.phase !== 'start') return s
  return { ...s, phase: 'rolling', selected: Array(s.toRoll).fill(false), dice: s.dice.slice(0, s.toRoll) }
}

export function resolveRoll(s: FarkleState, values: number[]): FarkleState {
  if (s.phase !== 'rolling') return s
  const farkle = isFarkle(values)
  return {
    ...s,
    dice: values,
    selected: values.map(() => false),
    phase: farkle ? 'farkle' : 'choose',
    hotDice: false,
    log: farkle ? '파클! 점수가 되는 주사위가 없어요' : '',
  }
}

export function toggle(s: FarkleState, i: number): FarkleState {
  if (s.phase !== 'choose') return s
  return { ...s, selected: s.selected.map((v, j) => (j === i ? !v : v)) }
}

export function setSelection(s: FarkleState, idx: number[]): FarkleState {
  return { ...s, selected: s.dice.map((_, i) => idx.includes(i)) }
}

export function selectedDice(s: FarkleState): number[] {
  return s.dice.filter((_, i) => s.selected[i])
}

export function selectionScore(s: FarkleState): number | null {
  return scoreSelection(selectedDice(s))
}

function setAside(s: FarkleState): FarkleState | null {
  const sc = selectionScore(s)
  if (s.phase !== 'choose' || sc == null) return null
  const left = s.dice.length - selectedDice(s).length
  return {
    ...s,
    kept: [...s.kept, selectedDice(s)],
    turnTotal: s.turnTotal + sc,
    toRoll: left === 0 ? 6 : left,
    hotDice: left === 0,
    dice: s.dice.filter((_, i) => !s.selected[i]),
    selected: [],
  }
}

/** Set the selection aside and roll the remaining dice (all six on hot dice). */
export function keepAndRoll(s: FarkleState): FarkleState {
  const n = setAside(s)
  if (!n) return s
  return {
    ...n,
    phase: 'rolling',
    dice: Array.from({ length: n.toRoll }, (_, i) => n.dice[i] ?? 1),
    selected: Array(n.toRoll).fill(false),
    log: n.hotDice ? '🔥 핫 다이스! 주사위 6개를 다시 굴려요' : '',
  }
}

/** Set the selection aside and bank the turn total. */
export function keepAndBank(s: FarkleState): FarkleState {
  const n = setAside(s)
  if (!n) return s
  return endTurn(n, true)
}

export function endTurn(s: FarkleState, banked: boolean): FarkleState {
  const gained = banked ? s.turnTotal : 0
  const scores = s.scores.map((v, i) => (i === s.turn ? v + gained : v))
  const turnsTaken = s.turnsTaken.map((v, i) => (i === s.turn ? v + 1 : v))
  const me = s.players[s.turn].name
  let finalFrom = s.finalFrom
  let log = banked ? `${me}: ${gained.toLocaleString()}점 저장!` : `${me}: 파클로 ${s.turnTotal.toLocaleString()}점을 잃었어요`
  const base = { ...s, scores, turnsTaken, turnTotal: 0, kept: [], toRoll: 6, hotDice: false, selected: Array(6).fill(false) }
  if (finalFrom == null && scores[s.turn] >= s.target) {
    if (s.players.length === 1) return { ...base, phase: 'over', winners: [0], log }
    finalFrom = s.turn
    log = `🏁 ${me}님이 ${s.target.toLocaleString()}점 달성! 나머지는 마지막 차례예요`
  }
  const next = (s.turn + 1) % s.players.length
  if (finalFrom != null && next === finalFrom) {
    const top = Math.max(...scores)
    return { ...base, finalFrom, phase: 'over', winners: scores.flatMap((v, i) => (v === top ? [i] : [])), log }
  }
  return { ...base, finalFrom, turn: next, phase: 'start', dice: [1, 2, 3, 4, 5, 6], log }
}
