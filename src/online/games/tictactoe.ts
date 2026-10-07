import { aiMove, applyMove, emptyCells, initialState, winner, type TttState } from '../../games/tictactoe/logic'
import { assertLegal, type OnlineGame } from '../engine'

export type TictactoeAction = { cell: number }
// No hidden information: everyone sees the whole board.
export type TictactoeView = TttState

export const tictactoe: OnlineGame<TttState, TictactoeAction, TictactoeView> = {
  id: 'tictactoe',
  name: '틱택토',
  emoji: '⭕',
  minPlayers: 2,
  maxPlayers: 2,
  bots: true,
  setup: () => initialState(0),
  toAct: (s) => (s.over ? [] : [s.turn]),
  apply(s, seat, a) {
    assertLegal(!s.over && seat === s.turn, '지금은 내 차례가 아니에요')
    assertLegal(Number.isInteger(a?.cell) && a.cell >= 0 && a.cell < 9, '잘못된 칸이에요')
    assertLegal(s.board[a.cell] === 0, '이미 표시된 칸이에요')
    return applyMove(s, a.cell)
  },
  view: (s) => s,
  result(s) {
    const w = winner(s)
    if (w == null) return null
    if (w < 0) return { winners: [], summary: '🤝 비겼어요!' }
    return { winners: [w], summary: `${w === 0 ? '⭕' : '✕'} 세 줄 완성!` }
  },
  bot: (s, _seat, rng) => ({ cell: aiMove(s, 'normal', rng) ?? emptyCells(s.board)[0] }),
}
