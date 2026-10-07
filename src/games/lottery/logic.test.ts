import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { clampWins, customLabels, makeTickets, openAll, openTicket, openedCount, winLoseLabels, winsLeft } from './logic'

describe('lottery', () => {
  it('builds win/lose tickets with sane counts', () => {
    const l = winLoseLabels(5, 2, '당첨', '')
    expect(l.filter((x) => x.win)).toHaveLength(2)
    expect(l.filter((x) => !x.win).every((x) => x.label === '꽝')).toBe(true)
    expect(clampWins(0, 5)).toBe(1)
    expect(clampWins(9, 5)).toBe(4)
  })
  it('pads and trims custom labels', () => {
    expect(customLabels('1등\n\n2등\n', 4).map((x) => x.label)).toEqual(['1등', '2등', '꽝', '꽝'])
    expect(customLabels('a\nb\nc', 2)).toHaveLength(2)
    expect(customLabels('꽝', 2).every((x) => !x.win)).toBe(true)
  })
  it('shuffles without losing tickets', () => {
    const t = makeTickets(winLoseLabels(20, 3, '당첨', '꽝'), mulberry32(4))
    expect(t).toHaveLength(20)
    expect(t.filter((x) => x.win)).toHaveLength(3)
  })
  it('opens tickets in order', () => {
    let t = makeTickets(winLoseLabels(4, 1, 'W', 'L'), mulberry32(1))
    t = openTicket(t, 2)
    t = openTicket(t, 2)
    t = openTicket(t, 0)
    expect(t[2].openedAt).toBe(1)
    expect(t[0].openedAt).toBe(2)
    expect(openedCount(t)).toBe(2)
    const all = openAll(t)
    expect(openedCount(all)).toBe(4)
    expect(winsLeft(all)).toBe(0)
    expect(new Set(all.map((x) => x.openedAt)).size).toBe(4)
  })
})
