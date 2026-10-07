import { BetButtons, SeotdaHand, SeotdaTable, SeotdaTools, showdownText } from '../../games/seotda/parts'
import '../../games/seotda/seotda.css'
import './seotda.css'
import type { SeotdaAction, SeotdaView } from '../games/seotda'
import { SeatBar } from './SeatBar'
import type { OnlineGameProps } from './types'

export default function OnlineSeotda({ view: m, seat, toAct, seats, act }: OnlineGameProps<SeotdaView, SeotdaAction>) {
  const t = m.t
  const nameOf = (i: number) => seats[i]?.name || `${i + 1}번`
  const fill = (text: string) => text.replace(/\{(\d)\}/g, (_, d) => nameOf(+d))
  const names = t.players.map((_, i) => `${seats[i]?.bot ? '🤖 ' : ''}${nameOf(i)}${i === seat ? ' (나)' : ''}`)
  const plain = t.players.map((_, i) => nameOf(i))
  const betting = m.stage === 'bet'
  const myTurn = betting && seat != null && toAct.includes(seat)
  const me = seat != null ? t.players[seat] : null

  const status = !betting
    ? showdownText(t, plain)
    : myTurn
      ? `내 차례 · ${t.phase === 'bet1' ? '첫 장' : '두 장'} 베팅`
      : `${nameOf(t.turn)}님 차례 · ${t.phase === 'bet1' ? '첫 장' : '두 장'} 베팅${seat == null ? ' (구경 중)' : ''}`

  return (
    <div className="seotda">
      <SeatBar seats={seats} active={toAct} you={seat} extra={(i) => <b> 💰{t.players[i]?.chips}</b>} />
      <div className="muted seotda-online-round">
        {Math.min(m.handsDone + (betting ? 1 : 0), m.maxHands)}/{m.maxHands}판 · 모두 1000칩으로 시작 (가상 칩)
      </div>
      <SeotdaTable
        table={t}
        names={names}
        canSee={(i) => t.players[i].cards.every((c) => c >= 0)}
        showHands={!betting}
        winnings={m.winnings}
        thinking={(i) => i !== seat}
        status={status}
      />

      {me && me.inHand && me.cards.length > 0 && me.cards[0] >= 0 && <SeotdaHand cards={me.cards} name={nameOf(seat!)} folded={me.folded} />}
      {me && !me.inHand && betting && <p className="muted center">칩이 모자라 이번 판은 쉬어요.</p>}

      {myTurn && <BetButtons table={t} seat={seat!} onAct={(a) => act({ type: 'bet', action: a })} />}

      {m.stage === 'handOver' &&
        (seat != null && toAct.includes(seat) ? (
          <button className="btn primary big" onClick={() => act({ type: 'next' })}>
            {t.result?.kind === 'redeal' ? '🔄 재경기' : '다음 판'}
          </button>
        ) : (
          <p className="muted center">{toAct.length ? `${toAct.map(nameOf).join(', ')}님을 기다리는 중…` : '곧 다음 판을 시작해요'}</p>
        ))}

      {m.log.length > 0 && (
        <ul className="muted seotda-online-log">
          {m.log.slice(-4).map((x, k) => (
            <li key={`${m.log.length}-${k}`}>{fill(x)}</li>
          ))}
        </ul>
      )}

      <SeotdaTools />
    </div>
  )
}
