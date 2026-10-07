import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { parseCards } from '../../cards'
import { hula, HULA_ROUNDS, type HulaOnline } from './hula'

const cardCount = (o: HulaOnline) => o.s.deck.length + o.s.discard.length + o.s.hands.reduce((a, h) => a + h.length, 0) + o.s.melds.reduce((a, m) => a + m.cards.length, 0)

function play(n: number, seed: number) {
  const rng = mulberry32(seed)
  let o = hula.setup(n, rng)
  let steps = 0
  let thanks = 0
  while (!hula.result(o)) {
    const seats = hula.toAct(o)
    expect(seats.length).toBeGreaterThan(0)
    const seat = seats[Math.floor(rng() * seats.length)]
    const a = hula.bot!(o, seat, rng)
    if (a.type === 'thank') thanks++
    o = hula.apply(o, seat, a, rng)
    expect(cardCount(o)).toBe(52)
    if (++steps > 20000) throw new Error('game did not finish')
  }
  expect(hula.toAct(o)).toEqual([])
  return { o, thanks }
}

describe('online hula', () => {
  it('bots finish games for 2~4 players', () => {
    let thanks = 0
    for (let n = 2; n <= 4; n++)
      for (let seed = 1; seed <= 6; seed++) {
        const r = play(n, seed * 11 + n)
        thanks += r.thanks
        expect(r.o.s.round).toBe(HULA_ROUNDS)
        const res = hula.result(r.o)!
        expect(res.winners.length).toBeGreaterThan(0)
      }
    expect(thanks).toBeGreaterThan(0)
  }, 60_000)

  it('rejects illegal actions', () => {
    const rng = mulberry32(4)
    const o = hula.setup(3, rng)
    const turn = o.s.turn
    const other = (turn + 1) % 3
    expect(() => hula.apply(o, other, { type: 'draw' }, rng)).toThrow('차례')
    expect(() => hula.apply(o, turn, { type: 'discard', cardId: o.s.hands[turn][0].id }, rng)).toThrow('뽑')
    expect(() => hula.apply(o, turn, { type: 'thank' }, rng)).toThrow('땡큐')
    expect(() => hula.apply(o, turn, { type: 'next' }, rng)).toThrow()
    const p = hula.apply(o, turn, { type: 'draw' }, rng)
    expect(() => hula.apply(p, turn, { type: 'draw' }, rng)).toThrow()
    expect(() => hula.apply(p, turn, { type: 'discard', cardId: 'nope' }, rng)).toThrow('손에')
    expect(() => hula.apply(p, turn, { type: 'attach', cardId: p.s.hands[turn][0].id, meldId: 1 }, rng)).toThrow('등록한 뒤')
    const h = p.s.hands[turn]
    expect(() => hula.apply(p, turn, { type: 'register', ids: [h[0].id, h[0].id] }, rng)).toThrow('두 번')
    expect(() => hula.apply(p, turn, { type: 'register', ids: [] }, rng)).toThrow()
    const q = hula.apply(p, turn, { type: 'discard', cardId: h[0].id }, rng)
    expect(q.s.hands[turn]).toHaveLength(7)
  })

  it('땡큐 window: eligible seats act simultaneously, earlier seat has priority', () => {
    const rng = mulberry32(1)
    const base = hula.setup(4, rng)
    // seat 0 discards ♥5; seat 2 and 3 both hold ♥3·♥4 / ♠5·♦5 and may claim it
    const hands = [
      parseCards('5H 9C JC KS QD 2D 2S 9H'),
      parseCards('2C 4C 9D JD QS KH QH'),
      parseCards('3H 4H KD JC 9S JS 6C'),
      parseCards('5S 5D KC JH 10D QC 4D'),
    ]
    let o: HulaOnline = { ...base, s: { ...base.s, hands, turn: 0, phase: 'play', mustUse: null } }
    o = hula.apply(o, 0, { type: 'discard', cardId: hands[0][0].id }, rng)
    expect(o.s.phase).toBe('thankyou')
    expect(hula.toAct(o)).toEqual([2, 3])
    // seat 3 claims first but must wait for seat 2's decision
    const w = hula.apply(o, 3, { type: 'thank' }, rng)
    expect(w.s.phase).toBe('thankyou')
    expect(hula.toAct(w)).toEqual([2])
    expect(() => hula.apply(w, 3, { type: 'pass' }, rng)).toThrow('이미')
    const a = hula.apply(w, 2, { type: 'thank' }, rng)
    expect(a.s.turn).toBe(2)
    expect(a.s.phase).toBe('play')
    const b = hula.apply(w, 2, { type: 'pass' }, rng)
    expect(b.s.turn).toBe(3)
    expect(b.s.mustUse).toBe(hands[0][0].id)
    // everyone passes → next player draws
    const c = hula.apply(hula.apply(o, 2, { type: 'pass' }, rng), 3, { type: 'pass' }, rng)
    expect(c.s.phase).toBe('draw')
    expect(c.s.turn).toBe(1)
    // the view never shows another player's hand during the window
    const v = JSON.stringify(hula.view(o, 2))
    for (const card of o.s.hands[3]) expect(v).not.toContain(`"id":"${card.id}"`)
  })

  it('view hides other hands and the deck', () => {
    const rng = mulberry32(9)
    const o = hula.setup(3, rng)
    const v0 = JSON.stringify(hula.view(o, 0))
    for (const c of o.s.hands[0]) expect(v0).toContain(`"id":"${c.id}"`)
    for (const i of [1, 2]) for (const c of o.s.hands[i]) expect(v0).not.toContain(`"id":"${c.id}"`)
    for (const c of o.s.deck) expect(v0).not.toContain(`"id":"${c.id}"`)
    const v = hula.view(o, 0)
    expect(v.s.deck).toHaveLength(o.s.deck.length)
    expect(v.s.hands[1]).toHaveLength(7)
    const spec = JSON.stringify(hula.view(o, null))
    for (const h of o.s.hands) for (const c of h) expect(spec).not.toContain(`"id":"${c.id}"`)
  })
})
