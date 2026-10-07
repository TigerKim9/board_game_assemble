import {
  DONE,
  THROW_LABEL,
  addThrow,
  applyMove,
  chooseMove,
  destination,
  newGame,
  throwSticks,
  type GameState,
  type ThrowName,
} from '../../games/yut/logic'
import { assertLegal, type OnlineGame } from '../engine'

export const YUT_PIECES = 4

export interface YutEvent {
  seat: number
  text: string
}

export interface YutOnlineState {
  g: GameState
  /** Sticks of the latest throw (true = flat side up). */
  sticks: boolean[]
  /** Latest throw result and who threw it. */
  lastThrow: { t: ThrowName; seat: number } | null
  /** Increments on every throw so screens can animate it. */
  throwNo: number
  events: YutEvent[]
}

export type YutAction = { type: 'throw' } | { type: 'move'; throwIndex: number; piece: number }
// No hidden information (the sticks are thrown on the server); everyone sees everything.
export type YutView = YutOnlineState

const pushEvent = (events: YutEvent[], e: YutEvent) => [...events.slice(-7), e]

export const yut: OnlineGame<YutOnlineState, YutAction, YutView> = {
  id: 'yut',
  name: '윷놀이',
  emoji: '🪵',
  minPlayers: 2,
  maxPlayers: 4,
  bots: true,
  setup: (n) => ({
    g: newGame(n, { piecesPerPlayer: YUT_PIECES, backdo: true }),
    sticks: [true, false, true, false],
    lastThrow: null,
    throwNo: 0,
    events: [],
  }),
  toAct: (s) => (s.g.winner != null ? [] : [s.g.turn]),
  apply(s, seat, a, rng) {
    const g = s.g
    assertLegal(g.winner == null && seat === g.turn, '지금은 내 차례가 아니에요')
    if (a?.type === 'throw') {
      assertLegal(g.canThrow, '먼저 나온 윷으로 말을 움직이세요')
      const { result, sticks } = throwSticks(rng, g.settings.backdo)
      const next = addThrow(g, result)
      const passed = next.turn !== g.turn
      return {
        g: next,
        sticks,
        lastThrow: { t: result, seat },
        throwNo: s.throwNo + 1,
        events: pushEvent(s.events, {
          seat,
          text: `${THROW_LABEL[result]}!${passed ? ' — 움직일 말이 없어 차례가 넘어갔어요' : result === 'yut' || result === 'mo' ? ' 한 번 더!' : ''}`,
        }),
      }
    }
    assertLegal(a?.type === 'move', '알 수 없는 동작이에요')
    assertLegal(!g.canThrow, '먼저 윷을 던지세요')
    const { throwIndex, piece } = a
    assertLegal(Number.isInteger(throwIndex) && throwIndex >= 0 && throwIndex < g.pending.length, '잘못된 윷 선택이에요')
    assertLegal(Number.isInteger(piece) && piece >= 0 && piece < g.pieces.length, '잘못된 말이에요')
    const p = g.pieces[piece]
    assertLegal(p.owner === seat, '내 말만 움직일 수 있어요')
    assertLegal(p.pos !== DONE, '이미 나간 말이에요')
    const to = destination(p.pos, g.pending[throwIndex])
    assertLegal(to != null, '그 말은 이 윷으로 움직일 수 없어요')
    const { state: next } = applyMove(g, { throwIndex, piece, to })
    const text = next.log[next.log.length - 1] + (next.winner == null && next.turn !== g.turn ? ' — 차례 끝' : '')
    return { ...s, g: next, events: pushEvent(s.events, { seat, text }) }
  },
  view: (s) => s,
  result(s) {
    const w = s.g.winner
    if (w == null) return null
    return {
      winners: [w],
      summary: `말 ${YUT_PIECES}개를 모두 내보냈어요!`,
      scores: Array.from({ length: s.g.numPlayers }, (_, i) => s.g.pieces.filter((p) => p.owner === i && p.pos === DONE).length),
    }
  },
  bot(s, _seat, rng) {
    if (s.g.canThrow) return { type: 'throw' }
    const m = chooseMove(s.g, 'normal', rng)!
    return { type: 'move', throwIndex: m.throwIndex, piece: m.piece }
  },
}
