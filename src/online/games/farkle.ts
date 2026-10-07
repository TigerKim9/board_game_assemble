import {
  endTurn,
  keepAndBank,
  keepAndRoll,
  newFarkle,
  resolveRoll,
  selectionScore,
  setSelection,
  startRoll,
  type FarkleState,
} from '../../games/farkle/game'
import { aiChooseKeep, aiShouldBank, rollN, type AiContext } from '../../games/farkle/logic'
import { IllegalAction, assertLegal, type OnlineGame, type Rng } from '../engine'

export const FARKLE_TARGET = 5000

export type FarkleEvent =
  | { kind: 'farkle'; seat: number; dice: number[]; lost: number }
  | { kind: 'bank'; seat: number; gained: number }
  | { kind: 'final'; seat: number }
  | { kind: 'hot'; seat: number }

export interface FarkleOnline {
  /** Phase is only ever 'start' | 'choose' | 'over' online: rolls resolve on the server at once. */
  g: FarkleState
  rollNo: number
  event: FarkleEvent | null
}

/** keep = indices of the current dice to set aside; bank = stop and bank afterwards. */
export type FarkleAction = { type: 'roll' } | { type: 'keep'; idx: number[]; bank: boolean }

export interface FarkleView {
  target: number
  scores: number[]
  turn: number
  phase: 'start' | 'choose' | 'over'
  dice: number[]
  kept: number[][]
  turnTotal: number
  toRoll: number
  hotDice: boolean
  finalFrom: number | null
  rollNo: number
  event: FarkleEvent | null
}

/** Roll (the dice the state asks for) and, on a farkle, end the turn at once. */
function doRoll(s: FarkleOnline, g: FarkleState, rng: Rng, hot: boolean): FarkleOnline {
  const rolled = resolveRoll(g, rollN(g.dice.length, rng))
  const rollNo = s.rollNo + 1
  if (rolled.phase === 'farkle') {
    const seat = rolled.turn
    return finish({ g: endTurn(rolled, false), rollNo, event: { kind: 'farkle', seat, dice: rolled.dice, lost: rolled.turnTotal } }, g.finalFrom)
  }
  return { g: rolled, rollNo, event: hot ? { kind: 'hot', seat: g.turn } : s.event }
}

/** Announce the final round when someone first reaches the target. */
function finish(s: FarkleOnline, finalBefore: number | null): FarkleOnline {
  if (finalBefore == null && s.g.finalFrom != null && s.g.phase !== 'over') return { ...s, event: { kind: 'final', seat: s.g.finalFrom } }
  return s
}

function ctxFor(g: FarkleState, seat: number, rng: Rng): AiContext {
  const others = g.scores.filter((_, i) => i !== seat)
  return {
    turnTotal: g.turnTotal,
    myScore: g.scores[seat],
    target: g.target,
    mustBeat: g.finalFrom != null ? Math.max(...others) : null,
    oppBest: Math.max(0, ...others),
    difficulty: 'normal',
    rng,
  }
}

export const farkle: OnlineGame<FarkleOnline, FarkleAction, FarkleView> = {
  id: 'farkle',
  name: '파클',
  emoji: '🎯',
  minPlayers: 2,
  maxPlayers: 6,
  bots: true,
  setup: (n) => ({
    g: newFarkle(
      Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isAI: false })),
      FARKLE_TARGET,
    ),
    rollNo: 0,
    event: null,
  }),
  toAct: (s) => (s.g.phase === 'over' ? [] : [s.g.turn]),
  apply(s, seat, a, rng) {
    const g = s.g
    assertLegal(g.phase !== 'over' && seat === g.turn, '지금은 내 차례가 아니에요')
    if (a?.type === 'roll') {
      assertLegal(g.phase === 'start', '먼저 따로 둘 주사위를 골라 주세요')
      return doRoll({ ...s, event: null }, startRoll(g), rng, false)
    }
    if (a?.type === 'keep') {
      assertLegal(g.phase === 'choose', '먼저 주사위를 굴려 주세요')
      const idx = a.idx
      assertLegal(
        Array.isArray(idx) &&
          idx.length > 0 &&
          idx.every((i) => Number.isInteger(i) && i >= 0 && i < g.dice.length) &&
          new Set(idx).size === idx.length,
        '따로 둘 주사위를 골라 주세요',
      )
      const sel = setSelection(g, idx)
      const sc = selectionScore(sel)
      assertLegal(sc != null, '점수가 안 되는 주사위가 섞여 있어요')
      if (a.bank) {
        const banked = keepAndBank(sel)
        return finish({ g: banked, rollNo: s.rollNo, event: { kind: 'bank', seat, gained: g.turnTotal + sc } }, g.finalFrom)
      }
      const next = keepAndRoll(sel)
      return doRoll(s, next, rng, next.hotDice)
    }
    throw new IllegalAction('알 수 없는 동작이에요')
  },
  view: (s) => ({
    target: s.g.target,
    scores: s.g.scores,
    turn: s.g.turn,
    phase: s.g.phase as FarkleView['phase'],
    dice: s.g.dice,
    kept: s.g.kept,
    turnTotal: s.g.turnTotal,
    toRoll: s.g.toRoll,
    hotDice: s.g.hotDice,
    finalFrom: s.g.finalFrom,
    rollNo: s.rollNo,
    event: s.event,
  }),
  result(s) {
    if (s.g.phase !== 'over') return null
    const top = Math.max(...s.g.scores)
    return { winners: s.g.winners, summary: `${top.toLocaleString()}점으로 1등`, scores: s.g.scores }
  },
  bot(s, seat, rng) {
    const g = s.g
    if (g.phase === 'start') return { type: 'roll' }
    const ctx = ctxFor(g, seat, rng)
    const idx = aiChooseKeep(g.dice, ctx)
    const sc = selectionScore(setSelection(g, idx)) ?? 0
    const left = g.dice.length - idx.length
    return { type: 'keep', idx, bank: aiShouldBank(g.turnTotal + sc, left, ctx) }
  },
}
