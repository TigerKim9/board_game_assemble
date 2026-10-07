import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import {
  BALL_R,
  H,
  NO_INPUT,
  PADDLE_Y,
  PADDLE_W,
  W,
  WIDE_W,
  buildBricks,
  levelGrid,
  newGame,
  nextLevel,
  remaining,
  step,
  type BreakoutState,
} from './logic'

const launch = { ...NO_INPUT, launch: true }

function run(s: BreakoutState, seconds: number, input = NO_INPUT) {
  const rng = mulberry32(5)
  for (let t = 0; t < seconds; t += 1 / 120) step(s, 1 / 120, input, rng)
  return s
}

describe('breakout levels', () => {
  it('has at least 20 distinct, non-empty levels', () => {
    const seen = new Set<string>()
    for (let l = 1; l <= 30; l++) {
      const g = levelGrid(l)
      const key = JSON.stringify(g)
      expect(seen.has(key)).toBe(false)
      seen.add(key)
      expect(remaining({ ...newGame(l) })).toBeGreaterThan(8)
      for (const row of g) expect(row.length).toBe(10)
    }
  })
  it('bricks stay inside the field and above the paddle', () => {
    for (let l = 1; l <= 40; l++) {
      for (const b of buildBricks(l)) {
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.x + b.w).toBeLessThanOrEqual(W + 0.001)
        expect(b.y + b.h).toBeLessThan(PADDLE_Y - 150)
      }
    }
  })
  it('later levels are tougher', () => {
    const hp = (l: number) => buildBricks(l).filter((b) => !b.steel).reduce((a, b) => a + b.hp, 0) / remaining(newGame(l))
    expect(hp(20)).toBeGreaterThan(hp(1))
  })
})

describe('breakout physics', () => {
  it('ball rides the paddle until launched', () => {
    const s = newGame()
    step(s, 0.1, { ...NO_INPUT, paddleX: 100 })
    expect(s.balls[0].stuck).toBe(true)
    expect(Math.abs(s.balls[0].x - 100)).toBeLessThan(PADDLE_W / 2)
    step(s, 0.01, launch)
    expect(s.balls[0].stuck).toBe(false)
    expect(s.balls[0].vy).toBeLessThan(0)
  })
  it('bounces off the paddle upward', () => {
    const s = newGame()
    s.bricks = [{ x: 0, y: 0, w: 1, h: 1, hp: 1, maxHp: 1, steel: false, row: 0 }]
    s.balls = [{ x: s.paddleX, y: PADDLE_Y - 30, vx: 0, vy: 300, stuck: false, offset: 0 }]
    run(s, 0.15)
    expect(s.balls[0].vy).toBeLessThan(0)
    expect(s.lives).toBe(3)
  })
  it('loses a life when the ball falls, and ends at zero lives', () => {
    const s = newGame()
    s.balls = [{ x: 20, y: H - 5, vx: 0, vy: 400, stuck: false, offset: 0 }]
    s.paddleX = W - 40
    step(s, 0.1, NO_INPUT)
    expect(s.lives).toBe(2)
    expect(s.balls[0].stuck).toBe(true)
    s.lives = 1
    s.balls = [{ x: 20, y: H - 5, vx: 0, vy: 400, stuck: false, offset: 0 }]
    step(s, 0.1, NO_INPUT)
    expect(s.phase).toBe('over')
  })
  it('damages multi-hit bricks and destroys them', () => {
    const s = newGame()
    s.bricks = [{ x: 150, y: 100, w: 40, h: 16, hp: 2, maxHp: 2, steel: false, row: 0 }]
    s.balls = [{ x: 170, y: 130, vx: 0, vy: -300, stuck: false, offset: 0 }]
    step(s, 0.1, NO_INPUT, () => 0.99)
    expect(s.bricks[0].hp).toBe(1)
    expect(s.balls[0].vy).toBeGreaterThan(0)
    s.balls = [{ x: 170, y: 130, vx: 0, vy: -300, stuck: false, offset: 0 }]
    step(s, 0.1, NO_INPUT, () => 0.99)
    expect(s.phase).toBe('cleared')
    expect(s.score).toBeGreaterThan(0)
  })
  it('steel bricks never break and do not block clearing', () => {
    const s = newGame()
    s.bricks = [{ x: 150, y: 100, w: 40, h: 16, hp: Infinity, maxHp: Infinity, steel: true, row: 0 }]
    expect(remaining(s)).toBe(0)
  })
  it('never tunnels through the walls', () => {
    const s = newGame()
    s.bricks = s.bricks.map((b) => ({ ...b, steel: true, hp: Infinity }))
    s.balls = [{ x: 180, y: 300, vx: 330, vy: -200, stuck: false, offset: 0 }]
    const rng = mulberry32(1)
    for (let i = 0; i < 600; i++) {
      step(s, 1 / 60, { ...NO_INPUT, paddleX: s.balls[0]?.x ?? 180 }, rng)
      for (const b of s.balls) {
        expect(b.x).toBeGreaterThanOrEqual(BALL_R - 0.01)
        expect(b.x).toBeLessThanOrEqual(W - BALL_R + 0.01)
        expect(b.y).toBeGreaterThanOrEqual(BALL_R - 0.01)
      }
    }
    expect(s.lives).toBe(3) // paddle tracking the ball never misses
  })
})

describe('breakout power-ups', () => {
  const catchPower = (type: 'multi' | 'wide' | 'laser' | 'slow' | 'life') => {
    const s = newGame()
    s.drops = [{ x: s.paddleX, y: PADDLE_Y - 2, type }]
    step(s, 0.016, NO_INPUT)
    return s
  }
  it('multi ball splits the ball', () => {
    expect(catchPower('multi').balls.length).toBe(3)
  })
  it('wide paddle grows and expires', () => {
    const s = catchPower('wide')
    run(s, 1)
    expect(s.paddleW).toBe(WIDE_W)
    run(s, 16)
    expect(s.paddleW).toBe(PADDLE_W)
  })
  it('laser fires bolts that break bricks', () => {
    const s = catchPower('laser')
    const before = s.score
    run(s, 2)
    expect(s.score).toBeGreaterThan(before)
  })
  it('extra life', () => {
    expect(catchPower('life').lives).toBe(4)
  })
  it('next level resets the field', () => {
    const s = nextLevel(newGame())
    expect(s.level).toBe(2)
    expect(s.balls.length).toBe(1)
    expect(remaining(s)).toBeGreaterThan(0)
  })
})
