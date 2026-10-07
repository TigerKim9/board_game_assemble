import { describe, expect, it } from 'vitest'
import { monthOf } from '../../hwatu'
import { mulberry32 } from '../../lib/random'
import { aiPick, decay, flipCard, isOver, newGame, observe, settle, type Memory, type MemState } from './logic'

function play(diff: 'easy' | 'normal' | 'hard', seed: number, size: 24 | 48 = 24) {
  const rng = mulberry32(seed)
  let s: MemState = newGame(1, size, rng)
  let mem: Memory = {}
  let guard = 0
  while (!isOver(s) && guard++ < 2000) {
    for (let k = 0; k < 2; k++) {
      const pos = aiPick(s, mem, rng)
      s = flipCard(s, pos)
      mem = observe(mem, s, pos, diff, rng)
    }
    s = settle(s)
    mem = decay(mem, s, diff, rng)
  }
  return s
}

describe('hwatu memory', () => {
  it('builds boards of whole months', () => {
    const s = newGame(2, 24, mulberry32(1))
    expect(s.cards).toHaveLength(24)
    const months = new Map<number, number>()
    s.cards.forEach((id) => months.set(monthOf(id), (months.get(monthOf(id)) ?? 0) + 1))
    expect([...months.values()].every((n) => n === 4)).toBe(true)
    expect(newGame(1, 48).cards).toHaveLength(48)
  })
  it('matches same month and keeps the turn', () => {
    let s: MemState = { ...newGame(2, 24, mulberry32(2)), cards: [0, 1, 4, 5], gone: [false, false, false, false], owner: [null, null, null, null] }
    s = settle(flipCard(flipCard(s, 0), 1))
    expect(s.scores).toEqual([1, 0])
    expect(s.turn).toBe(0)
    expect(s.gone).toEqual([true, true, false, false])
    s = settle(flipCard(flipCard(s, 2), 0)) // 0 is gone → ignored
    expect(s.up).toEqual([2])
    s = settle(flipCard(s, 3))
    expect(isOver(s)).toBe(true)
  })
  it('passes the turn on a miss', () => {
    let s: MemState = { ...newGame(2, 24, mulberry32(3)), cards: [0, 4, 1, 5], gone: [false, false, false, false], owner: [null, null, null, null] }
    s = settle(flipCard(flipCard(s, 0), 1))
    expect(s.turn).toBe(1)
    expect(s.turns).toEqual([1, 0])
  })
  it('ignores a third flip', () => {
    let s = newGame(1, 24, mulberry32(4))
    s = flipCard(flipCard(flipCard(s, 0), 1), 2)
    expect(s.up).toHaveLength(2)
  })
  it('AI finishes and hard needs fewer turns than easy', () => {
    let easy = 0
    let hard = 0
    for (let k = 0; k < 20; k++) {
      easy += play('easy', k).turns[0]
      hard += play('hard', k).turns[0]
    }
    expect(hard).toBeLessThan(easy)
    expect(isOver(play('normal', 99, 48))).toBe(true)
  })
  it('AI uses a remembered pair', () => {
    const s: MemState = { ...newGame(1, 24, mulberry32(5)), cards: [0, 4, 8, 1], gone: [false, false, false, false], owner: [null, null, null, null] }
    const mem: Memory = { 0: 1, 3: 1 }
    const first = aiPick(s, mem)
    expect([0, 3]).toContain(first)
    expect(aiPick(flipCard(s, first), mem)).toBe(first === 0 ? 3 : 0)
  })
})
