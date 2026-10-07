import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  COLLISION_MS,
  aiDelay,
  aiStillCalls,
  call,
  canCall,
  newRound,
  nextNumber,
  rankPenalties,
  remaining,
  tick,
  type NState,
} from './logic'
import './nunchi.css'

const FACES = ['🐻', '🐰', '🐯', '🐨', '🐷', '🐵', '🐹', '🐼', '🦊', '🐸']
const ROUND_OPTIONS = [3, 5, 7]

interface Game {
  players: PlayerConfig[]
  difficulty: Difficulty
  rounds: number
}

export default function Nunchi() {
  const [game, setGame] = useState<Game | null>(null)
  const [rounds, setRounds] = useStored('nunchi:rounds', 5)
  const [again, setAgain] = useState(0)
  if (!game) {
    return (
      <PlayerSetup
        gameId="nunchi"
        min={3}
        max={10}
        defaultCount={6}
        showDifficulty
        extra={
          <div className="setup-row">
            <span>판 수</span>
            <div className="segmented">
              {ROUND_OPTIONS.map((r) => (
                <button key={r} className={rounds === r ? 'active' : ''} onClick={() => setRounds(r)}>
                  {r}판
                </button>
              ))}
            </div>
          </div>
        }
        onStart={(players, difficulty) => setGame({ players, difficulty, rounds })}
      />
    )
  }
  return <Arena key={again} game={game} onAgain={() => setAgain((a) => a + 1)} onReset={() => setGame(null)} />
}

type Phase = 'ready' | 'countdown' | 'play' | 'roundEnd' | 'over'

function Arena({ game, onAgain, onReset }: { game: Game; onAgain: () => void; onReset: () => void }) {
  const { players, difficulty, rounds } = game
  const n = players.length
  const humans = players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0)
  const [phase, setPhase] = useState<Phase>('ready')
  const [round, setRound] = useState(1)
  const [pen, setPen] = useState<number[]>(() => players.map(() => 0))
  const [ns, setNs] = useState<NState>(() => newRound(n))
  const [count, setCount] = useState(3)
  const [shout, setShout] = useState<(number | null)[]>(() => players.map(() => null))
  const nsRef = useRef(ns)
  const shoutRef = useRef(shout)
  const plan = useRef<number[]>(players.map(() => Infinity))
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const commit = (s: NState) => {
    nsRef.current = s
    setNs(s)
  }

  const reschedule = (now: number, s: NState) => {
    const left = remaining(s).length
    plan.current = players.map((p, i) => (p.isAI && canCall(s, i) ? now + aiDelay(left, n, difficulty) : Infinity))
  }

  const doCall = (s: NState, p: number, now: number): NState => {
    const next = call(s, p, now)
    if (next === s) return s
    const num = next.called.length + (next.window ? 1 : 0)
    shoutRef.current = shoutRef.current.map((v, i) => (i === p ? num : v))
    setShout(shoutRef.current)
    return next
  }

  const finishRound = (s: NState) => {
    const losers = s.losers ?? []
    setPen((prev) => prev.map((v, i) => (losers.includes(i) ? v + 1 : v)))
    setPhase('roundEnd')
  }

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    if (count <= 0) {
      const id = setTimeout(() => {
        if (!alive.current) return
        reschedule(performance.now(), nsRef.current)
        setPhase('play')
      }, 500)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => setCount((c) => c - 1), 650)
    return () => clearTimeout(id)
  }, [phase, count]) // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time loop
  useEffect(() => {
    if (phase !== 'play') return
    const id = setInterval(() => {
      const now = performance.now()
      const before = nsRef.current
      let s = tick(before, now)
      const settledBefore = s.called.length
      if (!s.losers) {
        players.forEach((p, i) => {
          if (!p.isAI || s.losers || !canCall(s, i) || now < plan.current[i]) return
          if (aiStillCalls(s, now, difficulty)) {
            s = doCall(s, i, now)
          } else {
            // Heard someone else — wait for that call to land, then think again.
            plan.current[i] = now + COLLISION_MS + 150 + Math.random() * 900
          }
        })
      }
      if (s.called.length !== before.called.length || s.called.length !== settledBefore) reschedule(now, s)
      if (s !== before) commit(s)
      if (s.losers) {
        clearInterval(id)
        finishRound(s)
      }
    }, 40)
    return () => clearInterval(id)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const humanCall = (p: number) => {
    if (phase !== 'play') return
    const now = performance.now()
    const before = nsRef.current
    const s = doCall(tick(before, now), p, now)
    if (s.called.length !== before.called.length) reschedule(now, s)
    commit(s)
    if (s.losers) finishRound(s)
  }

  const startRound = (r: number) => {
    shoutRef.current = players.map(() => null)
    setShout(shoutRef.current)
    commit(newRound(n))
    setRound(r)
    setCount(3)
    setPhase('countdown')
  }

  const losers = ns.losers ?? []
  const nextNum = nextNumber(ns)
  const inAir = ns.window ? ns.called.length + 1 : null

  if (phase === 'over') {
    const rank = rankPenalties(pen)
    const winners = rank.filter((r) => r.place === 1)
    const humanWon = winners.some((w) => !players[w.player].isAI)
    return (
      <Result
        title={
          winners.length === n
            ? '🤝 모두 무승부!'
            : `${humanWon ? '🎉' : '🏆'} ${winners.map((w) => players[w.player].name).join(', ')} 눈치왕!`
        }
        onAgain={onAgain}
      >
        <p className="muted">{rounds}판 동안 걸린 횟수가 적을수록 좋아요</p>
        <ol className="nunchi-ranking">
          {rank.map((r) => (
            <li key={r.player}>
              {FACES[r.player % FACES.length]} {players[r.player].name} — <strong>{r.pen}번</strong> 걸림
            </li>
          ))}
        </ol>
        <button className="btn ghost" onClick={onReset}>
          인원 바꾸기
        </button>
      </Result>
    )
  }

  const statusText = (() => {
    if (phase === 'ready') return `${round}판 / ${rounds}판`
    if (phase === 'countdown') return count > 0 ? `${count}…` : '시작!'
    if (phase === 'play') return inAir ? `"${inAir}!"` : `다음은 ${nextNum}!`
    if (ns.reason === 'collision') return `💥 동시에 외쳤어요!`
    return `😱 마지막까지 못 외쳤어요!`
  })()

  return (
    <div className="nunchi">
      <div className="nunchi-top">
        <span>
          {round}/{rounds}판
        </span>
        <span className="muted">1부터 {n - 1}까지 · 겹치거나 꼴찌면 걸려요</span>
      </div>
      <div className={`nunchi-stage felt ${phase === 'roundEnd' ? 'ended' : ''}`}>
        <div className={`nunchi-big ${phase === 'countdown' ? 'count' : ''}`} key={statusText}>
          {statusText}
        </div>
        <ul className="nunchi-people" style={{ ['--cols' as string]: n <= 4 ? n : n <= 6 ? 3 : n <= 8 ? 4 : 5 }}>
          {players.map((p, i) => {
            const lost = losers.includes(i)
            const order = ns.called.indexOf(i)
            const pending = ns.window?.players.includes(i)
            const num = order >= 0 ? order + 1 : shout[i]
            return (
              <li key={i} className={`nunchi-person ${lost ? 'lost' : ''} ${order >= 0 ? 'safe' : ''} ${pending ? 'pending' : ''}`}>
                {num != null && <span className="nunchi-bubble">{num}!</span>}
                <span className="nunchi-face">{lost ? '😱' : order >= 0 ? '😎' : FACES[i % FACES.length]}</span>
                <span className="nunchi-name">
                  {p.isAI ? '' : '🙋 '}
                  {p.name}
                </span>
                <span className="nunchi-pen">{'❌'.repeat(Math.min(pen[i], 5))}{pen[i] > 5 ? `+${pen[i] - 5}` : ''}</span>
              </li>
            )
          })}
        </ul>
      </div>

      {phase === 'ready' && (
        <div className="card-panel nunchi-intro">
          <p>
            숫자를 <strong>1부터 차례로</strong> 외쳐요. 다른 사람과 <strong>동시에</strong> 외치거나, <strong>끝까지</strong> 못 외치면 걸려요!
          </p>
          <button className="btn primary big" onClick={() => startRound(1)}>
            시작!
          </button>
        </div>
      )}

      {phase === 'roundEnd' && (
        <div className="card-panel nunchi-intro">
          <p>
            이번 판 걸린 사람: <strong>{losers.map((l) => players[l].name).join(', ') || '없음'}</strong>
          </p>
          {round >= rounds ? (
            <button className="btn primary big" onClick={() => setPhase('over')}>
              최종 결과 보기
            </button>
          ) : (
            <button className="btn primary big" onClick={() => startRound(round + 1)}>
              다음 판 ({round + 1}/{rounds})
            </button>
          )}
        </div>
      )}

      {(phase === 'countdown' || phase === 'play') && humans.length > 0 && (
        <div className={`nunchi-buttons ${humans.length > 1 ? 'multi' : ''}`}>
          {humans.map((h) => {
            const done = !canCall(ns, h)
            return (
              <button
                key={h}
                className={`nunchi-call ${done ? 'done' : ''}`}
                style={{ ['--pc' as string]: `var(--p${(h % 6) + 1})` }}
                disabled={phase !== 'play' || done}
                onPointerDown={(e) => {
                  e.preventDefault()
                  humanCall(h)
                }}
                onClick={(e) => {
                  if (e.detail === 0) humanCall(h) // keyboard
                }}
              >
                <span className="nunchi-call-num">{done ? (shout[h] != null ? `${shout[h]}!` : '✓') : `${nextNum}!`}</span>
                {humans.length > 1 && <span className="nunchi-call-name">{players[h].name}</span>}
              </button>
            )
          })}
        </div>
      )}
      {(phase === 'countdown' || phase === 'play') && humans.length === 1 && (
        <p className="nunchi-tip muted">버튼을 누르면 다음 숫자를 외쳐요. 눈치껏!</p>
      )}
    </div>
  )
}
