import { ActionBar, HoldemInfo, HoldemTable, MyHand, OutcomeDetail, outcomeHeadline } from '../../games/holdem/parts'
import { formatChips } from '../../games/poker-core'
import { HOST_SEAT, type HoldemAction, type HoldemView } from '../games/holdem'
import { SeatBar } from './SeatBar'
import type { OnlineGameProps } from './types'
import './holdem.css'

export default function OnlineHoldem({ view, seat, toAct, seats, result, act }: OnlineGameProps<HoldemView, HoldemAction>) {
  // 이름·컴퓨터 여부는 방 정보에서
  const t = {
    ...view.t,
    players: view.t.players.map((p, i) => ({ ...p, name: seats[i]?.name || p.name, isAI: !!seats[i]?.bot })),
  }
  const { bet, phase } = t
  const turn = bet.turn
  const myTurn = seat != null && toAct.includes(seat)
  const showdown = phase === 'done' && !!t.outcome?.showdown
  const isLive = (i: number) => !bet.seats[i].out && !bet.seats[i].folded
  const canSee = (i: number) => i === seat || (showdown && isLive(i))
  const name = (i: number) => t.players[i]?.name ?? ''

  const status = result
    ? '게임 끝!'
    : phase === 'done'
      ? outcomeHeadline(t)
      : turn < 0
        ? '…'
        : turn === seat
          ? '내 차례'
          : `${t.players[turn].isAI ? '🤖 ' : ''}${name(turn)} ${seat == null ? '차례 (구경 중)' : '고민 중…'}`

  return (
    <div className="holdem">
      <SeatBar seats={seats} active={toAct} you={seat} extra={(i) => <small> · {formatChips(t.players[i].stack)}</small>} />
      <HoldemInfo t={t} />
      <HoldemTable t={t} viewer={seat} canSee={canSee} status={status} />
      {view.log.length > 0 && (
        <ul className="holdem-ol-log card-panel">
          {view.log.slice(-3).map((l, k) => (
            <li key={`${view.log.length}-${k}`}>
              {l.seat != null && <strong>{name(l.seat)}: </strong>}
              {l.text}
            </li>
          ))}
        </ul>
      )}
      {phase === 'done' && t.outcome && <OutcomeDetail t={t} />}
      {seat != null && !bet.seats[seat].out && <MyHand t={t} seat={seat} />}
      {seat != null && bet.seats[seat].out && phase !== 'done' && <p className="muted holdem-ol-wait">탈락했어요 — 남은 사람들의 게임을 지켜봐요</p>}
      {myTurn && phase === 'betting' && turn === seat && <ActionBar key={`${t.handNo}-${t.street}`} t={t} onAct={(a) => act({ type: 'bet', ...a } as HoldemAction)} />}
      {phase === 'done' && !result && (
        <div className="holdem-after">
          {myTurn && seat === HOST_SEAT ? (
            <>
              <button className="btn primary big" onClick={() => act({ type: 'next' })}>
                다음 판
              </button>
              <button className="btn ghost" onClick={() => act({ type: 'end' })}>
                게임 끝내기 (칩 순위로)
              </button>
            </>
          ) : (
            <p className="muted holdem-ol-wait">{name(HOST_SEAT)}님이 다음 판을 시작하길 기다리는 중…</p>
          )}
        </div>
      )}
    </div>
  )
}
