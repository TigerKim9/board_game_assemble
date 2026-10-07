import { useState } from 'react'
import { END_SCORE, HAND_SIZE, sumHeads } from '../../games/cow-dodge/logic'
import { CowCard, CowRows } from '../../games/cow-dodge/parts'
import '../../games/cow-dodge/cow-dodge.css'
import type { CowAction, CowView } from '../games/cow-dodge'
import type { OnlineGameProps } from './types'

export default function OnlineCowDodge({ view: g, seat, toAct, seats, result, act }: OnlineGameProps<CowView, CowAction>) {
  const myTurn = seat != null && toAct.includes(seat)
  const names = seats.map((p) => p.name)
  const [selected, setSelected] = useState<number | null>(null)
  const turnKey = `${g.round}-${g.turn}`
  const [selFor, setSelFor] = useState(turnKey)
  if (selFor !== turnKey) {
    setSelFor(turnKey)
    setSelected(null)
  }
  const choosing = g.phase === 'choose' && myTurn
  const pickingRow = g.phase === 'pickRow' && myTurn
  const pending = g.phase === 'pickRow' ? g.reveal[g.placed] : null
  // Takes from the latest resolved turn (or the one in progress).
  const takes = g.takes
  const lastRound = g.lastRound && g.turn === 0 && g.reveal.length > 0 && g.phase === 'choose' ? g.lastRound : null
  const waiting = g.picked.flatMap((p, i) => (p ? [] : [i]))

  const statusText = (() => {
    if (result) return '게임 끝!'
    if (g.phase === 'pickRow' && pending) {
      if (pickingRow) return `내 ${pending.card}은(는) 너무 작아요! 가져갈 줄을 누르세요`
      return `${names[pending.player]}님이 가져갈 줄을 고르는 중… (${pending.card})`
    }
    if (choosing) return '낼 카드를 고르세요'
    if (seat != null && g.myPick != null) return `${g.myPick} 냄 — 다른 사람을 기다리는 중 (${waiting.length}명)`
    return `카드 고르는 중… (${waiting.length}명 남음)`
  })()

  return (
    <>
      <div className="cd-top">
        <span className="cd-round">
          {g.round}라운드 · {Math.min(g.turn + 1, HAND_SIZE)}/{HAND_SIZE}턴
        </span>
        <span className="muted cd-goal">🐮 {END_SCORE}마리 되면 끝{seat == null ? ' · 구경 중' : ''}</span>
      </div>
      <div className="cd-board felt">
        <div className="status cd-status">{statusText}</div>
        <CowRows rows={g.rows} pickable={pickingRow} hit={-1} onPick={(row) => act({ type: 'row', row })} />
        {g.reveal.length > 0 && (
          <div className="cd-reveal">
            {g.reveal.map((p, k) => (
              <div
                key={`${turnKey}-${p.player}`}
                className={`cd-reveal-item ${g.phase === 'pickRow' && k === g.placed ? 'now' : ''} ${g.phase === 'pickRow' && k < g.placed ? 'done' : ''}`}
              >
                <CowCard value={p.card} small flip />
                <span className="cd-reveal-name" style={{ color: `var(--p${(p.player % 6) + 1})` }}>
                  {names[p.player]}
                </span>
              </div>
            ))}
          </div>
        )}
        {takes.map((t, i) => (
          <div key={i} className="cd-take">
            {names[t.player]}님이 소 떼를 데려갔어요! −{sumHeads(t.cards)}
          </div>
        ))}
      </div>

      {lastRound && (
        <div className="card-panel cd-round-end">
          <h3>{lastRound.round}라운드 결과</h3>
          <ul>
            {seats.map((p, i) => (
              <li key={i}>
                <span>
                  {p.bot ? '🤖 ' : ''}
                  {p.name}
                </span>
                <span>+{lastRound.roundPen[i]}</span>
                <strong>🐮 {g.total[i]}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      {seat != null && g.hand.length > 0 && (
        <div className="cd-hand-wrap card-panel">
          <div className="cd-hand-title">
            내 패 (나만 보여요)
            {choosing && <span className="muted"> — 카드를 눌러 고르세요</span>}
          </div>
          <div className="cd-hand">
            {g.hand.map((c) => (
              <CowCard
                key={c}
                value={c}
                selected={selected === c || g.myPick === c}
                onClick={choosing ? () => setSelected(c) : undefined}
              />
            ))}
          </div>
          {choosing && (
            <button className="btn accent big" disabled={selected == null} onClick={() => selected != null && act({ type: 'card', card: selected })}>
              {selected == null ? '카드를 고르세요' : `${selected} 내기`}
            </button>
          )}
        </div>
      )}

      <ul className="cd-scores">
        {seats.map((p, i) => (
          <li key={i} style={{ ['--pc' as string]: `var(--p${(i % 6) + 1})` }} className={takes.some((t) => t.player === i) ? 'ouch' : ''}>
            <span className="cd-sname">
              {p.bot ? '🤖 ' : ''}
              {p.name}
              {i === seat ? ' (나)' : ''}
              {p.connected === false ? ' 📴' : ''}
            </span>
            <span className="cd-spick">{g.phase === 'choose' && !result ? (g.picked[i] ? '✅' : '🤔') : ''}</span>
            <strong>🐮 {g.total[i]}</strong>
            <span className="cd-bar">
              <i style={{ width: `${Math.min(100, (g.total[i] / END_SCORE) * 100)}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
