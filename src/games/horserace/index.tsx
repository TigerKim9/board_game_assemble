import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { PlayerConfig } from '../../lib/types'
import {
  MAX_HORSES,
  MIN_BET,
  MIN_HORSES,
  START_POINTS,
  betOptions,
  leaderAt,
  makeField,
  payout,
  positionAt,
  simulateRace,
  type Horse,
  type Race,
} from './logic'
import './horserace.css'

const TICK_MS = 105
type Mode = 'solo' | 'group'

interface Session {
  mode: Mode
  horses: number
  players: PlayerConfig[]
}

export default function HorseRace() {
  const [session, setSession] = useState<Session | null>(null)
  const [mode, setMode] = useStored<Mode>('horserace:mode', 'solo')
  const [horses, setHorses] = useStored('horserace:horses', 6)
  const n = Math.min(MAX_HORSES, Math.max(MIN_HORSES, horses))

  if (session) return <Track session={session} onReset={() => setSession(null)} />

  return (
    <>
      <div className="setup card-panel">
        <div className="setup-row">
          <span>방식</span>
          <div className="segmented">
            <button className={mode === 'solo' ? 'active' : ''} onClick={() => setMode('solo')}>
              혼자 베팅
            </button>
            <button className={mode === 'group' ? 'active' : ''} onClick={() => setMode('group')}>
              여럿이 응원
            </button>
          </div>
        </div>
        <div className="setup-row">
          <span>말 수</span>
          <div className="stepper">
            <button className="btn small" disabled={n <= MIN_HORSES} onClick={() => setHorses(n - 1)}>
              −
            </button>
            <strong>{n}마리</strong>
            <button className="btn small" disabled={n >= MAX_HORSES} onClick={() => setHorses(n + 1)}>
              +
            </button>
          </div>
        </div>
        <p className="muted horse-setup-note">
          {mode === 'solo'
            ? '가상 포인트로 우승마를 맞혀 보세요. 포인트는 저장돼요. (실제 돈은 쓰지 않아요)'
            : '각자 응원할 말을 고르고, 우승한 말을 고른 사람이 1점을 얻어요.'}
        </p>
        {mode === 'solo' && (
          <button className="btn primary big" onClick={() => setSession({ mode, horses: n, players: [] })}>
            경마장 입장
          </button>
        )}
      </div>
      {mode === 'group' && (
        <PlayerSetup
          gameId="horserace"
          min={2}
          max={8}
          defaultCount={3}
          allowAI={false}
          startLabel="말 고르러 가기"
          onStart={(p) => setSession({ mode, horses: n, players: p })}
        />
      )}
    </>
  )
}

type Phase = 'bet' | 'race' | 'done'

function Track({ session, onReset }: { session: Session; onReset: () => void }) {
  const { mode, players } = session
  const [points, setPoints] = useStored('horserace:points', START_POINTS)
  const [field, setField] = useState<Horse[]>(() => makeField(session.horses))
  const [phase, setPhase] = useState<Phase>('bet')
  const [race, setRace] = useState<Race | null>(null)
  const [tick, setTick] = useState(0)
  // solo
  const [pick, setPick] = useState<number | null>(null)
  const [bet, setBet] = useState(MIN_BET)
  const [lastWin, setLastWin] = useState<number | null>(null)
  const [wager, setWager] = useState(0)
  // group
  const [picks, setPicks] = useState<(number | null)[]>(() => players.map(() => null))
  const [scores, setScores] = useState<number[]>(() => players.map(() => 0))
  const raf = useRef(0)

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const options = betOptions(points)
  const stake = Math.min(bet, points)
  const ready = mode === 'solo' ? pick != null && points >= MIN_BET : picks.every((p) => p != null)

  const start = () => {
    if (!ready) return
    const r = simulateRace(field)
    if (mode === 'solo') {
      setPoints((p) => p - stake)
      setWager(stake)
    }
    setRace(r)
    setTick(0)
    setPhase('race')
    const t0 = performance.now()
    const last = r.frames.length - 1
    const step = () => {
      const tk = (performance.now() - t0) / TICK_MS
      setTick(tk)
      if (tk < last) raf.current = requestAnimationFrame(step)
      else finish(r)
    }
    raf.current = requestAnimationFrame(step)
  }

  const finish = (r: Race) => {
    const winner = r.order[0]
    if (mode === 'solo') {
      const won = pick === winner ? payout(stake, field[winner].odds) : 0
      setLastWin(won)
      if (won) setPoints((p) => p + won)
    } else {
      setScores((s) => s.map((v, i) => (picks[i] === winner ? v + 1 : v)))
    }
    setPhase('done')
  }

  const nextRace = () => {
    setField(makeField(session.horses))
    setRace(null)
    setTick(0)
    setPick(null)
    setLastWin(null)
    setPicks(players.map(() => null))
    setPhase('bet')
  }

  const placeOf = (id: number) => (race ? race.order.indexOf(id) + 1 : 0)
  const finishedBy = (id: number) => race != null && tick >= race.finish[id]
  const leader = race && phase === 'race' ? field[leaderAt(race, tick)] : null

  return (
    <>
      {mode === 'solo' && (
        <div className="horse-wallet">
          <span>
            💰 <strong>{points.toLocaleString()}</strong> 포인트
          </span>
          {phase === 'bet' && points < MIN_BET && (
            <button className="btn small primary" onClick={() => setPoints(START_POINTS)}>
              응원 포인트 {START_POINTS} 다시 받기
            </button>
          )}
        </div>
      )}

      <div className="horse-track">
        <div className="horse-commentary">
          {phase === 'bet' && '🏁 출발 대기 중'}
          {phase === 'race' && leader && (
            <>
              선두! <span style={{ color: leader.color }}>{leader.id + 1}번 {leader.name}</span>
            </>
          )}
          {phase === 'done' && race && `🏆 우승: ${race.order[0] + 1}번 ${field[race.order[0]].name}`}
        </div>
        {field.map((h) => {
          const p = race ? positionAt(race, h.id, tick) : 0
          const place = finishedBy(h.id) ? placeOf(h.id) : 0
          const chosen = mode === 'solo' ? pick === h.id : picks.includes(h.id)
          const sprint = race != null && phase === 'race' && race.bursts.some((b) => b.horse === h.id && tick >= b.tick && tick < b.tick + 7)
          return (
            <div key={h.id} className={`horse-lane ${chosen ? 'chosen' : ''}`}>
              <span className="horse-gate" style={{ background: h.color }}>
                {h.id + 1}
              </span>
              <div className="horse-run">
                <span
                  className={`horse-runner ${phase === 'race' && !place ? 'running' : ''} ${sprint ? 'sprint' : ''}`}
                  style={{ left: `calc(${p / 100} * (100% - 34px))` }}
                >
                  <span className="horse-emoji">🐎</span>
                  <span className="horse-cloth" style={{ background: h.color }} />
                  {sprint && <span className="horse-dust">💨</span>}
                </span>
              </div>
              <span className="horse-place">{place ? (place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : `${place}`) : ''}</span>
            </div>
          )
        })}
      </div>

      {phase === 'bet' && mode === 'solo' && (
        <div className="card-panel horse-bet">
          <h3>어느 말이 1등할까요?</h3>
          <div className="horse-pick-grid">
            {field.map((h) => (
              <button
                key={h.id}
                className={`horse-pick ${pick === h.id ? 'active' : ''}`}
                style={{ ['--c' as string]: h.color }}
                onClick={() => setPick(h.id)}
              >
                <span className="horse-pick-no">{h.id + 1}</span>
                <span className="horse-pick-name">{h.name}</span>
                <span className="horse-pick-meta">
                  {'★'.repeat(h.strength)}
                  <span className="muted">{'★'.repeat(5 - h.strength)}</span>
                </span>
                <span className="horse-odds">×{h.odds.toFixed(1)}</span>
              </button>
            ))}
          </div>
          {options.length > 0 && (
            <div className="horse-bets">
              <span>베팅</span>
              <div className="segmented horse-bet-seg">
                {options.map((v) => (
                  <button key={v} className={stake === v ? 'active' : ''} onClick={() => setBet(v)}>
                    {v === points && !([100, 300, 500, 1000] as number[]).includes(v) ? `올인 ${v}` : v}
                  </button>
                ))}
              </div>
            </div>
          )}
          {pick != null && points >= MIN_BET && (
            <p className="muted horse-expect">
              {pick + 1}번 {field[pick].name}에 {stake} 걸면 우승 시 {payout(stake, field[pick].odds)} 포인트!
            </p>
          )}
          <button className="btn accent big" disabled={!ready} onClick={start}>
            {pick == null ? '말을 골라 주세요' : '출발! 🏁'}
          </button>
        </div>
      )}

      {phase === 'bet' && mode === 'group' && (
        <div className="card-panel horse-bet">
          <h3>각자 응원할 말을 골라요</h3>
          <ul className="horse-group-picks">
            {players.map((pl, i) => (
              <li key={i}>
                <span className="horse-player">{pl.name}</span>
                <div className="horse-mini-picks">
                  {field.map((h) => (
                    <button
                      key={h.id}
                      className={picks[i] === h.id ? 'active' : ''}
                      style={{ ['--c' as string]: h.color }}
                      onClick={() => setPicks((ps) => ps.map((v, j) => (j === i ? h.id : v)))}
                      aria-label={`${h.id + 1}번 ${h.name}`}
                    >
                      {h.id + 1}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <button className="btn accent big" disabled={!ready} onClick={start}>
            {ready ? '출발! 🏁' : '모두 말을 골라 주세요'}
          </button>
        </div>
      )}

      {phase === 'done' && race && (
        <Result
          title={
            mode === 'solo'
              ? lastWin
                ? `🎉 적중! +${lastWin.toLocaleString()}`
                : `😢 아쉬워요… -${wager.toLocaleString()}`
              : (() => {
                  const winners = players.filter((_, i) => picks[i] === race.order[0])
                  return winners.length ? `🎉 ${winners.map((w) => w.name).join(', ')} 적중!` : '😮 아무도 못 맞혔어요!'
                })()
          }
          onAgain={nextRace}
          againLabel="다음 경주"
        >
          <ol className="horse-ranking">
            {race.order.map((id) => (
              <li key={id}>
                <span className="horse-gate small" style={{ background: field[id].color }}>
                  {id + 1}
                </span>
                {field[id].name}
                {mode === 'group' && (
                  <small className="muted">
                    {' '}
                    {players
                      .filter((_, i) => picks[i] === id)
                      .map((p) => p.name)
                      .join(', ')}
                  </small>
                )}
              </li>
            ))}
          </ol>
          {mode === 'group' && (
            <p className="horse-scores">
              {players.map((p, i) => (
                <span key={i} className="tag">
                  {p.name} {scores[i]}점
                </span>
              ))}
            </p>
          )}
          <button className="btn ghost" onClick={onReset}>
            설정으로
          </button>
        </Result>
      )}
    </>
  )
}
