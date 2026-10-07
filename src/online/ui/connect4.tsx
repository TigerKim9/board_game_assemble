import { Chip, Connect4Board } from '../../games/connect4/Board'
import type { C4State } from '../../games/connect4/logic'
import '../../games/connect4/connect4.css'
import type { Connect4Action } from '../games/connect4'
import { SeatBar } from './SeatBar'
import type { OnlineGameProps } from './types'

export default function OnlineConnect4({ view: s, seat, toAct, seats, act }: OnlineGameProps<C4State, Connect4Action>) {
  const myTurn = seat != null && toAct.includes(seat)
  const turnName = seats[s.turn]?.name ?? ''
  const status = s.over
    ? '게임 끝!'
    : myTurn
      ? '내 차례 — 떨어뜨릴 줄을 누르세요'
      : seat == null
        ? `${turnName} 차례 (구경 중)`
        : `${turnName}님이 생각 중…`
  return (
    <>
      <SeatBar seats={seats} active={s.over ? [] : [s.turn]} you={seat} icons={[<Chip key="0" p={0} />, <Chip key="1" p={1} />]} />
      <div className="status">{status}</div>
      <Connect4Board state={s} live={myTurn} onDrop={(col) => act({ col })} />
    </>
  )
}
