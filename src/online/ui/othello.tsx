import { Disc, OthelloBoard } from '../../games/othello/Board'
import { counts, type OthelloState } from '../../games/othello/logic'
import '../../games/othello/othello.css'
import { useStored } from '../../lib/storage'
import type { OthelloAction } from '../games/othello'
import { SeatBar } from './SeatBar'
import type { OnlineGameProps } from './types'

export default function OnlineOthello({ view: s, seat, toAct, seats, act }: OnlineGameProps<OthelloState, OthelloAction>) {
  const [hints, setHints] = useStored('othello:hints', true)
  const myTurn = seat != null && toAct.includes(seat)
  const turnName = seats[s.turn]?.name ?? ''
  const sc = counts(s.board)
  let status = myTurn ? '내 차례 — 놓을 곳을 고르세요' : seat == null ? `${turnName} 차례 (구경 중)` : `${turnName}님이 생각 중…`
  if (s.passed != null && !s.over) {
    status = `${s.passed === 0 ? '흑' : '백'}은 둘 곳이 없어 쉬어요 — ${myTurn ? '내가' : turnName} 한 번 더!`
  }
  return (
    <>
      <SeatBar
        seats={seats}
        active={s.over ? [] : [s.turn]}
        you={seat}
        icons={[<Disc key="b" c={1} />, <Disc key="w" c={2} />]}
        extra={(i) => <strong> {sc[i]}</strong>}
      />
      <div className={`status othello-status ${s.passed != null && !s.over ? 'pass' : ''}`}>{s.over ? '게임 끝!' : status}</div>
      <OthelloBoard state={s} live={myTurn} hints={hints} onPlay={(cell) => act({ cell })} />
      {seat != null && (
        <div className="othello-duel-actions">
          <button className={`btn small ${hints ? '' : 'ghost'}`} onClick={() => setHints(!hints)}>
            💡 힌트 {hints ? '켬' : '끔'}
          </button>
        </div>
      )}
    </>
  )
}
