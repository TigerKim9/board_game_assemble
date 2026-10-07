import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { allCards } from '../../games/gostop-core/logic'
import { IllegalAction } from '../engine'
import { gostop, type GostopMatch } from './gostop'
import { matgo } from './matgo'

function playOut(game: typeof gostop, seed: number) {
  const rng = mulberry32(seed)
  const n = game.minPlayers
  let s = game.setup(n, rng)
  for (let step = 0; step < 5000; step++) {
    const who = game.toAct(s)
    if (!who.length) break
    const seat = who[0]
    s = game.apply(s, seat, game.bot!(s, seat, rng), rng)
    if (s.stage === 'play') expect(allCards(s.g).sort((a, b) => a - b)).toEqual(Array.from({ length: 48 }, (_, i) => i))
  }
  return s
}

describe.each([
  ['matgo', matgo],
  ['gostop', gostop],
])('%s online', (_id, game) => {
  it('bots play whole matches to the end', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = playOut(game, seed)
      expect(s.stage).toBe('matchOver')
      expect(s.history).toHaveLength(s.rounds)
      // 점수는 주고받기만 하므로 합이 0
      expect(s.totals.reduce((a, b) => a + b, 0)).toBe(0)
      const r = game.result(s)!
      expect(r).not.toBeNull()
      if (r.winners.length) for (const w of r.winners) expect(s.totals[w]).toBe(Math.max(...s.totals))
    }
  })

  it('hides other hands and the deck', () => {
    const rng = mulberry32(7)
    const s = game.setup(game.minPlayers, rng) as GostopMatch
    if (s.stage !== 'play') return
    const v = game.view(s, 0)
    expect(v.g.players[0].hand).toEqual(s.g.players[0].hand)
    expect(v.g.players[1].hand).toEqual([])
    expect(v.g.deck).toEqual([])
    expect(v.handCounts[1]).toBe(s.g.players[1].hand.length)
    expect(v.deckCount).toBe(s.g.deck.length)
    const json = JSON.stringify(v)
    expect(json).not.toContain(JSON.stringify(s.g.players[1].hand))
    const spec = game.view(s, null)
    expect(spec.g.players.every((p) => p.hand.length === 0)).toBe(true)
  })

  it('rejects illegal actions', () => {
    const rng = mulberry32(3)
    let s = game.setup(game.minPlayers, rng) as GostopMatch
    while (s.stage !== 'play') s = game.setup(game.minPlayers, rng)
    const turn = s.g.turn
    const other = (turn + 1) % game.minPlayers
    const theirs = s.g.players[other].hand[0]
    expect(() => game.apply(s, other, { type: 'play', card: s.g.players[other].hand[0] }, rng)).toThrow(IllegalAction)
    expect(() => game.apply(s, turn, { type: 'play', card: theirs }, rng)).toThrow('손에 없는')
    expect(() => game.apply(s, turn, { type: 'dummy' }, rng)).toThrow(IllegalAction)
    expect(() => game.apply(s, turn, { type: 'go', go: true }, rng)).toThrow(IllegalAction)
    expect(() => game.apply(s, turn, { type: 'choose', card: 0 }, rng)).toThrow(IllegalAction)
    expect(() => game.apply(s, turn, { type: 'next' }, rng)).toThrow(IllegalAction)
    const card = s.g.players[turn].hand.find((c) => !s.g.floor.some((f) => f >> 2 === c >> 2))
    if (card != null) expect(() => game.apply(s, turn, { type: 'play', card, bomb: true }, rng)).toThrow('폭탄')
    // 정상 동작은 통과
    const next = game.apply(s, turn, { type: 'play', card: s.g.players[turn].hand[0] }, rng)
    expect(next).not.toBe(s)
  })

  it('waits for everyone before the next round', () => {
    const rng = mulberry32(11)
    let s = game.setup(game.minPlayers, rng)
    while (s.stage === 'play') {
      const seat = game.toAct(s)[0]
      s = game.apply(s, seat, game.bot!(s, seat, rng), rng)
    }
    expect(s.stage).toBe('roundOver')
    expect(game.toAct(s)).toEqual(Array.from({ length: game.minPlayers }, (_, i) => i))
    s = game.apply(s, 0, { type: 'next' }, rng)
    expect(game.toAct(s)).not.toContain(0)
    expect(() => game.apply(s, 0, { type: 'next' }, rng)).toThrow(IllegalAction)
    for (let i = 1; i < game.minPlayers; i++) s = game.apply(s, i, { type: 'next' }, rng)
    expect(s.round).toBe(2)
  })
})
