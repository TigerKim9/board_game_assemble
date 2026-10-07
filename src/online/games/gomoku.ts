import { CELLS, applyMove, aiMove, initialState, isForbidden, stoneOf, winner, type GomokuState } from '../../games/gomoku/logic'
import { assertLegal, type OnlineGame } from '../engine'

export type GomokuAction = { cell: number }
// No hidden information: everyone sees the whole board.
export type GomokuView = GomokuState

export const gomoku: OnlineGame<GomokuState, GomokuAction, GomokuView> = {
  id: 'gomoku',
  name: '오목',
  emoji: '⚫',
  minPlayers: 2,
  maxPlayers: 2,
  bots: true,
  setup: () => initialState('free'),
  toAct: (s) => (s.over ? [] : [s.turn]),
  apply(s, seat, a) {
    assertLegal(seat === s.turn && !s.over, '지금은 내 차례가 아니에요')
    assertLegal(Number.isInteger(a?.cell) && a.cell >= 0 && a.cell < CELLS, '잘못된 위치예요')
    assertLegal(s.board[a.cell] === 0, '이미 돌이 있는 자리예요')
    assertLegal(!isForbidden(s, a.cell, stoneOf(s.turn)), '금수 자리예요')
    return applyMove(s, a.cell)
  },
  view: (s) => s,
  result(s) {
    const w = winner(s)
    if (w == null) return null
    if (w < 0) return { winners: [], summary: '판이 가득 찼어요 — 무승부' }
    return { winners: [w], summary: `${w === 0 ? '흑' : '백'} 5목 완성!` }
  },
  bot: (s, _seat, rng) => ({ cell: aiMove(s, 'normal', rng, 600) ?? s.board.indexOf(0) }),
}
