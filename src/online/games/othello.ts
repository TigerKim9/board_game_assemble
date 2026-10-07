import { aiMove, applyMove, colorOf, counts, flipsFor, initialState, legalMoves, winner, type OthelloState } from '../../games/othello/logic'
import { assertLegal, type OnlineGame } from '../engine'

export type OthelloAction = { cell: number }
// No hidden information: everyone sees the whole board.
export type OthelloView = OthelloState

export const othello: OnlineGame<OthelloState, OthelloAction, OthelloView> = {
  id: 'othello',
  name: '오델로',
  emoji: '⚫',
  minPlayers: 2,
  maxPlayers: 2,
  bots: true,
  setup: () => initialState(),
  // applyMove handles forced passes, so the side to move always has a legal move.
  toAct: (s) => (s.over ? [] : [s.turn]),
  apply(s, seat, a) {
    assertLegal(!s.over && seat === s.turn, '지금은 내 차례가 아니에요')
    assertLegal(Number.isInteger(a?.cell) && a.cell >= 0 && a.cell < 64, '잘못된 위치예요')
    assertLegal(flipsFor(s.board, a.cell, colorOf(s.turn)).length > 0, '거기에는 둘 수 없어요 (뒤집을 돌이 없어요)')
    return applyMove(s, a.cell)
  },
  view: (s) => s,
  result(s) {
    if (!s.over) return null
    const sc = counts(s.board)
    const w = winner(s)
    return {
      winners: w < 0 ? [] : [w],
      summary: w < 0 ? `${sc[0]} : ${sc[1]} 무승부` : `${w === 0 ? '⚫ 흑' : '⚪ 백'} 승리 — ${sc[0]} : ${sc[1]}`,
      scores: sc,
    }
  },
  bot: (s, _seat, rng) => ({ cell: aiMove(s, 'normal', rng) ?? legalMoves(s.board, colorOf(s.turn))[0] }),
}
