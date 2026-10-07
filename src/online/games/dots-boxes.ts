import { aiMove, applyMove, geo, initialState, scores, type DbState } from '../../games/dots-boxes/logic'
import { assertLegal, type OnlineGame } from '../engine'

export type DotsBoxesAction = { edge: number }
// No hidden information: everyone sees the whole board.
export type DotsBoxesView = DbState

/** Board size: 4×4 boxes for two players, 5×5 for three or four. */
export const dotsBoxesSize = (players: number) => (players <= 2 ? 4 : 5)

export const dotsBoxes: OnlineGame<DbState, DotsBoxesAction, DotsBoxesView> = {
  id: 'dots-boxes',
  name: '도트 앤 박스',
  emoji: '🔲',
  minPlayers: 2,
  maxPlayers: 4,
  bots: true,
  setup: (n) => initialState(dotsBoxesSize(n), n),
  toAct: (s) => (s.over ? [] : [s.turn]),
  apply(s, seat, a) {
    assertLegal(!s.over && seat === s.turn, '지금은 내 차례가 아니에요')
    assertLegal(Number.isInteger(a?.edge) && a.edge >= 0 && a.edge < geo(s.n).E, '잘못된 선이에요')
    assertLegal(s.edges[a.edge] < 0, '이미 그어진 선이에요')
    return applyMove(s, a.edge)
  },
  view: (s) => s,
  result(s) {
    if (!s.over) return null
    const sc = scores(s)
    const top = Math.max(...sc)
    const winners = sc.flatMap((v, i) => (v === top ? [i] : []))
    return {
      winners: winners.length === sc.length ? [] : winners,
      summary: winners.length > 1 ? `${top}칸으로 공동 1등` : `상자 ${top}칸 차지!`,
      scores: sc,
    }
  },
  bot: (s, _seat, rng) => ({ edge: aiMove(s, 'hard', rng) ?? s.edges.indexOf(-1) }),
}
