import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { aiChoose, createBarrel, nextTurn, remaining, stab } from './logic'

describe('pirate barrel', () => {
  it('pops only on the trigger slot', () => {
    const b = createBarrel(12, () => 0.5)
    expect(b.trigger).toBe(6)
    const miss = stab(b, 2)!
    expect(miss.popped).toBe(false)
    expect(remaining(miss.barrel)).toBe(11)
    expect(stab(miss.barrel, 6)!.popped).toBe(true)
  })
  it('rejects stabbing a slot twice or out of range', () => {
    const b = stab(createBarrel(12), 3)!.barrel
    expect(stab(b, 3)).toBeNull()
    expect(stab(b, 12)).toBeNull()
  })
  it('AI always picks a free slot and eventually pops', () => {
    const rng = mulberry32(3)
    for (let g = 0; g < 30; g++) {
      let b = createBarrel(16, rng)
      let popped = false
      let turns = 0
      while (!popped) {
        const s = aiChoose(b, rng)
        expect(b.stabbed[s]).toBe(false)
        const r = stab(b, s)!
        b = r.barrel
        popped = r.popped
        turns++
      }
      expect(turns).toBeLessThanOrEqual(16)
    }
  })
  it('rotates turns', () => {
    expect(nextTurn(0, 3)).toBe(1)
    expect(nextTurn(2, 3)).toBe(0)
  })
})
