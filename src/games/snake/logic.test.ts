import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { aiChooseDir, newGame, queueTurn, step, type SnakeState } from './logic'

const solo = (wrap = false): SnakeState => newGame(1, { wrap, speed: 1 }, mulberry32(1))

describe('snake movement', () => {
  it('moves forward one cell per tick', () => {
    const s = solo()
    const head = s.snakes[0].body[0]
    const n = step(s, mulberry32(2))
    expect(n.snakes[0].body[0]).toEqual({ x: head.x + 1, y: head.y })
    expect(n.snakes[0].body.length).toBe(s.snakes[0].body.length)
  })
  it('ignores reversing into itself', () => {
    const s = solo()
    queueTurn(s.snakes[0], 'left')
    expect(s.snakes[0].queue).toEqual([])
    queueTurn(s.snakes[0], 'up')
    queueTurn(s.snakes[0], 'left')
    expect(s.snakes[0].queue).toEqual(['up', 'left'])
  })
  it('dies on walls but wraps when enabled', () => {
    let s = solo()
    s.foods = []
    s.snakes[0].body = [{ x: s.cols - 1, y: 3 }, { x: s.cols - 2, y: 3 }]
    s = step(s)
    expect(s.over).toBe(true)

    let w = solo(true)
    w.foods = []
    w.snakes[0].body = [{ x: w.cols - 1, y: 3 }, { x: w.cols - 2, y: 3 }]
    w = step(w)
    expect(w.over).toBe(false)
    expect(w.snakes[0].body[0]).toEqual({ x: 0, y: 3 })
  })
  it('eats food, scores and grows', () => {
    let s = solo()
    const h = s.snakes[0].body[0]
    s.foods = [{ x: h.x + 1, y: h.y, kind: 'apple', ttl: Infinity }]
    const len = s.snakes[0].body.length
    s = step(s, mulberry32(3))
    expect(s.snakes[0].score).toBe(10)
    expect(s.snakes[0].body.length).toBe(len + 1)
    expect(s.foods.filter((f) => f.kind === 'apple').length).toBe(1)
    expect(s.events.some((e) => e.type === 'eat')).toBe(true)
  })
  it('dies when biting itself', () => {
    let s = solo()
    s.foods = []
    s.snakes[0].body = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 6 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 5 },
    ]
    s.snakes[0].dir = 'right'
    queueTurn(s.snakes[0], 'down')
    s = step(s)
    expect(s.snakes[0].alive).toBe(false)
  })
  it('can chase its own tail safely', () => {
    let s = solo()
    s.foods = []
    s.snakes[0].body = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 5 },
    ]
    s.snakes[0].dir = 'up'
    queueTurn(s.snakes[0], 'right')
    s = step(s)
    expect(s.snakes[0].alive).toBe(true)
  })
})

describe('snake versus', () => {
  it('the survivor wins', () => {
    let s = newGame(2, { wrap: false, speed: 2 }, mulberry32(4))
    s.foods = []
    s.snakes[0].body = [{ x: 0, y: 10 }, { x: 0, y: 11 }]
    s.snakes[0].dir = 'left'
    s = step(s)
    expect(s.over).toBe(true)
    expect(s.winner).toBe(1)
  })
  it('head-on collision with equal scores is a draw', () => {
    let s = newGame(2, { wrap: false, speed: 2 }, mulberry32(4))
    s.foods = []
    s.snakes[0].body = [{ x: 5, y: 5 }, { x: 4, y: 5 }]
    s.snakes[0].dir = 'right'
    s.snakes[1].body = [{ x: 7, y: 5 }, { x: 8, y: 5 }]
    s.snakes[1].dir = 'left'
    s = step(s)
    expect(s.over).toBe(true)
    expect(s.winner).toBe(-1)
  })
})

describe('snake AI', () => {
  it('turns away from a wall', () => {
    const s = solo()
    s.snakes[0].body = [{ x: s.cols - 1, y: 10 }, { x: s.cols - 2, y: 10 }]
    s.snakes[0].dir = 'right'
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const dir = aiChooseDir(s, 0, d, () => 0.99)
      expect(dir === 'up' || dir === 'down').toBe(true)
    }
  })
  it('heads toward food', () => {
    const s = solo()
    const h = s.snakes[0].body[0]
    s.foods = [{ x: h.x, y: h.y - 5, kind: 'apple', ttl: Infinity }]
    expect(aiChooseDir(s, 0, 'normal')).toBe('up')
  })
  it('survives a long time on hard', () => {
    let s = newGame(1, { wrap: false, speed: 1 }, mulberry32(9))
    const rng = mulberry32(10)
    for (let i = 0; i < 600 && !s.over; i++) {
      queueTurn(s.snakes[0], aiChooseDir(s, 0, 'hard', rng))
      s = step(s, rng)
    }
    expect(s.snakes[0].eaten).toBeGreaterThan(15)
  })
})
