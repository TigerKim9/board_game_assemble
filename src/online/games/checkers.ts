import { DRAW_PLIES, aiMove, applyMove, initialState, legalMoves, pieceCounts, type CheckersState } from '../../games/checkers/logic'
import { assertLegal, type OnlineGame } from '../engine'

/** Start square followed by every landing square (must match one legal move exactly). */
export type CheckersAction = { path: number[] }
// No hidden information: everyone sees the whole board.
export type CheckersView = CheckersState

export const checkers: OnlineGame<CheckersState, CheckersAction, CheckersView> = {
  id: 'checkers',
  name: '체커',
  emoji: '🏁',
  minPlayers: 2,
  maxPlayers: 2,
  bots: true,
  setup: () => initialState(),
  toAct: (s) => (s.over ? [] : [s.turn]),
  apply(s, seat, a) {
    assertLegal(!s.over && seat === s.turn, '지금은 내 차례가 아니에요')
    const path = a?.path
    assertLegal(Array.isArray(path) && path.length >= 2 && path.length <= 13, '잘못된 수예요')
    const legal = legalMoves(s.board, s.turn)
    const m = legal.find((x) => x.path.length === path.length && x.path.every((p, i) => p === path[i]))
    if (!m) {
      const mustCapture = legal.length > 0 && legal[0].captures.length > 0
      assertLegal(false, mustCapture ? '잡을 수 있는 말은 꼭 잡아야 해요' : '그렇게 움직일 수 없어요')
    }
    return applyMove(s, m!)
  },
  view: (s) => s,
  result(s) {
    if (!s.over) return null
    const sc = pieceCounts(s.board)
    if (s.winner === -1) return { winners: [], summary: `${DRAW_PLIES / 2}수씩 잡기도 전진도 없어서 무승부`, scores: sc }
    return { winners: [s.winner!], summary: '상대가 움직일 수 있는 말이 없어요!', scores: sc }
  },
  bot: (s, _seat, rng) => ({ path: (aiMove(s, 'normal', rng) ?? legalMoves(s.board, s.turn)[0]).path }),
}
