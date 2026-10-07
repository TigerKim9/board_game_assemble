import { describe, expect, it } from 'vitest'
import { endTurn, keepAndBank, keepAndRoll, newFarkle, resolveRoll, setSelection, startRoll } from './game'
import { aiChooseKeep, aiShouldBank, bestRollScore, isFarkle, scoreSelection, type AiContext } from './logic'

describe('farkle scoring', () => {
  it('scores single 1s and 5s', () => {
    expect(scoreSelection([1])).toBe(100)
    expect(scoreSelection([5])).toBe(50)
    expect(scoreSelection([1, 5, 5])).toBe(200)
    expect(scoreSelection([2])).toBeNull()
    expect(scoreSelection([1, 2])).toBeNull()
    expect(scoreSelection([])).toBeNull()
  })
  it('scores n of a kind', () => {
    expect(scoreSelection([2, 2, 2])).toBe(200)
    expect(scoreSelection([1, 1, 1])).toBe(1000)
    expect(scoreSelection([6, 6, 6, 6])).toBe(1000)
    expect(scoreSelection([3, 3, 3, 3, 3])).toBe(2000)
    expect(scoreSelection([4, 4, 4, 4, 4, 4])).toBe(3000)
    expect(scoreSelection([5, 5, 5, 5])).toBe(1000)
    expect(scoreSelection([1, 1, 1, 1, 5])).toBe(1150) // 1,1,1 + 1 + 5 beats four of a kind
  })
  it('scores six-dice specials', () => {
    expect(scoreSelection([1, 2, 3, 4, 5, 6])).toBe(1500)
    expect(scoreSelection([2, 2, 3, 3, 6, 6])).toBe(1500)
    expect(scoreSelection([2, 2, 2, 2, 6, 6])).toBe(1500)
    expect(scoreSelection([2, 2, 2, 6, 6, 6])).toBe(2500)
    expect(scoreSelection([1, 1, 1, 1, 1, 1])).toBe(3000)
  })
  it('detects farkle', () => {
    expect(isFarkle([2, 3, 4, 6, 6, 2])).toBe(true)
    expect(isFarkle([2, 3, 4, 6, 6, 5])).toBe(false)
    expect(isFarkle([2, 2, 2])).toBe(false)
    expect(bestRollScore([1, 1, 1, 5, 2, 3])).toBe(1050)
  })
})

const ctx = (over: Partial<AiContext> = {}): AiContext => ({
  turnTotal: 0,
  myScore: 0,
  target: 10000,
  mustBeat: null,
  oppBest: 0,
  difficulty: 'hard',
  ...over,
})

describe('farkle AI', () => {
  it('keeps only the 1 rather than 1+5 when rolling on (hard)', () => {
    const idx = aiChooseKeep([1, 5, 2, 3, 4, 6], ctx())
    // 1-6 straight is better!
    expect(idx.length).toBe(6)
    const idx2 = aiChooseKeep([1, 5, 2, 3, 6, 6], ctx())
    expect(idx2).toEqual([0])
  })
  it('easy grabs everything', () => {
    expect(aiChooseKeep([1, 5, 2, 3, 6, 6], ctx({ difficulty: 'easy' })).sort()).toEqual([0, 1])
  })
  it('always rolls on hot dice and banks with few dice', () => {
    expect(aiShouldBank(800, 0, ctx())).toBe(false)
    expect(aiShouldBank(500, 2, ctx())).toBe(true)
    expect(aiShouldBank(100, 5, ctx())).toBe(false)
  })
  it('banks when reaching the target, keeps rolling to beat a leader', () => {
    expect(aiShouldBank(500, 5, ctx({ myScore: 9600 }))).toBe(true)
    expect(aiShouldBank(500, 1, ctx({ myScore: 9000, mustBeat: 10200 }))).toBe(false)
    expect(aiShouldBank(1300, 1, ctx({ myScore: 9000, mustBeat: 10200 }))).toBe(true)
  })
})

describe('farkle turn flow', () => {
  const players = [
    { name: 'A', isAI: false },
    { name: 'B', isAI: false },
  ]
  it('keeps, rolls on and banks', () => {
    let s = newFarkle(players, 10000)
    s = resolveRoll(startRoll(s), [1, 1, 1, 2, 3, 4])
    s = keepAndRoll(setSelection(s, [0, 1, 2]))
    expect(s.turnTotal).toBe(1000)
    expect(s.dice.length).toBe(3)
    s = resolveRoll(s, [5, 2, 3])
    s = keepAndBank(setSelection(s, [0]))
    expect(s.scores).toEqual([1050, 0])
    expect(s.turn).toBe(1)
  })
  it('hot dice rolls six again', () => {
    let s = newFarkle(players, 10000)
    s = resolveRoll(startRoll(s), [1, 2, 3, 4, 5, 6])
    s = keepAndRoll(setSelection(s, [0, 1, 2, 3, 4, 5]))
    expect(s.hotDice).toBe(true)
    expect(s.dice.length).toBe(6)
  })
  it('farkle loses the turn total', () => {
    let s = newFarkle(players, 10000)
    s = resolveRoll(startRoll(s), [1, 2, 3, 4, 6, 6])
    s = keepAndRoll(setSelection(s, [0]))
    s = resolveRoll(s, [2, 2, 3, 4, 6])
    expect(s.phase).toBe('farkle')
    s = endTurn(s, false)
    expect(s.scores).toEqual([0, 0])
  })
  it('gives everyone a final turn after the target is reached', () => {
    let s = { ...newFarkle([...players, { name: 'C', isAI: false }], 5000), scores: [4900, 3000, 0] }
    s = resolveRoll(startRoll(s), [1, 2, 3, 4, 6, 6])
    s = keepAndBank(setSelection(s, [0]))
    expect(s.finalFrom).toBe(0)
    expect(s.phase).toBe('start')
    s = endTurn({ ...s, turnTotal: 0 }, false)
    expect(s.phase).toBe('start')
    s = endTurn({ ...s, turnTotal: 6000 }, true)
    expect(s.phase).toBe('over')
    expect(s.winners).toEqual([2])
  })
  it('solo ends on reaching the target', () => {
    let s = { ...newFarkle([players[0]], 5000), scores: [4950] }
    s = resolveRoll(startRoll(s), [5, 2, 3, 4, 6, 6])
    s = keepAndBank(setSelection(s, [0]))
    expect(s.phase).toBe('over')
    expect(s.turnsTaken[0]).toBe(1)
  })
})

describe('farkle AI full game', () => {
  it('AI-only games finish', async () => {
    const { rollN } = await import('./logic')
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      let s = newFarkle([{ name: 'X', isAI: true }, { name: 'Y', isAI: true }], 5000)
      let steps = 0
      while (s.phase !== 'over' && steps++ < 20000) {
        const others = s.scores.filter((_, i) => i !== s.turn)
        const c = ctx({ difficulty, turnTotal: s.turnTotal, myScore: s.scores[s.turn], target: 5000, oppBest: Math.max(...others), mustBeat: s.finalFrom != null ? Math.max(...others) : null })
        if (s.phase === 'start') s = startRoll(s)
        else if (s.phase === 'rolling') s = resolveRoll(s, rollN(s.dice.length))
        else if (s.phase === 'farkle') s = endTurn(s, false)
        else {
          s = setSelection(s, aiChooseKeep(s.dice, c))
          const sel = s.dice.filter((_, i) => s.selected[i])
          const left = s.dice.length - sel.length
          s = aiShouldBank(s.turnTotal + (scoreSelection(sel) ?? 0), left, c) ? keepAndBank(s) : keepAndRoll(s)
        }
      }
      expect(s.phase).toBe('over')
    }
  })
})
