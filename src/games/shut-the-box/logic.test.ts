import { describe, expect, it } from 'vitest'
import {
  aiChooseTiles,
  aiDiceCount,
  combos,
  confirmPick,
  expectedScore,
  finishTurn,
  newBox,
  oneDieAllowed,
  resolveRoll,
  startRoll,
  togglePick,
} from './logic'

describe('shut the box rules', () => {
  it('finds combinations', () => {
    const cs = combos([1, 2, 3, 4, 5, 6, 7, 8, 9], 6).map((c) => c.join('+'))
    expect(cs.sort()).toEqual(['1+2+3', '1+5', '2+4', '6'].sort())
    expect(combos([7, 8, 9], 5)).toEqual([])
  })
  it('one die only after 7-9 are shut and option on', () => {
    expect(oneDieAllowed([1, 2, 7], true)).toBe(false)
    expect(oneDieAllowed([1, 2, 6], true)).toBe(true)
    expect(oneDieAllowed([1, 2, 6], false)).toBe(false)
  })
  it('plays a turn', () => {
    const p = [
      { name: 'A', isAI: false },
      { name: 'B', isAI: false },
    ]
    let s = newBox(p, true)
    s = resolveRoll(startRoll(s, 2), [4, 5])
    expect(s.phase).toBe('pick')
    s = togglePick(togglePick(s, 4), 5)
    s = confirmPick(s)
    expect(s.open).toEqual([1, 2, 3, 6, 7, 8, 9])
    expect(s.phase).toBe('roll')
    // one die is not allowed yet
    expect(startRoll(s, 1)).toBe(s)
    s = { ...s, open: [9] }
    s = resolveRoll(startRoll(s, 2), [1, 2])
    expect(s.phase).toBe('stuck')
    s = finishTurn(s)
    expect(s.results).toEqual([9, null])
    expect(s.turn).toBe(1)
    expect(s.open.length).toBe(9)
  })
  it('shutting every tile scores 0', () => {
    let s = { ...newBox([{ name: 'A', isAI: false }], false), open: [3, 4] }
    s = resolveRoll(startRoll(s, 2), [3, 4])
    s = confirmPick(togglePick(togglePick(s, 3), 4))
    expect(s.phase).toBe('shut')
    s = finishTurn(s)
    expect(s.phase).toBe('over')
    expect(s.results).toEqual([0])
  })
  it('rejects a wrong sum', () => {
    let s = newBox([{ name: 'A', isAI: false }], false)
    s = resolveRoll(startRoll(s, 2), [3, 3])
    s = togglePick(s, 5)
    expect(confirmPick(s)).toBe(s)
  })
})

describe('shut the box AI', () => {
  it('expected score is sane', () => {
    const all = 0b111111111
    const e = expectedScore(all, true)
    expect(e).toBeGreaterThan(5)
    expect(e).toBeLessThan(20)
    expect(expectedScore(0, true)).toBe(0)
  })
  it('hard AI picks a valid combo and prefers high tiles', () => {
    const open = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    const c = aiChooseTiles(open, 9, true, 'hard')
    expect(c.reduce((a, b) => a + b, 0)).toBe(9)
    expect(c).toEqual([9])
  })
  it('every difficulty returns a valid combo', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const c = aiChooseTiles([1, 3, 4, 6], 7, false, d)
      expect(c.reduce((a, b) => a + b, 0)).toBe(7)
    }
  })
  it('hard rolls one die for small leftovers', () => {
    expect(aiDiceCount([1], true, 'hard')).toBe(1)
    expect(aiDiceCount([1, 8], true, 'hard')).toBe(2)
  })
})
