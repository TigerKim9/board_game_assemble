import { formatChips } from '../../games/poker-core'
import { boss } from '../../games/sevenpoker/logic'
import { BetButtons, ChoicePanel, MyCards, PotsDetail, SevenTable, headline, winningCards } from '../../games/sevenpoker/parts'
import { HOST_SEAT } from '../games/holdem'
import type { SevenAction, SevenView } from '../games/sevenpoker'
import { SeatBar } from './SeatBar'
import type { OnlineGameProps } from './types'
import './holdem.css'

export default function OnlineSevenPoker({ view, seat, toAct, seats, result, act }: OnlineGameProps<SevenView, SevenAction>) {
  const t = {
    ...view.t,
    players: view.t.players.map((p, i) => ({ ...p, name: seats[i]?.name || p.name, isAI: !!seats[i]?.bot })),
  }
  const { bet, phase } = t
  const turn = bet.turn
  const myTurn = seat != null && toAct.includes(seat)
  const showAll = phase === 'done' && !!t.outcome?.showdown
  const isLive = (i: number) => !bet.seats[i].out && !bet.seats[i].folded
  const canSee = (i: number) => i === seat || (showAll && isLive(i))
  const bossSeat = phase === 'betting' ? boss(t) : -1
  const name = (i: number) => t.players[i]?.name ?? ''

  const status = result
    ? '게임 끝!'
    : phase === 'done'
      ? headline(t)
      : phase === 'choice'
        ? myTurn
          ? '초이스: 1장 버리고 1장 공개'
          : `다른 사람들이 초이스하는 중… (${toAct.length}명 남음)`
        : turn < 0
          ? '…'
          : turn === seat
            ? '내 차례'
            : `${t.players[turn].isAI ? '🤖 ' : ''}${name(turn)} ${seat == null ? '차례 (구경 중)' : '고민 중…'}`

  return (
    <div className="sevenpoker">
      <SeatBar seats={seats} active={toAct} you={seat} extra={(i) => <small> · {formatChips(t.players[i].stack)}</small>} />
      <SevenTable t={t} canSee={canSee} bossSeat={bossSeat} status={status} />
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
      <PotsDetail t={t} />
      {seat != null && phase === 'choice' && myTurn ? (
        <ChoicePanel
          key={`${t.handNo}-${seat}`}
          cards={t.cards[seat].map((c) => c.card)}
          name={name(seat)}
          onDone={(discard, open) => act({ type: 'choose', discard, open })}
        />
      ) : (
        seat != null && !bet.seats[seat].out && <MyCards t={t} seat={seat} winCards={winningCards(t)} />
      )}
      {myTurn && phase === 'betting' && turn === seat && <BetButtons t={t} onBet={(name) => act({ type: 'bet', name })} />}
      {phase === 'done' && !result && (
        <div className="sevenpoker-after">
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
