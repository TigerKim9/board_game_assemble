import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useBestScore, useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  AI_FOUL,
  COLOR_WORDS,
  SOLO_TRIES,
  aiReaction,
  average,
  cardDuration,
  colorRun,
  colorScore,
  decoysBeforeMatch,
  isMatch,
  makeCard,
  matchWinner,
  randomDelay,
  rating,
  type Card,
  type ColorRunResult,
  type Mode,
} from './logic'
import './reaction.css'

interface Config {
  players: PlayerConfig[]
  difficulty: Difficulty
  mode: Mode
  target: number
}

const KEYS = ['KeyA', 'KeyL', 'KeyQ', 'KeyP']
const KEY_LABELS = ['A', 'L', 'Q', 'P']
const PCOLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)']

export default function Reaction() {
  const [config, setConfig] = useState<Config | null>(null)
  const [round, setRound] = useState(0)
  const [mode, setMode] = useStored<Mode>('reaction:mode', 'signal')
  const [target, setTarget] = useStored('reaction:target', 3)
  const best = useBestScore('reaction', true)
  const bestColor = useBestScore('reaction-color')

  if (!config) {
    return (
      <>
        <PlayerSetup
          gameId="reaction"
          min={1}
          max={4}
          defaultCount={2}
          defaultAI={false}
          showDifficulty
          extra={
            <>
              <div className="setup-row">
                <span>게임</span>
                <div className="segmented">
                  <button className={mode === 'signal' ? 'active' : ''} onClick={() => setMode('signal')}>
                    🟢 신호 대결
                  </button>
                  <button className={mode === 'color' ? 'active' : ''} onClick={() => setMode('color')}>
                    🎨 색 맞추기
                  </button>
                </div>
              </div>
              <div className="setup-row">
                <span>
                  대결 목표 <small className="muted">(2명 이상)</small>
                </span>
                <div className="segmented">
                  {[3, 5, 7].map((t) => (
                    <button key={t} className={target === t ? 'active' : ''} onClick={() => setTarget(t)}>
                      {t}점
                    </button>
                  ))}
                </div>
              </div>
            </>
          }
          onStart={(players, difficulty) => setConfig({ players, difficulty, mode, target })}
        />
        <p className="center muted react-note">
          {mode === 'signal'
            ? '화면이 초록색으로 바뀌는 순간 가장 먼저 탭! 혼자면 반응 속도(ms)를 재요.'
            : '글자 뜻과 글자 색이 같을 때만 탭! 다를 때 누르면 반칙이에요.'}
          <br />
          {mode === 'signal' && best.best != null && `내 최고 평균: ${best.best}ms`}
          {mode === 'color' && bestColor.best != null && `혼자 하기 최고: ${bestColor.best}점`}
        </p>
      </>
    )
  }
  const soloHuman = config.players.length === 1 && !config.players[0].isAI
  const back = () => setConfig(null)
  const again = () => setRound((r) => r + 1)
  if (soloHuman && config.mode === 'signal') return <SoloSignal key={round} onAgain={again} onSetup={back} />
  if (soloHuman) return <SoloColor key={round} onAgain={again} onSetup={back} />
  return <Arena key={round} config={config} onAgain={again} onSetup={back} />
}

// ---------- helpers ----------

function useTimers() {
  const ids = useRef<number[]>([])
  const later = useCallback((fn: () => void, ms: number) => {
    ids.current.push(window.setTimeout(fn, ms))
  }, [])
  const clear = useCallback(() => {
    ids.current.forEach(clearTimeout)
    ids.current = []
  }, [])
  useEffect(() => clear, [clear])
  return { later, clear }
}

function useArenaHeight(ref: React.RefObject<HTMLElement | null>) {
  const [h, setH] = useState(480)
  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      setH(Math.max(320, window.innerHeight - top - 20))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [ref])
  return h
}

/** Marks the moment the screen actually changed (next animation frame). */
function markFrame(set: (t: number) => void) {
  set(performance.now())
  requestAnimationFrame(() => set(performance.now()))
}

function CardView({ card, small }: { card: Card; small?: boolean }) {
  return (
    <span className={`react-card ${small ? 'small' : ''}`} style={{ color: COLOR_WORDS[card.ink].color }}>
      {COLOR_WORDS[card.word].word}
    </span>
  )
}

// ---------- multiplayer arena ----------

type Phase = 'ready' | 'wait' | 'go' | 'result' | 'over'

interface ArenaState {
  phase: Phase
  scores: number[]
  fouled: boolean[]
  card: Card | null
  goAt: number
  winner: number | null
  winMs: number
  note: string
  roundNo: number
}

function Arena({ config, onAgain, onSetup }: { config: Config; onAgain: () => void; onSetup: () => void }) {
  const { players, difficulty, mode, target } = config
  const n = players.length
  const ref = useRef<HTMLDivElement>(null)
  const height = useArenaHeight(ref)
  const { later, clear } = useTimers()
  const g = useRef<ArenaState>({
    phase: 'ready',
    scores: players.map(() => 0),
    fouled: players.map(() => false),
    card: null,
    goAt: 0,
    winner: null,
    winMs: 0,
    note: '',
    roundNo: 0,
  })
  const [, bump] = useState(0)
  const render = () => bump((x) => x + 1)

  const startRound = () => {
    clear()
    const s = g.current
    s.roundNo++
    s.phase = 'ready'
    s.fouled = players.map(() => false)
    s.winner = null
    s.card = null
    s.note = ''
    render()
    later(() => {
      s.phase = 'wait'
      render()
      if (mode === 'signal') later(go, randomDelay())
      else showDecoys(decoysBeforeMatch(), 0)
    }, 1300)
  }

  const scheduleAI = () => {
    players.forEach((p, i) => {
      if (p.isAI && !g.current.fouled[i]) later(() => tap(i), aiReaction(difficulty, mode))
    })
  }

  const go = () => {
    const s = g.current
    s.phase = 'go'
    if (mode === 'color') s.card = makeCard(true, Math.random, s.card ?? undefined)
    markFrame((t) => (s.goAt = t))
    render()
    scheduleAI()
    // Nobody tapped in time
    later(
      () => {
        if (s.phase !== 'go') return
        if (mode === 'color') {
          s.phase = 'wait'
          render()
          showDecoys(decoysBeforeMatch(), 0)
        } else {
          s.note = '아무도 안 눌렀어요'
          s.phase = 'result'
          render()
          later(startRound, 1400)
        }
      },
      mode === 'color' ? 1900 : 5000,
    )
  }

  const showDecoys = (left: number, idx: number) => {
    const s = g.current
    if (left <= 0) {
      go()
      return
    }
    s.card = makeCard(false, Math.random, s.card ?? undefined)
    render()
    const dur = cardDuration(s.roundNo * 4 + idx)
    players.forEach((p, i) => {
      if (p.isAI && !s.fouled[i] && Math.random() < AI_FOUL[difficulty]) later(() => s.phase === 'wait' && tap(i), dur * (0.3 + Math.random() * 0.5))
    })
    later(() => s.phase === 'wait' && showDecoys(left - 1, idx + 1), dur)
  }

  const tap = (i: number) => {
    const s = g.current
    if (s.phase === 'wait') {
      if (s.fouled[i]) return
      s.fouled[i] = true
      if (!players[i].isAI) navigator.vibrate?.(120)
      render()
      if (s.fouled.every(Boolean)) {
        clear()
        s.note = '모두 반칙! 다시 해요'
        s.phase = 'result'
        render()
        later(startRound, 1500)
      }
      return
    }
    if (s.phase !== 'go' || s.fouled[i]) return
    clear()
    s.winner = i
    s.winMs = Math.round(performance.now() - s.goAt)
    s.scores[i]++
    s.phase = 'result'
    if (!players[i].isAI) navigator.vibrate?.(40)
    render()
    later(() => {
      if (matchWinner(s.scores, target) != null) {
        s.phase = 'over'
        render()
      } else startRound()
    }, 1700)
  }

  useEffect(() => {
    startRound()
    const onKey = (e: KeyboardEvent) => {
      const i = KEYS.indexOf(e.code)
      if (i >= 0 && i < n && !players[i].isAI && !e.repeat) tap(i)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const s = g.current
  const champion = matchWinner(s.scores, target)
  const ranking = players.map((p, i) => ({ p, i, sc: s.scores[i] })).sort((a, b) => b.sc - a.sc)

  // Layout: bottom row = players 0,1; top row (rotated) = players 2,3 — or player 1 alone with two players.
  const top = n === 2 ? [1] : n >= 3 ? players.slice(2).map((_, k) => k + 2) : []
  const bottom = n === 2 ? [0] : n === 1 ? [0] : [0, 1]

  const zone = (i: number, flipped: boolean) => {
    const p = players[i]
    const fouled = s.fouled[i]
    const won = s.phase === 'result' && s.winner === i
    const lost = s.phase === 'result' && s.winner != null && s.winner !== i
    let msg: React.ReactNode
    if (s.phase === 'ready') msg = <span className="react-msg">준비…</span>
    else if (fouled && s.phase !== 'result') msg = <span className="react-msg foul">🚫 반칙!</span>
    else if (s.phase === 'wait')
      msg = mode === 'color' && s.card ? <CardView card={s.card} small={n > 2} /> : <span className="react-msg">기다려요…</span>
    else if (s.phase === 'go')
      msg = mode === 'color' && s.card ? <CardView card={s.card} small={n > 2} /> : <span className="react-msg go">지금!</span>
    else if (won) msg = <span className="react-msg win">🎉 승리! {s.winMs}ms</span>
    else if (lost) msg = <span className="react-msg">{fouled ? '🚫 반칙' : '아깝다!'}</span>
    else msg = <span className="react-msg">{s.note}</span>
    return (
      <div
        key={i}
        className={`react-zone ${won ? 'won' : ''} ${fouled ? 'fouled' : ''} ${p.isAI ? 'ai' : ''}`}
        style={{ '--zc': PCOLORS[i] } as React.CSSProperties}
        onPointerDown={p.isAI ? undefined : (e) => {
          e.preventDefault()
          tap(i)
        }}
      >
        <div className={`react-zone-inner ${flipped ? 'flip' : ''}`}>
          <div className="react-zone-head">
            <strong>
              {p.isAI ? '🤖 ' : ''}
              {p.name}
            </strong>
            <span className="react-dots" aria-label={`${s.scores[i]}점`}>
              {Array.from({ length: target }, (_, k) => (
                <i key={k} className={k < s.scores[i] ? 'on' : ''} />
              ))}
            </span>
          </div>
          <div className="react-zone-body">{msg}</div>
          {!p.isAI && <kbd className="react-key">{KEY_LABELS[i]}</kbd>}
        </div>
      </div>
    )
  }

  const bg = mode !== 'signal' ? 'idle' : s.phase === 'go' ? 'go' : s.phase === 'wait' ? 'wait' : 'idle'
  return (
    <div className={`react-arena bg-${bg}`} ref={ref} style={{ height }}>
      {top.length > 0 && <div className="react-row">{top.map((i) => zone(i, true))}</div>}
      <div className="react-divider">
        {mode === 'signal' ? '초록색이 되면 탭!' : '글자 뜻 = 글자 색일 때 탭!'}
      </div>
      <div className="react-row">{bottom.map((i) => zone(i, false))}</div>
      {s.phase === 'over' && champion != null && (
        <div className="react-overlay">
          <Result title={`🏆 ${players[champion].name} 승리!`} onAgain={onAgain}>
            <ol className="react-ranking">
              {ranking.map(({ p, i, sc }) => (
                <li key={i}>
                  {p.isAI ? '🤖 ' : ''}
                  {p.name} — <strong>{sc}점</strong>
                </li>
              ))}
            </ol>
            <button className="btn ghost" onClick={onSetup}>
              설정으로
            </button>
          </Result>
        </div>
      )}
    </div>
  )
}

// ---------- solo: reaction time ----------

type SoloPhase = 'idle' | 'wait' | 'go' | 'shown' | 'early' | 'done'

function SoloSignal({ onAgain, onSetup }: { onAgain: () => void; onSetup: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const height = useArenaHeight(ref)
  const { later, clear } = useTimers()
  const [phase, setPhase] = useState<SoloPhase>('idle')
  const [times, setTimes] = useState<number[]>([])
  const goAt = useRef(0)
  const phaseRef = useRef<SoloPhase>('idle')
  const [newBest, setNewBest] = useState(false)
  const { best, submit } = useBestScore('reaction', true)
  phaseRef.current = phase

  const begin = () => {
    clear()
    setPhase('wait')
    later(() => {
      setPhase('go')
      markFrame((t) => (goAt.current = t))
    }, randomDelay(Math.random, 1500, 4000))
  }

  const press = () => {
    const ph = phaseRef.current
    if (ph === 'idle' || ph === 'shown' || ph === 'early') begin()
    else if (ph === 'wait') {
      clear()
      setPhase('early')
      navigator.vibrate?.(150)
    } else if (ph === 'go') {
      const ms = Math.round(performance.now() - goAt.current)
      const next = [...times, ms]
      setTimes(next)
      if (next.length >= SOLO_TRIES) {
        setNewBest(submit(average(next)))
        setPhase('done')
      } else setPhase('shown')
    }
  }
  const pressRef = useRef(press)
  pressRef.current = press

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.code === 'Space' || e.code === 'Enter' || e.code.startsWith('Key')) {
        e.preventDefault()
        pressRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const last = times[times.length - 1]
  if (phase === 'done') {
    const avg = average(times)
    return (
      <Result title={`평균 ${avg}ms`} onAgain={onAgain}>
        <p className="react-rating">{rating(avg)}</p>
        <ul className="react-times">
          {times.map((t, i) => (
            <li key={i} className={t === Math.min(...times) ? 'best' : ''}>
              {i + 1}회 <b>{t}ms</b>
            </li>
          ))}
        </ul>
        <p>{newBest ? '🎉 새로운 최고 기록!' : best != null ? `최고 기록: ${best}ms` : ''}</p>
        <button className="btn ghost" onClick={onSetup}>
          설정으로
        </button>
      </Result>
    )
  }

  return (
    <div
      ref={ref}
      className={`react-solo bg-${phase === 'go' ? 'go' : phase === 'wait' ? 'wait' : phase === 'early' ? 'foul' : 'idle'}`}
      style={{ height }}
      onPointerDown={(e) => {
        e.preventDefault()
        press()
      }}
    >
      <div className="react-progress">
        {Array.from({ length: SOLO_TRIES }, (_, i) => (
          <i key={i} className={i < times.length ? 'on' : ''} />
        ))}
      </div>
      {phase === 'idle' && (
        <>
          <div className="react-big">⚡</div>
          <div className="react-title">반응 속도 측정</div>
          <p>
            화면이 <b className="react-green">초록색</b>으로 바뀌면 최대한 빨리 탭하세요.
            <br />
            {SOLO_TRIES}번 측정해서 평균을 내요. 탭해서 시작!
          </p>
        </>
      )}
      {phase === 'wait' && (
        <>
          <div className="react-big">✋</div>
          <div className="react-title">기다려요…</div>
          <p>초록색이 되면 탭!</p>
        </>
      )}
      {phase === 'go' && (
        <>
          <div className="react-big">👆</div>
          <div className="react-title">지금!</div>
        </>
      )}
      {phase === 'shown' && (
        <>
          <div className="react-title huge">{last}ms</div>
          <p>{rating(last)}</p>
          <p className="react-sub">탭해서 다음 ({times.length + 1}/{SOLO_TRIES})</p>
        </>
      )}
      {phase === 'early' && (
        <>
          <div className="react-big">🙅</div>
          <div className="react-title">너무 빨라요!</div>
          <p>초록색이 된 다음에 눌러야 해요. 탭해서 다시</p>
        </>
      )}
    </div>
  )
}

// ---------- solo: colour match ----------

function SoloColor({ onAgain, onSetup }: { onAgain: () => void; onSetup: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const height = useArenaHeight(ref)
  const { later, clear } = useTimers()
  const run = useRef<Card[]>(colorRun())
  const [idx, setIdx] = useState(-1) // -1 = intro
  const [flash, setFlash] = useState<'' | 'hit' | 'foul' | 'miss'>('')
  const res = useRef<ColorRunResult>({ hits: 0, misses: 0, fouls: 0, times: [] })
  const shownAt = useRef(0)
  const tapped = useRef(false)
  const idxRef = useRef(-1)
  const [done, setDone] = useState<{ score: number; newBest: boolean } | null>(null)
  const { best, submit } = useBestScore('reaction-color')
  const submitRef = useRef(submit)
  submitRef.current = submit

  const show = (i: number) => {
    const cards = run.current
    if (i >= cards.length) {
      const score = colorScore(res.current)
      setDone({ score, newBest: submitRef.current(score) })
      return
    }
    idxRef.current = i
    tapped.current = false
    setIdx(i)
    markFrame((t) => (shownAt.current = t))
    later(() => {
      if (isMatch(cards[i]) && !tapped.current) {
        res.current.misses++
        setFlash('miss')
      }
      show(i + 1)
    }, cardDuration(i))
  }

  const press = () => {
    const i = idxRef.current
    if (i < 0) {
      if (idx === -1) {
        idxRef.current = -2
        setIdx(-2)
        later(() => show(0), 900)
      }
      return
    }
    if (tapped.current) return
    tapped.current = true
    if (isMatch(run.current[i])) {
      res.current.hits++
      res.current.times.push(Math.round(performance.now() - shownAt.current))
      setFlash('hit')
      navigator.vibrate?.(20)
    } else {
      res.current.fouls++
      setFlash('foul')
      navigator.vibrate?.(120)
    }
  }
  const pressRef = useRef(press)
  pressRef.current = press

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.code === 'Space' || e.code === 'Enter' || e.code.startsWith('Key')) {
        e.preventDefault()
        pressRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clear()
    }
  }, [clear])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(''), 350)
    return () => clearTimeout(t)
  }, [flash, idx])

  if (done) {
    const r = res.current
    return (
      <Result title={`${done.score}점!`} onAgain={onAgain}>
        <p>
          맞힘 {r.hits} · 놓침 {r.misses} · 반칙 {r.fouls}
          {r.times.length > 0 && (
            <>
              <br />
              평균 반응 {average(r.times)}ms
            </>
          )}
        </p>
        <p>{done.newBest ? '🎉 새로운 최고 기록!' : best != null ? `최고 기록: ${best}점` : ''}</p>
        <button className="btn ghost" onClick={onSetup}>
          설정으로
        </button>
      </Result>
    )
  }

  const card = idx >= 0 ? run.current[idx] : null
  return (
    <div
      ref={ref}
      className={`react-solo bg-idle color-mode ${flash ? `flash-${flash}` : ''}`}
      style={{ height }}
      onPointerDown={(e) => {
        e.preventDefault()
        press()
      }}
    >
      <div className="react-progress">
        <span>
          {Math.max(0, idx + 1)}/{run.current.length}
        </span>
        <span>
          ✅ {res.current.hits} · 🚫 {res.current.fouls}
        </span>
      </div>
      {idx === -1 && (
        <>
          <div className="react-big">🎨</div>
          <div className="react-title">색 맞추기</div>
          <p>
            글자의 <b>뜻</b>과 글자의 <b>색</b>이 같을 때만 탭!
            <br />
            예) <CardView card={{ word: 0, ink: 0 }} small /> → 탭 · <CardView card={{ word: 0, ink: 1 }} small /> → 참기
            <br />
            탭해서 시작
          </p>
        </>
      )}
      {idx === -2 && <div className="react-title">준비…</div>}
      {card && <CardView card={card} />}
      {flash === 'hit' && <div className="react-feedback">좋아요!</div>}
      {flash === 'foul' && <div className="react-feedback bad">반칙!</div>}
      {flash === 'miss' && <div className="react-feedback bad">놓쳤어요</div>}
    </div>
  )
}
