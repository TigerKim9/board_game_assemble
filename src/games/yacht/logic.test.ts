import { describe, expect, it } from 'vitest'
import { bestCategory, bonusFor, chooseHolds, scoreFor, total } from './logic'

describe('yacht scoring', () => {
  it('scores upper section', () => {
    expect(scoreFor('threes', [3, 3, 1, 3, 6])).toBe(9)
    expect(scoreFor('sixes', [1, 2, 3, 4, 5])).toBe(0)
  })
  it('scores four of a kind and yacht', () => {
    expect(scoreFor('fourKind', [4, 4, 4, 4, 2])).toBe(18)
    expect(scoreFor('fourKind', [4, 4, 4, 2, 2])).toBe(0)
    expect(scoreFor('yacht', [5, 5, 5, 5, 5])).toBe(50)
    expect(scoreFor('fourKind', [5, 5, 5, 5, 5])).toBe(25)
  })
  it('scores full house as the sum', () => {
    expect(scoreFor('fullHouse', [2, 2, 5, 5, 5])).toBe(19)
    expect(scoreFor('fullHouse', [2, 2, 5, 5, 6])).toBe(0)
  })
  it('scores straights', () => {
    expect(scoreFor('smallStraight', [1, 2, 3, 4, 6])).toBe(15)
    expect(scoreFor('smallStraight', [3, 4, 5, 6, 6])).toBe(15)
    expect(scoreFor('smallStraight', [1, 2, 3, 5, 6])).toBe(0)
    expect(scoreFor('largeStraight', [2, 3, 4, 5, 6])).toBe(30)
    expect(scoreFor('largeStraight', [1, 2, 3, 4, 6])).toBe(0)
  })
  it('awards upper bonus at 63', () => {
    const s = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 }
    expect(bonusFor(s)).toBe(35)
    expect(total(s)).toBe(63 + 35)
    expect(bonusFor({ ...s, sixes: 12 })).toBe(0)
  })
})

describe('yacht AI', () => {
  it('takes yacht when available', () => {
    expect(bestCategory([6, 6, 6, 6, 6], {})).toBe('yacht')
  })
  it('takes large straight', () => {
    expect(bestCategory([1, 2, 3, 4, 5], {})).toBe('largeStraight')
  })
  it('keeps a yacht when holding', () => {
    expect(chooseHolds([3, 3, 3, 3, 3], {}, 2)).toEqual([true, true, true, true, true])
  })
  it('holds a four of a kind', () => {
    const h = chooseHolds([6, 6, 6, 6, 1], {}, 1, 300)
    expect(h.slice(0, 4)).toEqual([true, true, true, true])
  })
})
