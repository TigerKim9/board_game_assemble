import { describe, expect, it } from 'vitest'
import { START_CHIPS } from '../../games/seotda/logic'
import { mulberry32 } from '../../lib/random'
import { IllegalAction } from '../engine'
import { seotda, type SeotdaMatch } from './seotda'

const total = (m: SeotdaMatch) => m.t.players.reduce((a, p) => a + p.chips, 0) + (m.stage === 'bet' ? m.t.pot : m.t.result?.kind === 'redeal' ? m.t.pot : 0)

describe('seotda online', () => {
  it('bots play whole matches for 2~5 players and chips are conserved', () => {
    for (let n = 2; n <= 5; n++) {
      for (let seed = 1; seed <= 15; seed++) {
        const rng = mulberry32(seed * 10 + n)
        let s = seotda.setup(n, rng)
        let steps = 0
        while (seotda.toAct(s).length && steps++ < 5000) {
          const seat = seotda.toAct(s)[0]
          s = seotda.apply(s, seat, seotda.bot!(s, seat, rng), rng)
          expect(total(s)).toBe(START_CHIPS * n)
        }
        expect(s.stage).toBe('matchOver')
        const r = seotda.result(s)!
        expect(r.scores!.reduce((a, b) => a + b, 0)).toBe(START_CHIPS * n)
      }
    }
  })

  it('hides other cards until the showdown', () => {
    const rng = mulberry32(5)
    let s = seotda.setup(3, rng)
    const v = seotda.view(s, 0)
    expect(v.t.deck).toEqual([])
    expect(v.t.players[0].cards).toEqual(s.t.players[0].cards)
    expect(v.t.players[1].cards).toEqual([-1])
    expect(seotda.view(s, null).t.players.every((p) => p.cards.every((c) => c === -1))).toBe(true)
    // 끝까지 콜만 하면 승부에서 모두 공개
    while (s.stage === 'bet') s = seotda.apply(s, s.t.turn, { type: 'bet', action: 'call' }, rng)
    const v2 = seotda.view(s, 0)
    expect(v2.t.players[1].cards).toEqual(s.t.players[1].cards)
  })

  it('folded hands stay hidden at the showdown', () => {
    const rng = mulberry32(9)
    let s = seotda.setup(3, rng)
    const folder = s.t.turn
    s = seotda.apply(s, folder, { type: 'bet', action: 'die' }, rng)
    while (s.stage === 'bet') s = seotda.apply(s, s.t.turn, { type: 'bet', action: 'call' }, rng)
    const other = (folder + 1) % 3
    expect(seotda.view(s, other).t.players[folder].cards.every((c) => c === -1)).toBe(true)
  })

  it('rejects illegal actions', () => {
    const rng = mulberry32(2)
    const s = seotda.setup(2, rng)
    const other = (s.t.turn + 1) % 2
    expect(() => seotda.apply(s, other, { type: 'bet', action: 'call' }, rng)).toThrow(IllegalAction)
    expect(() => seotda.apply(s, s.t.turn, { type: 'bet', action: 'allin' as never }, rng)).toThrow(IllegalAction)
    expect(() => seotda.apply(s, s.t.turn, { type: 'next' }, rng)).toThrow(IllegalAction)
    let t = s
    for (let k = 0; k < 3; k++) t = seotda.apply(t, t.t.turn, { type: 'bet', action: 'bbing' }, rng)
    // 한 바퀴 최대 3번 올리기
    expect(() => seotda.apply(t, t.t.turn, { type: 'bet', action: 'bbing' }, rng)).toThrow(IllegalAction)
  })
})
