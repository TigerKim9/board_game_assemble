import { DotsBar, DotsBoard } from '../../games/dots-boxes/Board'
import type { DbState } from '../../games/dots-boxes/logic'
import '../../games/dots-boxes/dots-boxes.css'
import '../../games/othello/duel.css'
import type { DotsBoxesAction } from '../games/dots-boxes'
import type { OnlineGameProps } from './types'

export default function OnlineDotsBoxes({ view: s, seat, toAct, seats, act }: OnlineGameProps<DbState, DotsBoxesAction>) {
  const myTurn = seat != null && toAct.includes(seat)
  const turnName = seats[s.turn]?.name ?? ''
  const again = s.lastBoxes.length > 0 && s.last != null && s.edges[s.last] === s.turn
  let status = myTurn ? '내 차례 — 선을 하나 그으세요' : seat == null ? `${turnName} 차례 (구경 중)` : `${turnName}님이 생각 중…`
  if (again) status = myTurn ? '상자 완성! 한 번 더 그어요' : `${turnName} 상자 완성! 한 번 더 그어요`
  return (
    <>
      <DotsBar
        players={seats.map((p) => ({ name: p.name, isAI: p.bot, away: p.connected === false }))}
        state={s}
        thinking={seats[s.turn]?.bot}
        you={seat}
      />
      <div className="status dots-boxes-status">{s.over ? '게임 끝!' : status}</div>
      <DotsBoard state={s} live={myTurn} onPlay={(edge) => act({ edge })} />
    </>
  )
}
