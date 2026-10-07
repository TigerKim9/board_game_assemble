import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useBestScore } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  aiAgreesStar,
  aiDelay,
  cardsLeft,
  maxLevel,
  newGame,
  nextLevel,
  play,
  topCard,
  throwStar,
  type TState,
} from './logic'
import './telepathy.css'

interface Game {
  players: PlayerConfig[]
  difficulty: Difficulty
}

const AVATARS = ['🦉', '🐙', '🦋', '🐢']

export default function Telepathy() {
  const [game, setGame] = useState<Game | null>(null)
  const [again, setAgain] = useState(0)
  if (!game) {
    return (
      <PlayerSetup
        gameId="telepathy"
        min={2}
        max={4}
        defaultCount={3}
        showDifficulty
        startLabel="함께 시작"
        extra={
          <p className="tp-setup-note muted">
            모두 한 팀이에요. 컴퓨터 팀원과 함께 해도 되고, 사람 여러 명이 한 화면에서 각자 버튼을 꾹 눌러 자기 카드를 몰래 확인하며 할 수도 있어요.
          </p>
        }
        onStart={(players, difficulty) => setGame({ players, difficulty })}
      />
    )
  }
  return <Table key={again} game={game} onAgain={() => setAgain((a) => a + 1)} onReset={() => setGame(null)} />
}

type Phase = 'ready' | 'live' | 'pause'

type Event =
  | { kind: 'mistake'; by: number; card: number; lower: { player: number; card: number }[] }
  | { kind: 'star'; thrown: { player: number; card: number }[] }
  | { kind: 'refuse'; by: number }
  | { kind: 'play'; by: number; card: number }

function Table({ game, onAgain, onReset }: { game: Game; onAgain: () => void; onReset: () => void }) {
  const { players, difficulty } = game
  const n = players.length
  const humans = players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0)
  const soloHuman = humans.length === 1 ? humans[0] : -1
  const [s, setS] = useState<TState>(() => newGame(n))
  const sRef = useRef(s)
  const [phase, setPhase] = useState<Phase>('ready')
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const [seq, setSeq] = useState(0)
  const [event, setEvent] = useState<Event | null>(null)
  const [hover, setHover] = useState<boolean[]>(() => players.map(() => false))
  const [peek, setPeek] = useState<number | null>(null)
  const { best, submit } = useBestScore(`telepathy-${n}`)
  const [newRecord, setNewRecord] = useState(false)
  const alive = useRef(true)
  const last = maxLevel(n)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const commit = (next: TState) => {
    sRef.current = next
    setS(next)
    setSeq((q) => q + 1)
  }

  const doPlay = (p: number) => {
    const cur = sRef.current
    if (phaseRef.current !== 'live' || cur.status !== 'playing' || !cur.hands[p].length) return
    const card = cur.hands[p][0]
    const r = play(cur, p)
    if (r.mistake) {
      setEvent({ kind: 'mistake', by: p, card, lower: r.mistake.lower })
      if (r.state.status === 'playing') setPhase('pause')
    } else setEvent({ kind: 'play', by: p, card })
    commit(r.state)
  }

  const proposeStar = () => {
    const cur = sRef.current
    if (phase !== 'live' || cur.status !== 'playing' || cur.stars <= 0) return
    const top = topCard(cur)
    const refuser = players.findIndex((p, i) => p.isAI && !aiAgreesStar(cur.hands[i][0], top))
    if (refuser >= 0) {
      setEvent({ kind: 'refuse', by: refuser })
      return
    }
    const r = throwStar(cur)
    setEvent({ kind: 'star', thrown: r.thrown })
    if (r.state.status === 'playing') setPhase('pause')
    commit(r.state)
  }

  // AI teammates: after every change, each one restarts its silent count.
  useEffect(() => {
    if (phase !== 'live' || s.status !== 'playing') return
    const timers: ReturnType<typeof setTimeout>[] = []
    const top = topCard(s)
    players.forEach((p, i) => {
      if (!p.isAI || !s.hands[i].length) return
      const d = aiDelay(s.hands[i][0], top, difficulty)
      timers.push(setTimeout(() => alive.current && setHover((h) => h.map((v, j) => (j === i ? true : v))), Math.max(0, d - 650)))
      timers.push(setTimeout(() => alive.current && doPlay(i), d))
    })
    return () => {
      timers.forEach(clearTimeout)
      setHover(players.map(() => false))
    }
  }, [seq, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Short pause after a mistake or a star so everyone can see what happened.
  useEffect(() => {
    if (phase !== 'pause') return
    const id = setTimeout(() => alive.current && setPhase('live'), 2200)
    return () => clearTimeout(id)
  }, [phase])

  // All-AI table: start each level automatically.
  useEffect(() => {
    if (humans.length > 0) return
    if (phase === 'ready' && s.status === 'playing') {
      const id = setTimeout(() => setPhase('live'), 1500)
      return () => clearTimeout(id)
    }
    if (s.status === 'clear') {
      const id = setTimeout(() => goNext(), 1800)
      return () => clearTimeout(id)
    }
  }, [phase, s.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Record
  useEffect(() => {
    if (s.status !== 'won' && s.status !== 'lost') return
    const cleared = s.status === 'won' ? last : s.level - 1
    const isNew = cleared > 0 && (best == null || cleared > best)
    submit(cleared)
    setNewRecord(isNew)
  }, [s.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const goNext = () => {
    const next = nextLevel(sRef.current)
    sRef.current = next
    setS(next)
    setEvent(null)
    setPhase('ready')
  }

  if (s.status === 'won' || s.status === 'lost') {
    const cleared = s.status === 'won' ? last : s.level - 1
    return (
      <Result title={s.status === 'won' ? '🎉 마음이 통했어요! 전 레벨 클리어!' : `💔 레벨 ${s.level}에서 멈췄어요`} onAgain={onAgain}>
        <p>
          {cleared > 0 ? `레벨 ${cleared}까지 성공` : '아쉽게도 첫 레벨부터 어긋났어요'}
          {newRecord ? ' — 🌟 새로운 최고 기록!' : best != null ? ` · 최고 기록 레벨 ${best}` : ''}
        </p>
        {s.status === 'lost' && event?.kind === 'mistake' && <EventLine event={event} players={players} />}
        <button className="btn ghost" onClick={onReset}>
          팀 바꾸기
        </button>
      </Result>
    )
  }

  const top = topCard(s)
  const live = phase === 'live' && s.status === 'playing'
  const recent = s.pile.slice(-6, -1)

  return (
    <div className="tp">
      <div className="tp-hud">
        <span className="tp-level">
          레벨 <strong>{s.level}</strong>/{last}
        </span>
        <span className="tp-lives" aria-label={`생명 ${s.lives}`}>
          {'♥'.repeat(s.lives)}
        </span>
        <span className="tp-stars" aria-label={`표창 ${s.stars}`}>
          {'★'.repeat(s.stars)}
          {s.stars === 0 && <span className="muted">☆</span>}
        </span>
      </div>

      <ul className="tp-team">
        {players.map((p, i) =>
          i === soloHuman ? null : (
            <li key={i} className={`tp-mate ${hover[i] ? 'hover' : ''} ${p.isAI ? '' : 'human'}`}>
              <span className="tp-avatar">{p.isAI ? AVATARS[i % AVATARS.length] : '🙂'}</span>
              <span className="tp-mate-name">{p.name}</span>
              <span className="tp-backs">
                {s.hands[i].length === 0 ? (
                  <span className="tp-done">✓</span>
                ) : (
                  s.hands[i].map((_, k) => <i key={k} className="tp-back" />)
                )}
              </span>
              {hover[i] && <span className="tp-hand">🤚</span>}
            </li>
          ),
        )}
      </ul>

      <div className={`tp-table ${live ? 'live' : ''} ${event?.kind === 'mistake' && phase === 'pause' ? 'oops' : ''}`}>
        {live && (
          <svg key={seq} className="tp-ring" viewBox="0 0 120 120" aria-hidden>
            <circle cx="60" cy="60" r="54" />
          </svg>
        )}
        <div className="tp-pile">
          {recent.map((c, k) => (
            <span key={c} className="tp-ghost" style={{ transform: `rotate(${((c * 37) % 15) - 7}deg) translate(${(recent.length - k) * 2}px, ${(recent.length - k) * 2}px)` }} />
          ))}
          <span key={top} className={`tp-top ${top ? '' : 'empty'}`}>
            {top || '0'}
          </span>
        </div>
        <div className="tp-left">
          {recent.length > 0 && <span>… {recent.slice(-3).join(' · ')} · </span>}
          남은 카드 {cardsLeft(s)}장
        </div>
      </div>

      <div className="tp-event">{event ? <EventLine event={event} players={players} /> : <span className="muted">말하지 말고… 마음으로 맞춰요 🤫</span>}</div>

      {s.status === 'clear' && (
        <div className="card-panel tp-panel">
          <h3>✨ 레벨 {s.level} 클리어!</h3>
          {s.reward && <p className="tp-reward">보상: {s.reward === 'life' ? '♥ 생명 +1' : '★ 표창 +1'}</p>}
          {humans.length > 0 && (
            <button className="btn primary big" onClick={goNext}>
              레벨 {s.level + 1}로 (각자 {s.level + 1}장)
            </button>
          )}
        </div>
      )}

      {phase === 'ready' && s.status === 'playing' && (
        <div className="card-panel tp-panel">
          <h3>레벨 {s.level}</h3>
          <p className="muted">
            각자 카드 {s.level}장. 모두 숨을 고르고, 준비되면 시작하세요.
          </p>
          {humans.length > 0 && (
            <button className="btn primary big" onClick={() => setPhase('live')}>
              집중… 시작!
            </button>
          )}
        </div>
      )}

      {soloHuman >= 0 && s.status === 'playing' && (
        <div className="tp-me card-panel">
          <div className="tp-myhand">
            {s.hands[soloHuman].length === 0 ? (
              <span className="muted">내 카드를 모두 냈어요. 팀원을 믿어요! 🙏</span>
            ) : (
              s.hands[soloHuman].map((c, k) => (
                <button key={c} className={`tp-card ${k === 0 ? 'lowest' : ''}`} disabled={!live || k !== 0} onClick={() => doPlay(soloHuman)}>
                  {c}
                </button>
              ))
            )}
          </div>
          <div className="tp-actions">
            <button className="btn accent big" disabled={!live || !s.hands[soloHuman].length} onClick={() => doPlay(soloHuman)}>
              {s.hands[soloHuman].length ? `${s.hands[soloHuman][0]} 내기` : '대기 중'}
            </button>
            <button className="btn tp-star-btn" disabled={!live || s.stars <= 0} onClick={proposeStar} aria-label="표창 쓰기">
              ★
            </button>
          </div>
        </div>
      )}

      {humans.length > 1 && s.status === 'playing' && (
        <>
          <div className="tp-seats">
            {humans.map((h) => (
              <div key={h} className="tp-seat card-panel" style={{ ['--pc' as string]: `var(--p${h + 1})` }}>
                <div className="tp-seat-name">{players[h].name}</div>
                <button
                  className={`tp-peek ${peek === h ? 'open' : ''}`}
                  onPointerDown={() => setPeek(h)}
                  onPointerUp={() => setPeek(null)}
                  onPointerLeave={() => setPeek((v) => (v === h ? null : v))}
                  onPointerCancel={() => setPeek(null)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {peek === h ? s.hands[h].join(' · ') || '없음' : `👀 꾹 눌러 보기`}
                </button>
                <button className="btn accent tp-seat-play" disabled={!live || !s.hands[h].length} onClick={() => doPlay(h)}>
                  {s.hands[h].length ? '카드 내기' : '다 냈어요'}
                </button>
              </div>
            ))}
          </div>
          <button className="btn tp-star-wide" disabled={!live || s.stars <= 0} onClick={proposeStar}>
            ★ 표창 쓰기 (모두 가장 낮은 카드 버리기)
          </button>
        </>
      )}
    </div>
  )
}

function EventLine({ event, players }: { event: Event; players: PlayerConfig[] }) {
  const name = (i: number) => players[i].name
  if (event.kind === 'play')
    return (
      <span>
        {name(event.by)}: <strong>{event.card}</strong>
      </span>
    )
  if (event.kind === 'refuse') return <span>🙅 {name(event.by)}: 잠깐, 아직은 아니에요!</span>
  if (event.kind === 'star')
    return (
      <span className="tp-ev-star">
        ★ 표창! 버린 카드: {event.thrown.map((t) => `${t.card}(${name(t.player)})`).join(', ') || '없음'}
      </span>
    )
  return (
    <span className="tp-ev-bad">
      💥 {name(event.by)}의 {event.card}보다 작은 카드가 있었어요: {event.lower.map((l) => `${l.card}(${name(l.player)})`).join(', ')} · ♥ −1
    </span>
  )
}
