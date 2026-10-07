import { aiShouldContinue, drawDice, endTurn, newZombie, resolveRoll, rollFaces, type ZDie, type ZState } from '../../games/zombie-dice/logic'
import { IllegalAction, assertLegal, type OnlineGame } from '../engine'

export type ZombieEvent =
  | { kind: 'bust'; seat: number; hand: ZDie[]; lost: number }
  | { kind: 'bank'; seat: number; gained: number }
  | { kind: 'final'; seat: number }

export interface ZombieOnline {
  /** Phase is only ever 'start' | 'decide' | 'over' online: rolls resolve on the server at once. */
  z: ZState
  rollNo: number
  event: ZombieEvent | null
}

export type ZombieAction = { type: 'roll' } | { type: 'stop' }

// Nothing is hidden: the cup is drawn from at random when rolling.
export type ZombieView = Omit<ZState, 'players' | 'log' | 'winners'> & { rollNo: number; event: ZombieEvent | null }

function afterTurn(prev: ZState, next: ZState, event: ZombieEvent): ZombieEvent {
  if (!prev.finalRound && next.finalRound && next.phase !== 'over') return { kind: 'final', seat: prev.turn }
  return event
}

export const zombieDice: OnlineGame<ZombieOnline, ZombieAction, ZombieView> = {
  id: 'zombie-dice',
  name: '좀비 사냥',
  emoji: '🧟',
  minPlayers: 2,
  maxPlayers: 8,
  bots: true,
  setup: (n) => ({
    z: newZombie(Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isAI: false }))),
    rollNo: 0,
    event: null,
  }),
  toAct: (s) => (s.z.phase === 'over' ? [] : [s.z.turn]),
  apply(s, seat, a, rng) {
    const z = s.z
    assertLegal(z.phase !== 'over' && seat === z.turn, '지금은 내 차례가 아니에요')
    if (a?.type === 'roll') {
      assertLegal(z.phase === 'start' || z.phase === 'decide', '지금은 굴릴 수 없어요')
      const drawn = drawDice(z, rng)
      const rolled = resolveRoll(drawn, rollFaces(drawn.hand, rng))
      const rollNo = s.rollNo + 1
      if (rolled.phase === 'bust') {
        const next = endTurn(rolled, false)
        return { z: next, rollNo, event: afterTurn(z, next, { kind: 'bust', seat, hand: rolled.hand, lost: rolled.brains }) }
      }
      return { z: rolled, rollNo, event: z.phase === 'start' ? null : s.event }
    }
    if (a?.type === 'stop') {
      assertLegal(z.phase === 'decide' && z.brains > 0, '뇌를 하나 이상 모아야 멈출 수 있어요')
      const next = endTurn(z, true)
      return { z: next, rollNo: s.rollNo, event: afterTurn(z, next, { kind: 'bank', seat, gained: z.brains }) }
    }
    throw new IllegalAction('알 수 없는 동작이에요')
  },
  view(s) {
    const { players: _p, log: _l, winners: _w, ...rest } = s.z
    return { ...rest, rollNo: s.rollNo, event: s.event }
  },
  result(s) {
    if (s.z.phase !== 'over') return null
    return { winners: s.z.winners, summary: `뇌 ${Math.max(...s.z.scores)}개로 1등`, scores: s.z.scores }
  },
  bot(s, _seat, rng) {
    const z = s.z
    if (z.phase === 'decide' && z.brains > 0 && !aiShouldContinue(z, 'normal', rng)) return { type: 'stop' }
    return { type: 'roll' }
  },
}
