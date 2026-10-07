import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { FULL_CUP, aiShouldContinue, drawDice, endTurn, estimateNext, newZombie, resolveRoll, type ZState } from './logic'

const players = [
  { name: 'A', isAI: false },
  { name: 'B', isAI: true },
  { name: 'C', isAI: true },
]

describe('zombie hunt rules', () => {
  it('has 13 dice', () => {
    expect(FULL_CUP.length).toBe(13)
  })
  it('draws three dice and resolves faces', () => {
    let s = drawDice(newZombie(players), mulberry32(1))
    expect(s.hand.length).toBe(3)
    expect(s.cup.length).toBe(10)
    s = resolveRoll(s, ['brain', 'shot', 'feet'])
    expect(s.brains).toBe(1)
    expect(s.shots.length).toBe(1)
    expect(s.phase).toBe('decide')
    // footprint stays, two new drawn
    s = drawDice(s, mulberry32(2))
    expect(s.hand.length).toBe(3)
    expect(s.cup.length).toBe(8)
  })
  it('busts on three shots', () => {
    let s = drawDice(newZombie(players))
    s = resolveRoll(s, ['brain', 'shot', 'shot'])
    s = drawDice(s)
    s = resolveRoll(s, ['brain', 'shot', 'feet'])
    expect(s.phase).toBe('bust')
    s = endTurn(s, false)
    expect(s.scores).toEqual([0, 0, 0])
    expect(s.turn).toBe(1)
  })
  it('recycles brain dice when the cup runs dry', () => {
    let s: ZState = { ...newZombie(players), phase: 'decide', cup: ['green'], brainDice: ['red', 'yellow', 'green'], brains: 9, hand: [] }
    s = drawDice(s, mulberry32(3))
    expect(s.hand.length).toBe(3)
    expect(s.brains).toBe(9)
    expect(s.brainDice).toEqual([])
  })
  it('finishes the round after someone reaches 13', () => {
    let s: ZState = { ...newZombie(players), scores: [0, 12, 5], turn: 1, phase: 'decide', brains: 2 }
    s = endTurn(s, true)
    expect(s.finalRound).toBe(true)
    expect(s.phase).toBe('start')
    expect(s.turn).toBe(2)
    s = endTurn({ ...s, brains: 9, phase: 'decide' }, true)
    expect(s.phase).toBe('over')
    expect(s.winners).toEqual([1, 2])
  })
})

describe('zombie hunt AI', () => {
  it('estimates more risk with two shots', () => {
    const base: ZState = { ...newZombie(players), phase: 'decide', brains: 2, cup: FULL_CUP.slice(3) }
    const safe = estimateNext({ ...base, shots: [] }, 500, mulberry32(4))
    const risky = estimateNext({ ...base, shots: ['red', 'yellow'] }, 500, mulberry32(4))
    expect(safe.bust).toBeLessThan(0.1)
    expect(risky.bust).toBeGreaterThan(0.2)
  })
  it('stops with lots of brains and two shots (hard)', () => {
    const s: ZState = { ...newZombie(players), turn: 1, phase: 'decide', brains: 6, shots: ['red', 'red'], cup: FULL_CUP.slice(8) }
    expect(aiShouldContinue(s, 'hard', mulberry32(5))).toBe(false)
  })
  it('keeps going early in a turn', () => {
    const s: ZState = { ...newZombie(players), turn: 1, phase: 'decide', brains: 1, shots: [], cup: FULL_CUP.slice(3) }
    expect(aiShouldContinue(s, 'hard', mulberry32(6))).toBe(true)
    expect(aiShouldContinue(s, 'normal', mulberry32(6))).toBe(true)
  })
  it('banks a winning total', () => {
    const s: ZState = { ...newZombie(players), scores: [3, 11, 2], turn: 1, phase: 'decide', brains: 2, shots: [] }
    expect(aiShouldContinue(s, 'hard')).toBe(false)
  })
  it('chases the leader in the final round', () => {
    const s: ZState = { ...newZombie(players), scores: [14, 10, 2], finalRound: true, turn: 1, phase: 'decide', brains: 3, shots: ['red', 'red'] }
    expect(aiShouldContinue(s, 'easy')).toBe(true)
  })
})
