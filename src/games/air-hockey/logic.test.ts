import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import {
  H,
  MALLET_R,
  PUCK_R,
  W,
  WIN_SCORE,
  aiSpeed,
  aiTarget,
  clampMallet,
  newAIMemory,
  newGame,
  predictX,
  step,
  type HockeyState,
} from './logic'

const live = (): HockeyState => {
  const s = newGame()
  s.freeze = 0
  s.serveTo = null
  return s
}
const NONE = [null, null]
const SPEED = [3000, 3000]

describe('air hockey physics', () => {
  it('mallets stay in their own half', () => {
    expect(clampMallet(0, { x: 150, y: 10 }).y).toBeGreaterThan(H / 2)
    expect(clampMallet(1, { x: 150, y: H }).y).toBeLessThan(H / 2)
    expect(clampMallet(0, { x: -50, y: 400 }).x).toBe(MALLET_R)
  })
  it('friction slows the puck down', () => {
    const s = live()
    s.puck = { x: 150, y: 250, vx: 200, vy: 0 }
    for (let i = 0; i < 120; i++) step(s, 1 / 120, NONE, SPEED)
    expect(Math.abs(s.puck.vx)).toBeLessThan(200)
    expect(Math.abs(s.puck.vx)).toBeGreaterThan(50)
  })
  it('bounces off side walls', () => {
    const s = live()
    s.puck = { x: W - PUCK_R - 1, y: 250, vx: 300, vy: 0 }
    step(s, 1 / 60, NONE, SPEED)
    expect(s.puck.vx).toBeLessThan(0)
    expect(s.events.some((e) => e.type === 'wall')).toBe(true)
  })
  it('bounces off the end wall outside the goal', () => {
    const s = live()
    s.puck = { x: 30, y: PUCK_R + 2, vx: 0, vy: -300 }
    step(s, 1 / 60, NONE, SPEED)
    expect(s.puck.vy).toBeGreaterThan(0)
    expect(s.score).toEqual([0, 0])
  })
  it('scores through the goal mouth and serves to the conceding player', () => {
    const s = live()
    s.puck = { x: W / 2, y: 20, vx: 0, vy: -900 }
    for (let i = 0; i < 10; i++) step(s, 1 / 60, NONE, SPEED)
    expect(s.score).toEqual([1, 0])
    for (let i = 0; i < 100; i++) step(s, 1 / 60, NONE, SPEED)
    expect(s.puck.y).toBeLessThan(H / 2) // player 1 (top) serves
    expect(s.freeze).toBeLessThanOrEqual(0)
  })
  it('a moving mallet smashes the puck', () => {
    const s = live()
    s.puck = { x: 150, y: 330, vx: 0, vy: 0 }
    s.mallets[0] = { x: 150, y: 390, vx: 0, vy: 0 }
    step(s, 1 / 60, [{ x: 150, y: 330 }, null], SPEED)
    expect(s.puck.vy).toBeLessThan(-500)
    expect(s.events.some((e) => e.type === 'hit')).toBe(true)
  })
  it('the puck never ends up inside a mallet or outside the table sides', () => {
    const s = live()
    const rng = mulberry32(3)
    for (let i = 0; i < 3000; i++) {
      step(s, 1 / 120, [{ x: rng() * W, y: rng() * H }, { x: rng() * W, y: rng() * H }], SPEED)
      expect(s.puck.x).toBeGreaterThanOrEqual(PUCK_R - 0.01)
      expect(s.puck.x).toBeLessThanOrEqual(W - PUCK_R + 0.01)
      if (s.winner != null) break
    }
  })
  it('first to 7 wins', () => {
    const s = live()
    s.score = [WIN_SCORE - 1, 0]
    s.puck = { x: W / 2, y: 10, vx: 0, vy: -900 }
    for (let i = 0; i < 10; i++) step(s, 1 / 60, NONE, SPEED)
    expect(s.winner).toBe(0)
  })
})

describe('air hockey AI', () => {
  it('predicts wall bounces', () => {
    const x = predictX({ x: 50, y: 300, vx: -200, vy: -200 }, 100)
    expect(x).not.toBeNull()
    expect(x!).toBeGreaterThan(PUCK_R)
    expect(x!).toBeLessThan(W - PUCK_R)
  })
  it('defends in front of its goal when the puck is far away', () => {
    const s = live()
    s.puck = { x: 200, y: 400, vx: 0, vy: -300 }
    const t = aiTarget(s, 1, 'normal', newAIMemory(), 1 / 60, () => 0.5)
    expect(t.y).toBeLessThan(H / 4)
    const t0 = aiTarget(s, 0, 'normal', newAIMemory(), 1 / 60, () => 0.5)
    expect(t0.y).toBeGreaterThan(H / 2) // mirrored for the bottom player
  })
  it('scores against an empty goal', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const s = live()
      s.puck = { x: 120, y: 160, vx: 0, vy: 0 }
      s.mallets[0] = { x: 20000, y: 20000, vx: 0, vy: 0 } // keep the human far away
      const mem = newAIMemory()
      const rng = mulberry32(7)
      for (let i = 0; i < 60 * 30 && s.score[1] === 0; i++) {
        const t = aiTarget(s, 1, d, mem, 1 / 60, rng)
        step(s, 1 / 60, [null, t], [0, aiSpeed(d, mem)])
        s.mallets[0] = { x: -500, y: H + 500, vx: 0, vy: 0 }
      }
      expect(s.score[1]).toBe(1)
    }
  })
  it('harder AI moves faster', () => {
    const m = newAIMemory()
    expect(aiSpeed('hard', m)).toBeGreaterThan(aiSpeed('normal', m))
    expect(aiSpeed('normal', m)).toBeGreaterThan(aiSpeed('easy', m))
  })
})

describe('air hockey corners', () => {
  it('frees a puck trapped in a corner', () => {
    const s = newGame()
    s.freeze = 0
    s.serveTo = null
    s.puck = { x: PUCK_R, y: PUCK_R, vx: 0, vy: 0 }
    for (let i = 0; i < 240; i++) step(s, 1 / 120, [null, null], [3000, 3000])
    expect(s.puck.x).toBeGreaterThan(PUCK_R + MALLET_R)
  })
})
