import { COLS, aiMove, applyMove, dropRow, initialState, legalCols, winner, type C4State } from '../../games/connect4/logic'
import { assertLegal, type OnlineGame } from '../engine'

export type Connect4Action = { col: number }
// No hidden information: everyone sees the whole board.
export type Connect4View = C4State

export const connect4: OnlineGame<C4State, Connect4Action, Connect4View> = {
  id: 'connect4',
  name: '사목',
  emoji: '🔴',
  minPlayers: 2,
  maxPlayers: 2,
  bots: true,
  setup: () => initialState(),
  toAct: (s) => (s.over ? [] : [s.turn]),
  apply(s, seat, a) {
    assertLegal(!s.over && seat === s.turn, '지금은 내 차례가 아니에요')
    assertLegal(Number.isInteger(a?.col) && a.col >= 0 && a.col < COLS, '잘못된 줄이에요')
    assertLegal(dropRow(s.board, a.col) >= 0, '그 줄은 가득 찼어요')
    return applyMove(s, a.col)
  },
  view: (s) => s,
  result(s) {
    const w = winner(s)
    if (w == null) return null
    if (w < 0) return { winners: [], summary: '판이 가득 찼어요 — 무승부' }
    return { winners: [w], summary: `${w === 0 ? '🔴 빨강' : '🟡 노랑'} 네 개 연결!` }
  },
  bot: (s, _seat, rng) => ({ col: aiMove(s, 'normal', rng) ?? legalCols(s.board)[0] }),
}
