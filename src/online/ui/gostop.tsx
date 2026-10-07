import { useEffect, useMemo, useRef, useState } from 'react'
import { WON_PER_POINT, canBomb, canShake, clone, finishWin, matchesOnFloor, type GPlayer, type PlayAction } from '../../games/gostop-core/logic'
import { GoStopPanel, GostopTable, HandPanel, PlayerPanel, RoundBreakdown, won, type Toast } from '../../games/gostop-core/parts'
import '../../games/gostop-core/gostop.css'
import '../../games/gostop/gostop.css'
import '../../games/matgo/matgo.css'
import './gostop.css'
import type { GostopAction, GostopView } from '../games/gostop'
import { SeatBar } from './SeatBar'
import type { OnlineGameProps } from './types'

const pts = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}점`

/** 맞고·고스톱 온라인 화면 (같은 화면을 두 게임이 함께 씀) */
export default function OnlineGostop({ view: m, seat, toAct, seats, act }: OnlineGameProps<GostopView, GostopAction>) {
  const g = m.g
  const n = g.players.length
  const nameOf = (i: number) => seats[i]?.name || `${i + 1}번`
  const fill = (text: string) => text.replace(/\{(\d)\}/g, (_, d) => nameOf(+d))
  const [selected, setSelected] = useState<number | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // 사건 토스트
  useEffect(() => {
    if (!m.events.length) return
    const add = m.events.map((e) => ({ id: ++toastId.current, text: e.text, type: e.type, who: nameOf(e.player) }))
    setToasts((t) => [...t, ...add].slice(-4))
    const ids = add.map((a) => a.id)
    setTimeout(() => alive.current && setToasts((t) => t.filter((x) => !ids.includes(x.id))), 1900)
  }, [m.seq]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setSelected(null), [g.turn, m.round])

  const display: GPlayer[] = g.players.map((p, i) => ({ ...p, name: nameOf(i), isAI: !!seats[i]?.bot }))
  const playing = m.stage === 'play'
  const { phase, turn } = g
  const myTurn = playing && seat != null && toAct.includes(seat) && seat === turn
  const me = seat != null ? display[seat] : null
  const current = display[turn]

  const stopPreview = useMemo(() => {
    if (phase.kind !== 'goStop') return null
    const r = finishWin(clone(g), g.turn).result!
    return r.payments.reduce((a, p) => a + p.points, 0)
  }, [g, phase.kind])

  const canPlay = myTurn && phase.kind === 'play'
  const choosing = myTurn && (phase.kind === 'chooseHand' || phase.kind === 'chooseFlip') ? phase.options : []
  const pendingOptions = phase.kind === 'chooseHand' || phase.kind === 'chooseFlip' ? phase.options : []
  const selMatches = selected != null && me?.hand.includes(selected) ? matchesOnFloor(g, selected) : []

  const doPlay = (a: PlayAction) => {
    setSelected(null)
    act(a.type === 'dummy' ? { type: 'dummy' } : { type: 'play', card: a.card, shake: a.shake, bomb: a.bomb })
  }
  const onHand = (id: number) => {
    if (!canPlay) return
    if (selected === id && !canBomb(g, id) && !canShake(g, id)) doPlay({ type: 'card', card: id })
    else setSelected(id)
  }
  const onFloor = (id: number) => {
    if (choosing.includes(id)) act({ type: 'choose', card: id })
    else if (canPlay && selected != null && selMatches.includes(id)) doPlay({ type: 'card', card: selected })
  }

  let status: string
  const who = current.name
  if (m.stage === 'matchOver') status = '매치 끝!'
  else if (m.stage === 'roundOver') status = g.result?.kind === 'nagari' ? '나가리!' : `${nameOf(g.result!.winner!)} 승리!`
  else if (phase.kind === 'goStop') status = myTurn ? `${phase.score}점! 고 할까요, 스톱 할까요?` : `${who}님 고민 중… (${phase.score}점)`
  else if (phase.kind === 'chooseHand' || phase.kind === 'chooseFlip') status = myTurn ? '같은 달이 두 장! 가져올 카드를 누르세요' : `${who}님 고르는 중…`
  else if (myTurn)
    status = selected != null ? (selMatches.length ? '한 번 더 누르거나 빛나는 바닥 카드를 누르세요' : '짝이 없어요. 한 번 더 누르면 바닥에 내려놔요') : '내 차례 — 낼 카드를 고르세요'
  else status = `${who}님 차례${seat == null ? ' (구경 중)' : ''}`

  const opponents = display.map((p, i) => ({ p, i })).filter(({ i }) => i !== seat)
  const log = m.log.slice(-3).map(fill)

  return (
    <div className={`gostop gostop-${m.mode}`}>
      <SeatBar
        seats={seats}
        active={toAct}
        you={seat}
        extra={(i) => <b className={`gostop-online-total ${m.totals[i] > 0 ? 'plus' : m.totals[i] < 0 ? 'minus' : ''}`}> {pts(m.totals[i])}</b>}
      />
      <div className="gostop-online-round muted">
        {m.round}/{m.rounds}판 · 누적 점수 (점당 {WON_PER_POINT}원 가상 머니)
      </div>

      <div className="gostop-opps">
        {opponents.map(({ p, i }) => (
          <PlayerPanel key={i} p={p} active={playing && i === turn} threshold={g.cfg.threshold} compact defaultOpen={n === 2} handCount={m.handCounts[i]} />
        ))}
      </div>

      <GostopTable
        s={g}
        deckCount={m.deckCount}
        message={fill(g.message)}
        toasts={toasts}
        highlight={[...choosing, ...selMatches, ...(myTurn ? [] : pendingOptions)]}
        clickable={[...choosing, ...(canPlay ? selMatches : [])]}
        onPick={onFloor}
      />

      <div className="status gostop-status">{status}</div>
      {log.length > 0 && playing && (
        <ul className="gostop-online-log muted">
          {log.map((t, k) => (
            <li key={`${m.log.length}-${k}`}>{t}</li>
          ))}
        </ul>
      )}

      {myTurn && phase.kind === 'goStop' && (
        <GoStopPanel score={phase.score} goCount={g.players[turn].goCount} stopPreview={stopPreview} onDecide={(go) => act({ type: 'go', go })} />
      )}

      {!playing && g.result && (
        <div className="card-panel gostop-online-end">
          <h3>
            {m.round}판 결과 · {g.result.kind === 'nagari' ? '🤝 나가리' : `🏆 ${nameOf(g.result.winner!)}`}
          </h3>
          <RoundBreakdown r={g.result} mode={m.mode} names={display.map((p) => p.name)} />
          <ul className="gostop-wallet-list gostop-wallet-now">
            {display.map((p, i) => {
              const d = m.history[m.history.length - 1]?.delta[i] ?? 0
              return (
                <li key={i}>
                  <span>
                    {p.name}
                    {i === seat && ' (나)'}
                    {d !== 0 && <small className={d > 0 ? 'plus' : 'minus'}> {pts(d)}</small>}
                  </span>
                  <strong className={m.totals[i] >= 0 ? 'plus' : 'minus'}>
                    {pts(m.totals[i])} <small>({won(m.totals[i] * WON_PER_POINT)})</small>
                  </strong>
                </li>
              )
            })}
          </ul>
          {m.stage === 'roundOver' &&
            (seat != null && toAct.includes(seat) ? (
              <button className="btn primary big" onClick={() => act({ type: 'next' })}>
                {g.result.kind === 'nagari' ? `다음 판 (판돈 ×${g.result.nextMult})` : '다음 판'}
              </button>
            ) : (
              <p className="muted">
                {toAct.length ? `${toAct.map(nameOf).join(', ')}님을 기다리는 중…` : '곧 다음 판을 시작해요'}
              </p>
            ))}
        </div>
      )}

      {me && seat != null && (
        <>
          <PlayerPanel p={me} active={myTurn} threshold={g.cfg.threshold} mine />
          {playing && <HandPanel s={g} me={me} canPlay={canPlay} selected={selected} onHand={onHand} onPlay={doPlay} />}
        </>
      )}
    </div>
  )
}
