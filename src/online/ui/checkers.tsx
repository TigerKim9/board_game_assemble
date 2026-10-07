import { CheckersBoard, Token, useCheckersPick } from '../../games/checkers/Board'
import { DRAW_PLIES, pieceCounts, type CheckersState } from '../../games/checkers/logic'
import '../../games/checkers/checkers.css'
import type { CheckersAction } from '../games/checkers'
import { SeatBar } from './SeatBar'
import type { OnlineGameProps } from './types'

export default function OnlineCheckers({ view: s, seat, toAct, seats, act }: OnlineGameProps<CheckersState, CheckersAction>) {
  const myTurn = seat != null && toAct.includes(seat)
  const pick = useCheckersPick(s, myTurn, (m) => act({ path: m.path }))
  const { path, mustCapture } = pick
  const turnName = seats[s.turn]?.name ?? ''
  const sc = pieceCounts(s.board)
  let status = seat == null ? `${turnName} 차례 (구경 중)` : `${turnName}님이 생각 중…`
  if (myTurn) {
    if (path.length > 1) status = '계속 뛰어넘어야 해요! 다음 칸을 고르세요'
    else if (mustCapture) status = '잡을 수 있는 말은 꼭 잡아야 해요!'
    else status = '내 차례 — 움직일 말을 고르세요'
  }
  if (!s.over && s.quiet >= DRAW_PLIES - 20) status += ` (무승부까지 ${DRAW_PLIES - s.quiet}수)`
  return (
    <>
      <SeatBar
        seats={seats}
        active={s.over ? [] : [s.turn]}
        you={seat}
        icons={[<Token key="0" p={0} />, <Token key="1" p={1} />]}
        extra={(i) => <strong> {sc[i]}</strong>}
      />
      <div className={`status checkers-status ${mustCapture && myTurn ? 'must' : ''}`}>{s.over ? '게임 끝!' : status}</div>
      {/* Player 1 sees the board from their own side. */}
      <CheckersBoard state={s} live={myTurn} flip={seat === 1} pick={pick} />
    </>
  )
}
