import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { PlayerConfig } from '../../lib/types'
import {
  FUSE_RANGES,
  TOPICS,
  firstHolder,
  nextHolder,
  randomFuse,
  tension,
  tickGap,
  topicPrompt,
  type FuseRange,
  type Topic,
} from './logic'
import { BombSound } from './sound'
import './bomb.css'

interface Settings {
  range: FuseRange
  topic: Topic
}

export default function Bomb() {
  const [players, setPlayers] = useState<PlayerConfig[] | null>(null)
  const [range, setRange] = useStored<FuseRange>('bomb:range', 'normal')
  const [topic, setTopic] = useStored<Topic>('bomb:topic', 'choseong')

  if (!players) {
    return (
      <PlayerSetup
        gameId="bomb"
        min={2}
        max={8}
        defaultCount={4}
        allowAI={false}
        onStart={(p) => setPlayers(p)}
        extra={
          <>
            <div className="setup-row">
              <span>폭탄 시간</span>
              <div className="segmented">
                {(Object.keys(FUSE_RANGES) as FuseRange[]).map((r) => (
                  <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>
                    {FUSE_RANGES[r].label}
                  </button>
                ))}
              </div>
            </div>
            <p className="bomb-setup-note muted">
              {FUSE_RANGES[range].min}~{FUSE_RANGES[range].max}초 사이 어딘가에서 터져요. 정확한 시간은 비밀!
            </p>
            <div className="bomb-setup-topic">
              <span>주제</span>
              <div className="segmented bomb-topics">
                {(Object.keys(TOPICS) as Topic[]).map((t) => (
                  <button key={t} className={topic === t ? 'active' : ''} onClick={() => setTopic(t)}>
                    {TOPICS[t]}
                  </button>
                ))}
              </div>
            </div>
          </>
        }
      />
    )
  }
  return <Game players={players} settings={{ range, topic }} onReset={() => setPlayers(null)} />
}

type Phase = 'ready' | 'playing' | 'boom' | 'over'

function Game({ players, settings, onReset }: { players: PlayerConfig[]; settings: Settings; onReset: () => void }) {
  const [muted, setMuted] = useStored('bomb:muted', false)
  const [phase, setPhase] = useState<Phase>('ready')
  const [holder, setHolder] = useState(() => firstHolder(players.length))
  const [prompt, setPrompt] = useState(() => topicPrompt(settings.topic))
  const [fuse, setFuse] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [passes, setPasses] = useState(0)
  const [losses, setLosses] = useState<number[]>(() => players.map(() => 0))
  const [beat, setBeat] = useState(0)
  const startAt = useRef(0)
  const sound = useRef<BombSound | null>(null)
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  useEffect(() => {
    sound.current = new BombSound()
    return () => sound.current?.close()
  }, [])

  // Burning: hidden fuse timer, visual clock and ticking.
  useEffect(() => {
    if (phase !== 'playing') return
    const timers: number[] = []
    let tickTimer = 0
    const boom = window.setTimeout(() => {
      setPhase('boom')
      if (!mutedRef.current) sound.current?.boom()
      try {
        navigator.vibrate?.([350, 80, 250])
      } catch {
        // ignore
      }
    }, Math.max(0, fuse - (performance.now() - startAt.current)))
    timers.push(boom)
    const clock = window.setInterval(() => setElapsed(performance.now() - startAt.current), 100)
    const tick = () => {
      const t = tension(performance.now() - startAt.current, settings.range)
      if (!mutedRef.current) sound.current?.tick(t > 0.7)
      setBeat((b) => b + 1)
      tickTimer = window.setTimeout(tick, tickGap(t))
    }
    tickTimer = window.setTimeout(tick, 300)
    return () => {
      timers.forEach((id) => window.clearTimeout(id))
      window.clearInterval(clock)
      window.clearTimeout(tickTimer)
    }
  }, [phase, fuse, settings.range])

  useEffect(() => {
    if (phase !== 'boom') return
    const id = window.setTimeout(() => {
      setLosses((l) => l.map((v, i) => (i === holder ? v + 1 : v)))
      setPhase('over')
    }, 1700)
    return () => window.clearTimeout(id)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const ignite = () => {
    sound.current?.unlock()
    startAt.current = performance.now()
    setFuse(randomFuse(settings.range))
    setElapsed(0)
    setPasses(0)
    setPhase('playing')
  }

  const pass = () => {
    if (phase !== 'playing') return
    setHolder((h) => nextHolder(h, players.length))
    setPasses((p) => p + 1)
  }

  const again = () => {
    // The loser starts the next round.
    setPrompt(topicPrompt(settings.topic))
    setPhase('ready')
    setElapsed(0)
  }

  const t = phase === 'playing' ? tension(elapsed, settings.range) : phase === 'ready' ? 0 : 1
  const next = players[nextHolder(holder, players.length)]

  if (phase === 'over') {
    const ranking = players.map((p, i) => ({ p, i, l: losses[i] })).sort((a, b) => b.l - a.l)
    return (
      <Result title={`💥 ${players[holder].name} 펑!`} onAgain={again} againLabel="한 판 더">
        <p className="muted">
          {passes}번 넘긴 끝에 {players[holder].name}님 손에서 터졌어요. 다음 판은 {players[holder].name}님부터!
        </p>
        <ol className="bomb-ranking">
          {ranking.map(({ p, i, l }) => (
            <li key={i}>
              {p.name} — 폭발 <strong>{l}회</strong>
            </li>
          ))}
        </ol>
        <button className="btn ghost" onClick={onReset}>
          인원·설정 바꾸기
        </button>
      </Result>
    )
  }

  return (
    <div
      className={`bomb-stage phase-${phase}`}
      style={{ ['--t' as string]: t.toFixed(3), ['--shake-speed' as string]: `${Math.round(420 - 330 * t)}ms` }}
    >
      <button className="bomb-mute icon-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? '소리 켜기' : '소리 끄기'}>
        {muted ? '🔇' : '🔊'}
      </button>

      {prompt && (
        <div className="bomb-topic">
          <small>{prompt.title}</small>
          <strong>{prompt.value}</strong>
        </div>
      )}

      <div className="bomb-holder">
        <small>{phase === 'ready' ? '처음 폭탄을 들 사람' : '지금 폭탄을 든 사람'}</small>
        <strong key={holder}>{players[holder].name}</strong>
      </div>

      <div className="bomb-art" key={phase === 'boom' ? 'boom' : 'bomb'}>
        {phase === 'boom' ? <div className="bomb-explosion">💥</div> : <BombSvg t={t} lit={phase === 'playing'} beat={beat} />}
      </div>

      {phase === 'ready' && (
        <>
          <p className="bomb-hint">시간은 비밀! 주제에 맞게 말하고 재빨리 다음 사람에게 넘기세요.</p>
          <button className="btn accent big bomb-main-btn" onClick={ignite}>
            🔥 불붙이기
          </button>
        </>
      )}
      {phase === 'playing' && (
        <button className="btn danger big bomb-main-btn bomb-pass" onClick={pass}>
          넘기기 ➜ <span className="bomb-next">{next.name}</span>
        </button>
      )}
      {phase === 'boom' && <p className="bomb-boom-text">펑!!!</p>}
      {phase === 'playing' && <p className="bomb-passes">넘긴 횟수 {passes}</p>}
    </div>
  )
}

/** Quadratic bezier helper for the fuse. */
function qPoint(u: number): [number, number] {
  const p0 = [58, 30]
  const p1 = [72, 2]
  const p2 = [96, 12]
  const x = (1 - u) * (1 - u) * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0]
  const y = (1 - u) * (1 - u) * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1]
  return [x, y]
}

function BombSvg({ t, lit, beat }: { t: number; lit: boolean; beat: number }) {
  const left = Math.max(0.08, 1 - t * 0.92)
  const [sx, sy] = qPoint(left)
  return (
    <svg viewBox="0 0 110 110" className="bomb-svg" aria-label="폭탄">
      <path d="M58 30 Q72 2 96 12" className="bomb-fuse-burnt" />
      <path d="M58 30 Q72 2 96 12" pathLength={100} strokeDasharray={`${left * 100} 200`} className="bomb-fuse" />
      <circle cx="46" cy="66" r="36" className="bomb-body" />
      <ellipse cx="34" cy="52" rx="10" ry="7" className="bomb-shine" transform="rotate(-35 34 52)" />
      <rect x="47" y="25" width="16" height="12" rx="3" transform="rotate(35 55 31)" className="bomb-cap" />
      {lit && (
        <g transform={`translate(${sx.toFixed(2)} ${sy.toFixed(2)})`}>
          <g className="bomb-spark" key={beat % 2}>
            <circle r="5" fill="#ffd54a" />
            <circle r="2.5" fill="#fff" />
            <path d="M0 -9 L0 9 M-9 0 L9 0 M-6 -6 L6 6 M-6 6 L6 -6" stroke="#ff9f1a" strokeWidth="1.6" />
          </g>
        </g>
      )}
    </svg>
  )
}
