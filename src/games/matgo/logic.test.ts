import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { MODE, MODES, aiStep, allCards, newRound } from './logic'
import { meta } from './meta'

describe('matgo', () => {
  it('설정: 2명, 손패 10장, 바닥 8장, 7점부터 고/스톱', () => {
    expect(MODES[MODE]).toEqual({ players: 2, hand: 10, floor: 8, threshold: 7 })
    expect(meta.rules.length).toBeGreaterThan(10)
  })
  it('패를 나누면 손패·바닥·더미가 맞음', () => {
    const players = Array.from({ length: 2 }, (_, i) => ({ name: `P${i}`, isAI: true }))
    for (let seed = 1; seed < 30; seed++) {
      const s = newRound(players, MODE, { rng: mulberry32(seed) })
      expect(allCards(s)).toHaveLength(48)
      if (s.phase.kind === 'over') continue // 총통
      s.players.forEach((p) => expect(p.hand).toHaveLength(10))
      expect(s.floor).toHaveLength(8)
      expect(s.deck).toHaveLength(48 - 2 * 10 - 8)
    }
  })
  it('AI끼리 끝까지 둠', () => {
    const rng = mulberry32(42)
    const players = Array.from({ length: 2 }, (_, i) => ({ name: `P${i}`, isAI: true }))
    for (let g = 0; g < 20; g++) {
      let s = newRound(players, MODE, { rng })
      let steps = 0
      while (s.phase.kind !== 'over' && steps++ < 400) s = aiStep(s, 'normal', rng)
      expect(s.phase.kind).toBe('over')
      expect(s.result).not.toBeNull()
    }
  })
})
