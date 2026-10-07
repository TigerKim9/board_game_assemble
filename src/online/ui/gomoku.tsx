import { GomokuBoard } from '../../games/gomoku/Board'
import type { GomokuState } from '../../games/gomoku/logic'
import '../../games/gomoku/gomoku.css'
import type { GomokuAction } from '../games/gomoku'
import { SeatBar } from './SeatBar'
import type { OnlineGameProps } from './types'

export default function OnlineGomoku({ view: s, seat, toAct, seats, act }: OnlineGameProps<GomokuState, GomokuAction>) {
  const myTurn = seat != null && toAct.includes(seat)
  const turnName = seats[s.turn]?.name ?? ''
  return (
    <>
      <SeatBar seats={seats} active={s.over ? [] : [s.turn]} you={seat} icons={['⚫', '⚪']} />
      <GomokuBoard
        state={s}
        live={myTurn}
        onPlay={(cell) => act({ cell })}
        idleText="내 차례 — 놓을 곳을 누르세요"
        status={seat == null ? `${turnName} 차례 (구경 중)` : `${turnName}님이 생각 중…`}
      />
    </>
  )
}
