import { Mark, TttBoard } from '../../games/tictactoe/Board'
import { winner, type TttState } from '../../games/tictactoe/logic'
import '../../games/tictactoe/tictactoe.css'
import type { TictactoeAction } from '../games/tictactoe'
import { SeatBar } from './SeatBar'
import type { OnlineGameProps } from './types'

export default function OnlineTictactoe({ view: s, seat, toAct, seats, act }: OnlineGameProps<TttState, TictactoeAction>) {
  const myTurn = seat != null && toAct.includes(seat)
  const turnName = seats[s.turn]?.name ?? ''
  const w = winner(s)
  const status =
    w != null
      ? w >= 0
        ? `${seats[w]?.name ?? ''} 승리!`
        : '비겼어요!'
      : myTurn
        ? '내 차례 — 칸을 고르세요'
        : seat == null
          ? `${turnName} 차례 (구경 중)`
          : `${turnName}님이 생각 중…`
  return (
    <>
      <SeatBar seats={seats} active={s.over ? [] : [s.turn]} you={seat} icons={[<Mark key="o" p={0} />, <Mark key="x" p={1} />]} />
      <div className="status">{status}</div>
      <TttBoard state={s} live={myTurn} onPlay={(cell) => act({ cell })} />
    </>
  )
}
