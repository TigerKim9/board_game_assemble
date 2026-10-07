import { useEffect, useMemo, useState } from 'react'
import { Result } from '../../components/Result'
import { useBestScore, useStored } from '../../lib/storage'
import { Celebration, ResumeCard, Stat, StatBar, formatTime, readBest, useTicker } from '../minesweeper/puzzleKit'
import {
  ALL,
  BOX,
  COL,
  LEVELS,
  ROW,
  candidates,
  clearPeerNotes,
  conflicts,
  findHint,
  generate,
  isSolved,
  remaining,
  type Grid,
  type Level,
} from './logic'
import './sudoku.css'

const HINTS = 3
const MAX_HISTORY = 80

interface Snapshot {
  grid: Grid
  notes: number[]
}

interface Game {
  level: Level
  puzzle: Grid
  solution: Grid
  grid: Grid
  notes: number[]
  history: Snapshot[]
  time: number
  hintsLeft: number
  won: boolean
}

const levelName = (l: Level) => LEVELS.find((x) => x.id === l)!.name

export default function Sudoku() {
  const [saved, setSaved] = useStored<Game | null>('sudoku:save', null)
  const [level, setLevel] = useStored<Level>('sudoku:level', 'easy')
  const [game, setGame] = useState<Game | null>(null)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState(0)

  const start = (lv: Level) => {
    setBusy(true)
    // Let the "making" message paint before the (short) generation work.
    setTimeout(() => {
      const p = generate(lv)
      setGame({
        level: lv,
        puzzle: p.puzzle,
        solution: p.solution,
        grid: p.puzzle.slice(),
        notes: Array(81).fill(0),
        history: [],
        time: 0,
        hintsLeft: HINTS,
        won: false,
      })
      setKey((k) => k + 1)
      setBusy(false)
    }, 40)
  }

  if (game) {
    return <Play key={key} initial={game} onSave={setSaved} onNew={() => start(game.level)} onExit={() => setGame(null)} busy={busy} />
  }

  const savedOk = saved && !saved.won ? saved : null
  return (
    <div className="setup card-panel">
      {savedOk && (
        <ResumeCard
          text={`${levelName(savedOk.level)} 스도쿠 진행 중 (${formatTime(savedOk.time)})`}
          onResume={() => {
            setGame(savedOk)
            setKey((k) => k + 1)
          }}
          onDiscard={() => setSaved(null)}
        />
      )}
      <div className="sudoku-levels">
        {LEVELS.map((l) => {
          const best = readBest(`sudoku:${l.id}`)
          return (
            <button key={l.id} className={`sudoku-level ${level === l.id ? 'active' : ''}`} onClick={() => setLevel(l.id)}>
              <strong>{l.name}</strong>
              <small>{l.desc}</small>
              <span className="sudoku-level-best">🏆 {best == null ? '—' : formatTime(best)}</span>
            </button>
          )
        })}
      </div>
      <button className="btn primary big" disabled={busy} onClick={() => start(level)}>
        {busy ? '퍼즐 만드는 중…' : '새 퍼즐 시작'}
      </button>
    </div>
  )
}

function Play({
  initial,
  onSave,
  onNew,
  onExit,
  busy,
}: {
  initial: Game
  onSave: (g: Game | null) => void
  onNew: () => void
  onExit: () => void
  busy: boolean
}) {
  const [g, setG] = useState<Game>(initial)
  const [sel, setSel] = useState<number | null>(null)
  const [noteMode, setNoteMode] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [flash, setFlash] = useState<number | null>(null)
  const { best, submit } = useBestScore(`sudoku:${g.level}`, true)
  const [newRecord, setNewRecord] = useState(false)

  const clash = useMemo(() => conflicts(g.grid), [g.grid])
  const left = useMemo(() => remaining(g.grid), [g.grid])
  const selVal = sel != null ? g.grid[sel] : 0

  useTicker(!g.won, () => setG((s) => ({ ...s, time: s.time + 1 })))

  useEffect(() => {
    onSave(g.won ? null : g)
  }, [g]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (g.won) setNewRecord(submit(g.time))
  }, [g.won]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (flash == null) return
    const t = setTimeout(() => setFlash(null), 1200)
    return () => clearTimeout(t)
  }, [flash])

  /** Apply a change, recording the previous grid/notes for undo. */
  const commit = (fn: (s: Game) => Partial<Game> | null) => {
    setG((s) => {
      if (s.won) return s
      const patch = fn(s)
      if (!patch) return s
      const history = [...s.history, { grid: s.grid, notes: s.notes }].slice(-MAX_HISTORY)
      const next = { ...s, ...patch, history }
      if (isSolved(next.grid, next.solution)) next.won = true
      return next
    })
  }

  const input = (d: number) => {
    if (sel == null) return
    setMsg(null)
    commit((s) => {
      if (s.puzzle[sel]) return null
      if (noteMode) {
        if (s.grid[sel]) return null
        const notes = s.notes.slice()
        notes[sel] ^= 1 << d
        return { notes }
      }
      const grid = s.grid.slice()
      if (grid[sel] === d) {
        grid[sel] = 0
        return { grid }
      }
      grid[sel] = d
      return { grid, notes: clearPeerNotes(s.notes, sel, d) }
    })
  }

  const erase = () => {
    if (sel == null) return
    commit((s) => {
      if (s.puzzle[sel] || (!s.grid[sel] && !s.notes[sel])) return null
      const grid = s.grid.slice()
      const notes = s.notes.slice()
      grid[sel] = 0
      notes[sel] = 0
      return { grid, notes }
    })
  }

  const undo = () =>
    setG((s) => {
      const last = s.history[s.history.length - 1]
      if (!last || s.won) return s
      return { ...s, grid: last.grid, notes: last.notes, history: s.history.slice(0, -1) }
    })

  const autoNotes = () => {
    commit((s) => {
      const c = candidates(s.grid)
      return { notes: c.map((m, i) => (s.grid[i] ? 0 : m & ALL)) }
    })
    setMsg('빈칸마다 들어갈 수 있는 숫자를 메모했어요.')
  }

  const hint = () => {
    if (g.hintsLeft <= 0) return
    const h = findHint(g.grid, g.solution, sel)
    if (!h) return
    setSel(h.cell)
    setFlash(h.cell)
    if (h.kind === 'wrong') {
      commit((s) => {
        const grid = s.grid.slice()
        grid[h.cell] = 0
        return { grid, hintsLeft: s.hintsLeft - 1 }
      })
      setMsg('이 칸의 숫자가 틀렸어요. 지워 두었어요!')
      return
    }
    commit((s) => {
      const grid = s.grid.slice()
      grid[h.cell] = h.value
      return { grid, notes: clearPeerNotes(s.notes, h.cell, h.value), hintsLeft: s.hintsLeft - 1 }
    })
    const where = h.unit === 'row' ? '가로줄' : h.unit === 'col' ? '세로줄' : '3×3 박스'
    setMsg(
      h.reason === 'nakedSingle'
        ? `이 칸에는 ${h.value}만 들어갈 수 있어요. 같은 줄과 박스에 나머지 숫자가 다 있거든요.`
        : h.reason === 'hiddenSingle'
          ? `이 ${where}에서 ${h.value}이(가) 들어갈 수 있는 자리는 여기뿐이에요.`
          : `정답을 살짝 알려드릴게요: ${h.value}`,
    )
  }

  // Keyboard support for desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if (/^[1-9]$/.test(e.key)) input(Number(e.key))
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') erase()
      else if (e.key.toLowerCase() === 'n') setNoteMode((m) => !m)
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        const cur = sel ?? 40
        let r = ROW(cur)
        let c = COL(cur)
        if (e.key === 'ArrowUp') r = (r + 8) % 9
        if (e.key === 'ArrowDown') r = (r + 1) % 9
        if (e.key === 'ArrowLeft') c = (c + 8) % 9
        if (e.key === 'ArrowRight') c = (c + 1) % 9
        setSel(r * 9 + c)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const filled = g.grid.filter(Boolean).length

  return (
    <div className="sudoku-wrap">
      {g.won && <Celebration />}
      <StatBar>
        <Stat label="난이도" value={levelName(g.level)} />
        <Stat label="시간" value={formatTime(g.time)} />
        <Stat label="최고" value={best == null ? '—' : formatTime(best)} highlight />
        <Stat label="채움" value={`${filled}/81`} />
      </StatBar>

      {g.won && (
        <Result title={`🎉 완성! ${formatTime(g.time)}`} onAgain={onNew} againLabel={busy ? '만드는 중…' : '새 퍼즐'}>
          <p>{newRecord ? `🏆 ${levelName(g.level)} 새 최고 기록!` : best != null ? `최고 기록: ${formatTime(best)}` : ''}</p>
          <button className="btn ghost" onClick={onExit}>
            난이도 바꾸기
          </button>
        </Result>
      )}

      <div className={`sudoku-board ${g.won ? 'won' : ''}`} role="grid" aria-label="스도쿠 판">
        {g.grid.map((v, i) => {
          const given = g.puzzle[i] !== 0
          const related =
            sel != null && (ROW(i) === ROW(sel) || COL(i) === COL(sel) || BOX(i) === BOX(sel))
          const same = selVal !== 0 && v === selVal
          let cls = 'sudoku-cell'
          if (given) cls += ' given'
          else if (v) cls += ' user'
          if (related) cls += ' related'
          if (same) cls += ' same'
          if (sel === i) cls += ' sel'
          if (clash.has(i)) cls += ' clash'
          if (flash === i) cls += ' flash'
          if (COL(i) % 3 === 2 && COL(i) < 8) cls += ' br'
          if (ROW(i) % 3 === 2 && ROW(i) < 8) cls += ' bb'
          return (
            <button key={i} className={cls} onClick={() => setSel(i)} aria-label={`${ROW(i) + 1}행 ${COL(i) + 1}열 ${v || '빈칸'}`}>
              {v ? (
                v
              ) : g.notes[i] ? (
                <span className="sudoku-notes">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                    <span key={d} className={selVal === d && g.notes[i] & (1 << d) ? 'on' : ''}>
                      {g.notes[i] & (1 << d) ? d : ''}
                    </span>
                  ))}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <p className="sudoku-msg">{msg ?? (sel == null ? '칸을 고른 다음 아래 숫자를 누르세요.' : noteMode ? '✏️ 메모 모드: 후보 숫자를 적어 두세요.' : ' ')}</p>

      {!g.won && (
        <>
          <div className="sudoku-tools">
            <button className="sudoku-tool" onClick={undo} disabled={!g.history.length}>
              <span>↶</span>되돌리기
            </button>
            <button className="sudoku-tool" onClick={erase}>
              <span>⌫</span>지우기
            </button>
            <button className={`sudoku-tool ${noteMode ? 'on' : ''}`} onClick={() => setNoteMode((m) => !m)} aria-pressed={noteMode}>
              <span>✏️</span>메모 {noteMode ? 'ON' : 'OFF'}
            </button>
            <button className="sudoku-tool" onClick={autoNotes}>
              <span>📝</span>자동 메모
            </button>
            <button className="sudoku-tool" onClick={hint} disabled={g.hintsLeft <= 0}>
              <span>💡</span>힌트 {g.hintsLeft}
            </button>
          </div>
          <div className="sudoku-pad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
              <button
                key={d}
                className={`sudoku-key ${noteMode ? 'note' : ''} ${selVal === d ? 'cur' : ''}`}
                onClick={() => input(d)}
                disabled={left[d] <= 0 && !noteMode}
              >
                <strong>{d}</strong>
                <small>{left[d] > 0 ? left[d] : '✓'}</small>
              </button>
            ))}
            <button className="sudoku-key new" onClick={onExit}>
              <strong>⚙︎</strong>
              <small>난이도</small>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
