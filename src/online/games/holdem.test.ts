import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { TOURNEY_STACK } from '../../games/holdem/logic'
import { potTotal } from '../../games/poker-core'
import { holdem, type HoldemOnline } from './holdem'

const chips = (s: HoldemOnline) =>
  s.t.phase === 'done' ? s.t.players.reduce((a, p) => a + p.stack, 0) : s.t.bet.seats.reduce((a, x) => a + x.stack, 0) + potTotal(s.t.bet)

function play(n: number, seed: number, maxHands = Infinity) {
  const rng = mulberry32(seed)
  let s = holdem.setup(n, rng)
  let steps = 0
  while (!holdem.result(s)) {
    const seats = holdem.toAct(s)
    expect(seats).toHaveLength(1)
    const seat = seats[0]
    const a = s.t.phase === 'done' && s.t.handNo >= maxHands ? { type: 'end' as const } : holdem.bot!(s, seat, rng)
    s = holdem.apply(s, seat, a, rng)
    expect(chips(s)).toBe(n * TOURNEY_STACK)
    if (++steps > 20000) throw new Error('game did not finish')
  }
  expect(holdem.toAct(s)).toEqual([])
  return s
}

describe('online holdem', () => {
  it('bots play a heads-up tournament to the end', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const s = play(2, seed)
      const r = holdem.result(s)!
      expect(r.winners).toHaveLength(1)
      expect(s.t.players[r.winners[0]].stack).toBe(2 * TOURNEY_STACK)
    }
  })
  it('bots play 3~9 players (some to the end, others ended early by the host)', () => {
    for (let n = 3; n <= 9; n++) {
      const s = play(n, n * 13, n <= 4 ? Infinity : 12)
      const r = holdem.result(s)!
      expect(r.winners.length).toBeGreaterThan(0)
      expect(r.scores).toHaveLength(n)
    }
  }, 60_000)
  it('rejects illegal actions', () => {
    const rng = mulberry32(5)
    const s = holdem.setup(3, rng)
    const turn = s.t.bet.turn
    const other = (turn + 1) % 3
    expect(() => holdem.apply(s, other, { type: 'bet', kind: 'call' }, rng)).toThrow('차례')
    expect(() => holdem.apply(s, turn, { type: 'bet', kind: 'check' }, rng)).toThrow('체크')
    expect(() => holdem.apply(s, turn, { type: 'bet', kind: 'raise', to: 1 }, rng)).toThrow('사이')
    expect(() => holdem.apply(s, turn, { type: 'bet', kind: 'raise', to: 99999 }, rng)).toThrow()
    expect(() => holdem.apply(s, turn, { type: 'next' }, rng)).toThrow('방장')
    expect(() => holdem.apply(s, turn, { type: 'bet', kind: 'nope' } as never, rng)).toThrow()
    expect(() => holdem.apply(s, turn, { type: 'bet', kind: 'raise', to: s.t.bb * 2 }, rng)).not.toThrow()
  })
  it('view hides other hole cards and the deck', () => {
    const rng = mulberry32(9)
    const s = holdem.setup(4, rng)
    const v0 = JSON.stringify(holdem.view(s, 0))
    for (const c of s.t.holes[0]) expect(v0).toContain(`"id":"${c.id}"`)
    for (let i = 1; i < 4; i++) for (const c of s.t.holes[i]) expect(v0).not.toContain(`"id":"${c.id}"`)
    for (const c of s.t.deck) expect(v0).not.toContain(`"id":"${c.id}"`)
    const spec = JSON.stringify(holdem.view(s, null))
    for (let i = 0; i < 4; i++) for (const c of s.t.holes[i]) expect(spec).not.toContain(`"id":"${c.id}"`)
  })
  it('showdown reveals only hands that reached showdown', () => {
    let found = 0
    for (let seed = 1; seed < 60 && found < 3; seed++) {
      const rng = mulberry32(seed)
      let s = holdem.setup(4, rng)
      while (s.t.phase !== 'done') {
        const seat = holdem.toAct(s)[0]
        s = holdem.apply(s, seat, holdem.bot!(s, seat, rng), rng)
      }
      const folded = s.t.bet.seats.map((x, i) => (x.folded ? i : -1)).filter((i) => i >= 0)
      if (!s.t.outcome!.showdown || folded.length === 0) continue
      found++
      const viewer = folded[0] === 0 ? 1 : 0
      const v = JSON.stringify(holdem.view(s, viewer))
      for (const f of folded) if (f !== viewer) for (const c of s.t.holes[f]) expect(v).not.toContain(`"id":"${c.id}"`)
      s.t.bet.seats.forEach((x, i) => {
        if (!x.folded && !x.out) for (const c of s.t.holes[i]) expect(v).toContain(`"id":"${c.id}"`)
      })
    }
    expect(found).toBeGreaterThan(0)
  })
})
