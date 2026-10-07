import { useEffect, useState } from 'react'
import { matchesOnFloor, scoreOf } from '../../games/minhwatu/logic'
import { Captured, HandCards, MinhwatuTable, OpponentRow } from '../../games/minhwatu/parts'
import '../../games/minhwatu/minhwatu.css'
import './minhwatu.css'
import type { MinhwatuAction, MinhwatuView } from '../games/minhwatu'
import { SeatBar } from './SeatBar'
import type { OnlineGameProps } from './types'

export default function OnlineMinhwatu({ view: m, seat, toAct, seats, act }: OnlineGameProps<MinhwatuView, MinhwatuAction>) {
  const g = m.g
  const nameOf = (i: number) => seats[i]?.name || `${i + 1}번`
  const fill = (text: string) => text.replace(/\{(\d)\}/g, (_, d) => nameOf(+d))
  const [selected, setSelected] = useState<number | null>(null)
  useEffect(() => setSelected(null), [g.turn, m.round])

  const playing = m.stage === 'play'
  const { phase, turn } = g
  const myTurn = playing && seat != null && toAct.includes(seat) && seat === turn
  const me = seat != null ? g.players[seat] : null
  const live = myTurn && phase.kind === 'play'
  const selMatches = selected != null && me?.hand.includes(selected) ? matchesOnFloor(g.floor, selected) : []
  const choosing = myTurn && (phase.kind === 'chooseHand' || phase.kind === 'chooseFlip') ? phase.options : []

  const onHand = (id: number) => {
    if (!live) return
    if (selected === id) {
      setSelected(null)
      act({ type: 'play', card: id })
    } else setSelected(id)
  }
  const onFloor = (id: number) => {
    if (choosing.includes(id)) act({ type: 'choose', card: id })
    else if (live && selected != null && selMatches.includes(id)) {
      setSelected(null)
      act(selMatches.length === 2 ? { type: 'play', card: selected, choice: id } : { type: 'play', card: selected })
    }
  }

  let status: string
  if (!playing) status = m.stage === 'matchOver' ? '매치 끝!' : `${m.round}판 끝!`
  else if (phase.kind === 'chooseHand' || phase.kind === 'chooseFlip') status = myTurn ? '같은 달 카드가 두 장! 가져올 카드를 고르세요' : `${nameOf(turn)}님 고르는 중…`
  else if (myTurn) status = selected != null ? (selMatches.length ? '한 번 더 누르거나 바닥 카드를 누르면 내요' : '짝이 없어요. 한 번 더 누르면 바닥에 내요') : '내 차례 — 낼 카드를 고르세요'
  else status = `${nameOf(turn)}님 차례${seat == null ? ' (구경 중)' : ''}`

  const opponents = g.players.map((p, i) => ({ p, i })).filter(({ i }) => i !== seat)
  const last = m.history[m.history.length - 1]
  const order = m.totals.map((t, i) => ({ t, i })).sort((a, b) => b.t - a.t)

  return (
    <div className="minhwatu">
      <SeatBar seats={seats} active={toAct} you={seat} extra={(i) => <b> {m.totals[i]}점</b>} />
      <div className="muted minhwatu-online-round">
        {m.round}/{m.rounds}판 · 누적 점수 (이름 옆)
      </div>
      <div className="minhwatu-opps">
        {opponents.map(({ p, i }) => (
          <OpponentRow key={i} name={nameOf(i)} isAI={!!seats[i]?.bot} hand={m.handCounts[i]} captured={p.captured} active={playing && i === turn} />
        ))}
      </div>

      <MinhwatuTable
        s={g}
        deckCount={m.deckCount}
        message={fill(g.message)}
        highlight={[...choosing, ...selMatches]}
        clickable={[...choosing, ...(live ? selMatches : [])]}
        onPick={onFloor}
      />

      <div className="status">{status}</div>

      {!playing && last && (
        <div className="card-panel minhwatu-online-end">
          <h3>{m.round}판 결과</h3>
          <ol className="ranking minhwatu-rank">
            {order.map(({ t, i }) => {
              const sc = scoreOf(g.players[i].captured)
              return (
                <li key={i}>
                  {seats[i]?.bot ? '🤖 ' : ''}
                  {nameOf(i)}
                  {i === seat && ' (나)'} — 이번 판 <strong>{last[i]}점</strong> · 누적 <strong>{t}점</strong>
                  <div className="muted minhwatu-rank-detail">
                    패 {sc.base}점{sc.yaks.map((y) => ` + ${y.name} ${y.bonus}`).join('')}
                  </div>
                </li>
              )
            })}
          </ol>
          {m.stage === 'roundOver' &&
            (seat != null && toAct.includes(seat) ? (
              <button className="btn primary big" onClick={() => act({ type: 'next' })}>
                다음 판
              </button>
            ) : (
              <p className="muted">{toAct.length ? `${toAct.map(nameOf).join(', ')}님을 기다리는 중…` : '곧 다음 판을 시작해요'}</p>
            ))}
        </div>
      )}

      {me && seat != null && (
        <>
          {playing && <HandCards title="내 손패" hand={me.hand} floor={g.floor} live={live} selected={selected} onHand={onHand} />}
          <Captured name="내가 먹은 패" captured={me.captured} />
        </>
      )}
    </div>
  )
}
