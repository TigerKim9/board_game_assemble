import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { START_CHIPS } from '../../games/sevenpoker/logic'
import { potTotal } from '../../games/poker-core'
import { sevenpoker, type SevenOnline } from './sevenpoker'

const chips = (s: SevenOnline) =>
  s.t.phase === 'done' ? s.t.players.reduce((a, p) => a + p.stack, 0) : s.t.bet.seats.reduce((a, x) => a + x.stack, 0) + potTotal(s.t.bet)

function play(n: number, seed: number, maxHands: number) {
  const rng = mulberry32(seed)
  let s = sevenpoker.setup(n, rng)
  let steps = 0
  while (!sevenpoker.result(s)) {
    const seats = sevenpoker.toAct(s)
    expect(seats.length).toBeGreaterThan(0)
    // 초이스는 동시에: 뒤쪽 좌석부터 골라 순서와 무관한지 확인
    const seat = seats[seats.length - 1]
    const a = s.t.phase === 'done' && s.t.handNo >= maxHands ? { type: 'end' as const } : sevenpoker.bot!(s, seat, rng)
    s = sevenpoker.apply(s, seat, a, rng)
    expect(chips(s)).toBe(n * START_CHIPS)
    if (++steps > 20000) throw new Error('game did not finish')
  }
  expect(sevenpoker.toAct(s)).toEqual([])
  return s
}

describe('online sevenpoker', () => {
  it('bots play several hands for 2~7 players', () => {
    for (let n = 2; n <= 7; n++)
      for (let seed = 1; seed <= 2; seed++) {
        const s = play(n, seed * 31 + n, 6)
        const r = sevenpoker.result(s)!
        expect(r.winners.length).toBeGreaterThan(0)
        expect(r.scores).toHaveLength(n)
      }
  }, 60_000)
  it('game ends when one player has every chip', () => {
    const rng = mulberry32(3)
    let s = sevenpoker.setup(2, rng)
    s = { ...s, t: { ...s.t, players: s.t.players.map((p, i) => ({ ...p, stack: i === 0 ? 2 * START_CHIPS - 30 : 30 })) } }
    s = { ...s, t: { ...s.t, phase: 'done' } }
    s = sevenpoker.apply(s, 0, { type: 'next' }, rng)
    let steps = 0
    while (!sevenpoker.result(s) && steps++ < 2000) {
      const seat = sevenpoker.toAct(s)[0]
      s = sevenpoker.apply(s, seat, sevenpoker.bot!(s, seat, rng), rng)
    }
    expect(sevenpoker.result(s)!.winners).toHaveLength(1)
    expect(s.ended).toBe(false)
  })
  it('rejects illegal actions', () => {
    const rng = mulberry32(5)
    const s = sevenpoker.setup(3, rng)
    expect(sevenpoker.toAct(s)).toEqual([0, 1, 2])
    expect(() => sevenpoker.apply(s, 0, { type: 'choose', discard: 1, open: 1 }, rng)).toThrow('다르게')
    expect(() => sevenpoker.apply(s, 0, { type: 'choose', discard: 4, open: 1 }, rng)).toThrow()
    expect(() => sevenpoker.apply(s, 0, { type: 'bet', name: 'call' }, rng)).toThrow('차례')
    expect(() => sevenpoker.apply(s, 0, { type: 'next' }, rng)).toThrow('방장')
    const t = sevenpoker.apply(s, 0, { type: 'choose', discard: 0, open: 1 }, rng)
    expect(sevenpoker.toAct(t)).toEqual([1, 2])
    expect(() => sevenpoker.apply(t, 0, { type: 'choose', discard: 0, open: 1 }, rng)).toThrow()
    let u = sevenpoker.apply(t, 1, { type: 'choose', discard: 0, open: 1 }, rng)
    u = sevenpoker.apply(u, 2, { type: 'choose', discard: 0, open: 1 }, rng)
    expect(u.t.phase).toBe('betting')
    const turn = u.t.bet.turn
    expect(() => sevenpoker.apply(u, (turn + 1) % 3, { type: 'bet', name: 'check' }, rng)).toThrow('차례')
    expect(() => sevenpoker.apply(u, turn, { type: 'bet', name: 'call' }, rng)).toThrow('베팅')
    expect(() => sevenpoker.apply(u, turn, { type: 'bet', name: 'half' }, rng)).not.toThrow()
  })
  it('view hides hidden cards and pending choices', () => {
    const rng = mulberry32(9)
    let s = sevenpoker.setup(3, rng)
    s = sevenpoker.apply(s, 1, { type: 'choose', discard: 0, open: 1 }, rng)
    const v0 = JSON.stringify(sevenpoker.view(s, 0))
    for (const c of s.t.cards[0]) expect(v0).toContain(`"id":"${c.card.id}"`)
    // 1번이 공개하기로 한 카드도 모두 고를 때까지 비공개
    for (const i of [1, 2]) for (const c of s.t.cards[i]) expect(v0).not.toContain(`"id":"${c.card.id}"`)
    for (const c of s.t.deck) expect(v0).not.toContain(`"id":"${c.id}"`)
    s = sevenpoker.apply(s, 0, { type: 'choose', discard: 0, open: 1 }, rng)
    s = sevenpoker.apply(s, 2, { type: 'choose', discard: 0, open: 1 }, rng)
    const v = JSON.stringify(sevenpoker.view(s, 0))
    for (const i of [1, 2])
      for (const c of s.t.cards[i]) {
        if (c.open) expect(v).toContain(`"id":"${c.card.id}"`)
        else expect(v).not.toContain(`"id":"${c.card.id}"`)
      }
    const spec = JSON.stringify(sevenpoker.view(s, null))
    for (const h of s.t.cards) for (const c of h) if (!c.open) expect(spec).not.toContain(`"id":"${c.card.id}"`)
  })
})
