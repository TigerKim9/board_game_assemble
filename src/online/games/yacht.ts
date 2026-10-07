import { CATEGORIES, bestCategory, chooseHolds, isComplete, roll, scoreFor, total, type Category, type Scores } from '../../games/yacht/logic'
import { IllegalAction, assertLegal, type OnlineGame } from '../engine'

export interface YachtState {
  scores: Scores[]
  turn: number
  dice: number[]
  held: boolean[]
  rollsLeft: number
  /** Increments on every roll (lets the UI animate). */
  rollNo: number
  /** Last scored box, for the event line. */
  last: { seat: number; cat: Category; value: number } | null
}

export type YachtAction = { type: 'roll'; held?: boolean[] } | { type: 'score'; cat: Category }
// No hidden information.
export type YachtView = YachtState

const NO_HOLD = [false, false, false, false, false]

const over = (s: YachtState) => s.scores.every(isComplete)

export const yacht: OnlineGame<YachtState, YachtAction, YachtView> = {
  id: 'yacht',
  name: '야추',
  emoji: '🎲',
  minPlayers: 2,
  maxPlayers: 4,
  bots: true,
  setup: (n) => ({
    scores: Array.from({ length: n }, () => ({})),
    turn: 0,
    dice: [1, 2, 3, 4, 5],
    held: NO_HOLD,
    rollsLeft: 3,
    rollNo: 0,
    last: null,
  }),
  toAct: (s) => (over(s) ? [] : [s.turn]),
  apply(s, seat, a, rng) {
    assertLegal(!over(s) && seat === s.turn, '지금은 내 차례가 아니에요')
    if (a?.type === 'roll') {
      assertLegal(s.rollsLeft > 0, '더 굴릴 수 없어요 — 점수를 고르세요')
      let held = NO_HOLD
      if (s.rollsLeft < 3 && a.held !== undefined) {
        assertLegal(Array.isArray(a.held) && a.held.length === 5 && a.held.every((h) => typeof h === 'boolean'), '잘못된 고정 정보예요')
        held = a.held
      }
      assertLegal(!held.every(Boolean), '고정하지 않은 주사위가 있어야 굴릴 수 있어요')
      return { ...s, dice: roll(s.dice, held, rng), held, rollsLeft: s.rollsLeft - 1, rollNo: s.rollNo + 1 }
    }
    if (a?.type === 'score') {
      assertLegal(s.rollsLeft < 3, '먼저 주사위를 굴려 주세요')
      assertLegal((CATEGORIES as readonly string[]).includes(a.cat), '없는 칸이에요')
      assertLegal(s.scores[seat][a.cat] === undefined, '이미 채운 칸이에요')
      const value = scoreFor(a.cat, s.dice)
      const scores = s.scores.map((sc, i) => (i === seat ? { ...sc, [a.cat]: value } : sc))
      return {
        ...s,
        scores,
        turn: (seat + 1) % s.scores.length,
        held: NO_HOLD,
        rollsLeft: 3,
        last: { seat, cat: a.cat, value },
      }
    }
    throw new IllegalAction('알 수 없는 동작이에요')
  },
  view: (s) => s,
  result(s) {
    if (!over(s)) return null
    const totals = s.scores.map(total)
    const top = Math.max(...totals)
    return {
      winners: totals.flatMap((t, i) => (t === top ? [i] : [])),
      summary: `최고 점수 ${top}점`,
      scores: totals,
    }
  },
  bot(s, seat, rng) {
    const sc = s.scores[seat]
    if (s.rollsLeft === 3) return { type: 'roll' }
    if (s.rollsLeft > 0) {
      const held = chooseHolds(s.dice, sc, s.rollsLeft, 60, rng)
      if (!held.every(Boolean)) return { type: 'roll', held }
    }
    return { type: 'score', cat: bestCategory(s.dice, sc) }
  },
}
