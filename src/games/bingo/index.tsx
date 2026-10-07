import { useEffect, useMemo, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  FREE,
  autoMark,
  callOrder,
  canMark,
  closestLineMissing,
  completedLines,
  countLines,
  initialMarks,
  label,
  makeCard,
  maxNumber,
  winnersFor,
  LINES,
  type BingoMode,
} from './logic'
import './bingo.css'

const COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)']
const AI_DELAY: Record<Difficulty, number> = { easy: 1800, normal: 1100, hard: 450 }
/** Easy AIs overlook the newest number until the next call. */
const AI_LAG: Record<Difficulty, number> = { easy: 1, normal: 0, hard: 0 }
const AUTO_CALL_MS = 3200

interface Options {
  mode: BingoMode
  target: number
  autoMarkHumans: boolean
}

interface State {
  players: PlayerConfig[]
  difficulty: Difficulty
  opts: Options
  cards: number[][]
  marks: boolean[][]
  order: number[]
  called: number[]
  winners: number[] | null
}

function fresh(players: PlayerConfig[], difficulty: Difficulty, opts: Options): State {
  const cards = players.map(() => makeCard(opts.mode))
  return {
    players,
    difficulty,
    opts,
    cards,
    marks: cards.map(initialMarks),
    order: callOrder(opts.mode),
    called: [],
    winners: null,
  }
}

export default function Bingo() {
  const [state, setState] = useState<State | null>(null)
  const [mode, setMode] = useStored<BingoMode>('bingo:mode', '75')
  const [target, setTarget] = useStored('bingo:target', 1)
  const [autoMarkHumans, setAutoMarkHumans] = useStored('bingo:automark', false)

  if (!state) {
    return (
      <PlayerSetup
        gameId="bingo"
        min={2}
        max={4}
        defaultCount={2}
        showDifficulty
        onStart={(p, d) => setState(fresh(p, d, { mode, target, autoMarkHumans }))}
        extra={
          <>
            <div className="setup-row">
              <span>번호</span>
              <div className="segmented">
                <button className={mode === '75' ? 'active' : ''} onClick={() => setMode('75')}>
                  1~75 (클래식)
                </button>
                <button className={mode === '25' ? 'active' : ''} onClick={() => setMode('25')}>
                  1~25
                </button>
              </div>
            </div>
            <div className="setup-row">
              <span>승리 조건</span>
              <div className="segmented">
                {[1, 3, 5].map((t) => (
                  <button key={t} className={target === t ? 'active' : ''} onClick={() => setTarget(t)}>
                    {t}줄
                  </button>
                ))}
              </div>
            </div>
            <label className="toggle bingo-toggle">
              <input type="checkbox" checked={autoMarkHumans} onChange={(e) => setAutoMarkHumans(e.target.checked)} />
              내 판도 자동으로 표시하기
            </label>
          </>
        }
      />
    )
  }
  return <Hall state={state} setState={setState} onReset={() => setState(null)} />
}

function Hall({
  state,
  setState,
  onReset,
}: {
  state: State
  setState: React.Dispatch<React.SetStateAction<State | null>>
  onReset: () => void
}) {
  const { players, cards, marks, called, order, winners, opts, difficulty } = state
  const humans = players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0)
  const [view, setView] = useState(humans[0] ?? 0)
  const [autoCall, setAutoCall] = useStored('bingo:autocall', false)
  const [shake, setShake] = useState<number | null>(null)
  const [showBoard, setShowBoard] = useState(false)
  const over = winners != null
  const exhausted = called.length >= order.length
  const latest = called[called.length - 1]
  const calledSet = useMemo(() => new Set(called), [called])

  const callNext = () => {
    setState((s) => {
      if (!s || s.winners || s.called.length >= s.order.length) return s
      const n = s.order[s.called.length]
      const nextCalled = [...s.called, n]
      const marks = s.opts.autoMarkHumans
        ? s.marks.map((m, i) => (s.players[i].isAI ? m : autoMark(s.cards[i], m, [n])))
        : s.marks
      return { ...s, called: nextCalled, marks }
    })
  }

  // Computer players mark after a short delay (shorter on harder levels).
  useEffect(() => {
    if (over || called.length === 0) return
    const id = window.setTimeout(() => {
      setState((s) => {
        if (!s || s.winners) return s
        const seen = s.called.slice(0, Math.max(0, s.called.length - AI_LAG[s.difficulty]))
        return { ...s, marks: s.marks.map((m, i) => (s.players[i].isAI ? autoMark(s.cards[i], m, seen) : m)) }
      })
    }, AI_DELAY[difficulty])
    return () => window.clearTimeout(id)
  }, [called.length, over, difficulty, setState])

  // Winner detection after any mark change.
  useEffect(() => {
    if (over) return
    const w = winnersFor(marks, opts.target)
    if (w.length) setState((s) => s && { ...s, winners: w })
  }, [marks, over, opts.target, setState])

  // Optional automatic calling.
  useEffect(() => {
    if (!autoCall || over || exhausted) return
    const id = window.setTimeout(callNext, called.length === 0 ? 600 : AUTO_CALL_MS)
    return () => window.clearTimeout(id)
  }, [autoCall, over, exhausted, called.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // All numbers called and nobody reached the target (humans forgot to mark): best card wins.
  const stalled = exhausted && !over
  const shakeTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(shakeTimer.current), [])

  const tapCell = (player: number, cell: number) => {
    if (over || players[player].isAI) return
    if (marks[player][cell]) return
    if (!canMark(cards[player], cell, called)) {
      setShake(cell)
      window.clearTimeout(shakeTimer.current)
      shakeTimer.current = window.setTimeout(() => setShake(null), 400)
      return
    }
    setState((s) => s && { ...s, marks: s.marks.map((m, i) => (i === player ? m.map((v, j) => v || j === cell) : m)) })
  }

  const viewing = players[view]?.isAI ? (humans[0] ?? view) : view
  const lines = (i: number) => countLines(marks[i])
  const doneLines = new Set(completedLines(marks[viewing]).flatMap((l) => LINES[l]))
  const missing = closestLineMissing(marks[viewing])

  return (
    <>
      {over && (
        <Result
          title={
            winners.length > 1
              ? `🎉 ${winners.map((w) => players[w].name).join(', ')} 동시 빙고!`
              : players[winners[0]].isAI
                ? `🤖 ${players[winners[0]].name} 빙고!`
                : `🎉 ${players[winners[0]].name} 빙고!`
          }
          onAgain={() => setState(fresh(players, difficulty, opts))}
        >
          <p className="muted">{called.length}개 번호가 불렸어요.</p>
          <button className="btn ghost" onClick={onReset}>
            설정으로
          </button>
        </Result>
      )}

      <div className="bingo-caller card-panel">
        <div className={`bingo-ball ${latest ? '' : 'empty'}`} key={latest ?? 0}>
          {latest ? label(latest, opts.mode) : '?'}
        </div>
        <div className="bingo-caller-side">
          <div className="bingo-count">
            {called.length}/{maxNumber(opts.mode)} · {opts.target}줄 먼저!
          </div>
          <div className="bingo-recent">
            {called
              .slice(-7, -1)
              .reverse()
              .map((n) => (
                <span key={n} className="bingo-mini-ball">
                  {n}
                </span>
              ))}
          </div>
          <div className="bingo-caller-btns">
            <button className="btn accent" onClick={callNext} disabled={over || exhausted || autoCall}>
              다음 번호
            </button>
            <label className="toggle bingo-auto">
              <input type="checkbox" checked={autoCall} onChange={(e) => setAutoCall(e.target.checked)} />
              자동
            </label>
          </div>
        </div>
      </div>

      {stalled && (
        <div className="card-panel bingo-stalled">
          번호가 모두 나왔어요! 아직 표시하지 않은 칸을 눌러 표시해 보세요.
        </div>
      )}

      <div className="players-bar">
        {players.map((p, i) => (
          <button
            key={i}
            className={`player-chip bingo-chip ${i === viewing ? 'active' : ''}`}
            style={{ borderColor: i === viewing ? COLORS[i] : undefined }}
            onClick={() => !p.isAI && setView(i)}
            disabled={p.isAI}
          >
            {p.isAI ? '🤖 ' : ''}
            {p.name} · <strong>{lines(i)}줄</strong>
          </button>
        ))}
      </div>

      <div className="bingo-main">
        <div className="bingo-card" style={{ ['--c' as string]: COLORS[viewing] }}>
          {opts.mode === '75' && (
            <div className="bingo-letters">
              {['B', 'I', 'N', 'G', 'O'].map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
          )}
          <div className="bingo-grid">
            {cards[viewing].map((n, cell) => {
              const marked = marks[viewing][cell]
              const callable = !marked && n !== FREE && calledSet.has(n)
              return (
                <button
                  key={cell}
                  className={`bingo-cell ${marked ? 'marked' : ''} ${doneLines.has(cell) ? 'line' : ''} ${callable ? 'callable' : ''} ${shake === cell ? 'nope' : ''}`}
                  onClick={() => tapCell(viewing, cell)}
                  disabled={over || players[viewing].isAI}
                  aria-label={n === FREE ? '프리' : `${n}${marked ? ' (표시됨)' : ''}`}
                >
                  {n === FREE ? '★' : n}
                </button>
              )
            })}
          </div>
          <div className="bingo-hint">
            {over
              ? ''
              : opts.autoMarkHumans
                ? missing === 1
                  ? '🔥 한 칸만 더!'
                  : '번호가 자동으로 표시돼요'
                : missing === 1
                  ? '🔥 한 칸만 더! 불린 번호를 놓치지 마세요'
                  : '불린 번호를 눌러 표시하세요'}
          </div>
        </div>

        <div className="bingo-others">
          {players.map((p, i) =>
            i === viewing ? null : (
              <div key={i} className="bingo-other">
                <div className="bingo-other-name">
                  {p.isAI ? '🤖 ' : ''}
                  {p.name}
                </div>
                <div className="bingo-mini" style={{ ['--c' as string]: COLORS[i] }}>
                  {marks[i].map((m, cell) => (
                    <span key={cell} className={m ? 'on' : ''} />
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      </div>

      <button className="btn ghost small bingo-board-toggle" onClick={() => setShowBoard((v) => !v)}>
        {showBoard ? '불린 번호 접기 ▲' : '불린 번호 전체 보기 ▼'}
      </button>
      {showBoard && (
        <div className={`bingo-board card-panel mode-${opts.mode}`}>
          {Array.from({ length: maxNumber(opts.mode) }, (_, i) => i + 1).map((n) => (
            <span key={n} className={calledSet.has(n) ? 'on' : ''}>
              {n}
            </span>
          ))}
        </div>
      )}
    </>
  )
}
