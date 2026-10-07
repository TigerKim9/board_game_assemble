import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Result } from '../../components/Result'
import { useBestScore, useStored } from '../../lib/storage'
import {
  LEVELS,
  canChord,
  chord,
  flagsUsed,
  newBoard,
  reveal,
  toggleFlag,
  transposeLevel,
  type Board,
  type LevelId,
} from './logic'
import { Celebration, ResumeCard, Stat, StatBar, formatTime, readBest, useTicker } from './puzzleKit'
import './minesweeper.css'

interface Game {
  level: LevelId
  noGuess: boolean
  board: Board
  time: number
  /** Used "한 번 봐주기" — the game no longer counts for records. */
  assisted: boolean
  /** Board before the last move (only kept to undo a losing move). */
  prev: Board | null
}

const recordId = (level: LevelId, noGuess: boolean) => `minesweeper:${level}${noGuess ? ':ng' : ''}`

function startGame(level: LevelId, noGuess: boolean): Game {
  let lv = LEVELS.find((l) => l.id === level)!
  if (lv.w > lv.h && typeof window !== 'undefined' && window.innerWidth < 640) lv = transposeLevel(lv)
  return { level, noGuess, board: newBoard(lv.w, lv.h, lv.mines), time: 0, assisted: false, prev: null }
}

export default function Minesweeper() {
  const [saved, setSaved] = useStored<Game | null>('minesweeper:save', null)
  const [game, setGame] = useState<Game | null>(null)
  const [level, setLevel] = useStored<LevelId>('minesweeper:level', 'beginner')
  const [noGuess, setNoGuess] = useStored('minesweeper:noguess', true)
  const [key, setKey] = useState(0)

  if (game) {
    return (
      <Play
        key={key}
        initial={game}
        onSave={setSaved}
        onNew={() => {
          setGame(startGame(game.level, game.noGuess))
          setKey((k) => k + 1)
        }}
        onExit={() => setGame(null)}
      />
    )
  }

  const savedOk = saved && (saved.board.status === 'playing' || saved.board.status === 'ready') ? saved : null
  return (
    <div className="setup card-panel">
      {savedOk && (
        <ResumeCard
          text={`${LEVELS.find((l) => l.id === savedOk.level)?.name} 게임 진행 중 (${formatTime(savedOk.time)})`}
          onResume={() => {
            setGame(savedOk)
            setKey((k) => k + 1)
          }}
          onDiscard={() => setSaved(null)}
        />
      )}
      <div className="setup-row">
        <span>난이도</span>
        <div className="segmented">
          {LEVELS.map((l) => (
            <button key={l.id} className={level === l.id ? 'active' : ''} onClick={() => setLevel(l.id)}>
              {l.name}
            </button>
          ))}
        </div>
      </div>
      <p className="muted mine-desc">
        {(() => {
          const l = LEVELS.find((x) => x.id === level)!
          return `${l.w}×${l.h} 칸 · 지뢰 ${l.mines}개`
        })()}
      </p>
      <label className="setup-row mine-check">
        <span>
          추측 없는 판
          <br />
          <small className="muted">운에 맡길 일 없이 논리만으로 풀 수 있는 판</small>
        </span>
        <input type="checkbox" checked={noGuess} onChange={(e) => setNoGuess(e.target.checked)} />
      </label>
      <table className="pz-records">
        <thead>
          <tr>
            <th>최고 기록</th>
            <th>일반</th>
            <th>추측 없음</th>
          </tr>
        </thead>
        <tbody>
          {LEVELS.map((l) => {
            const a = readBest(recordId(l.id, false))
            const b = readBest(recordId(l.id, true))
            return (
              <tr key={l.id}>
                <th>{l.name}</th>
                <td>{a == null ? '—' : formatTime(a)}</td>
                <td>{b == null ? '—' : formatTime(b)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <button
        className="btn primary big"
        onClick={() => {
          setGame(startGame(level, noGuess))
          setKey((k) => k + 1)
        }}
      >
        시작하기
      </button>
    </div>
  )
}

const NUM_COLORS = ['', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8']

function Play({
  initial,
  onSave,
  onNew,
  onExit,
}: {
  initial: Game
  onSave: (g: Game | null) => void
  onNew: () => void
  onExit: () => void
}) {
  const [g, setG] = useState<Game>(initial)
  const { board } = g
  const { best, submit } = useBestScore(recordId(g.level, g.noGuess), true)
  const [newRecord, setNewRecord] = useState(false)
  const [flagMode, setFlagMode] = useState(false)
  const [zoom, setZoom] = useStored<number>(`minesweeper:zoom:${board.w}x${board.h}`, 0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(32)
  const over = board.status === 'won' || board.status === 'lost'

  // Fit the board to the available width; zoom adds on top.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setFit(Math.max(18, Math.min(44, Math.floor((el.clientWidth - 8) / board.w))))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [board.w])
  const cell = Math.min(56, fit + zoom)

  useTicker(board.status === 'playing', () => setG((s) => ({ ...s, time: s.time + 1 })))

  // Persist in-progress games so they can be resumed.
  useEffect(() => {
    if (board.status === 'playing') onSave(g)
    else if (over) onSave(null)
  }, [g]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (board.status === 'won' && !g.assisted) setNewRecord(submit(g.time))
  }, [board.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = (i: number, flag: boolean) => {
    setG((s) => {
      const b = s.board
      if (b.status === 'won' || b.status === 'lost') return s
      let next: Board
      if (b.open[i]) next = chord(b, i)
      else if (flag) next = toggleFlag(b, i)
      else if (b.flag[i]) return s
      else next = reveal(b, i, { noGuess: s.noGuess })
      if (next === b) return s
      return { ...s, board: next, prev: b.status === 'ready' ? null : b }
    })
  }

  // Pointer handling: tap = primary action, long press / right click = the other action.
  const press = useRef<{ i: number; x: number; y: number; timer: number; done: boolean } | null>(null)
  const cellFrom = (e: React.PointerEvent) => {
    const t = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null
    return t ? Number(t.dataset.i) : -1
  }
  const onDown = (e: React.PointerEvent) => {
    const i = cellFrom(e)
    if (i < 0 || over) return
    if (e.pointerType === 'mouse' && e.button === 2) {
      act(i, true)
      return
    }
    if (e.button !== 0) return
    const p = { i, x: e.clientX, y: e.clientY, timer: 0, done: false }
    p.timer = window.setTimeout(() => {
      p.done = true
      if (board.open[i]) act(i, false)
      else act(i, !flagMode)
      navigator.vibrate?.(25)
    }, 380)
    press.current = p
  }
  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
  }
  const onMove = (e: React.PointerEvent) => {
    const p = press.current
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancel()
  }
  const onUp = () => {
    const p = press.current
    if (!p) return
    clearTimeout(p.timer)
    press.current = null
    if (!p.done) act(p.i, flagMode)
  }
  useEffect(() => cancel, [])

  const minesLeft = board.mines - flagsUsed(board)
  const face = board.status === 'won' ? '😎' : board.status === 'lost' ? '😵' : '🙂'

  return (
    <div className="mine-wrap">
      {board.status === 'won' && <Celebration />}
      <StatBar>
        <Stat label="남은 지뢰" value={`💣 ${minesLeft}`} />
        <button className="mine-face" onClick={onNew} aria-label="새 게임">
          {face}
        </button>
        <Stat label="시간" value={formatTime(g.time)} />
        <Stat label="최고" value={best == null ? '—' : formatTime(best)} highlight />
      </StatBar>

      {!over && (
        <div className="mine-tools">
          <div className="segmented mine-mode">
            <button className={!flagMode ? 'active' : ''} onClick={() => setFlagMode(false)}>
              ⛏️ 열기
            </button>
            <button className={flagMode ? 'active' : ''} onClick={() => setFlagMode(true)}>
              🚩 깃발
            </button>
          </div>
          <div className="mine-zoom">
            <button className="btn small" onClick={() => setZoom(Math.max(0, zoom - 6))} disabled={zoom <= 0} aria-label="축소">
              −
            </button>
            <span>🔍</span>
            <button className="btn small" onClick={() => setZoom(Math.min(30, zoom + 6))} disabled={cell >= 56} aria-label="확대">
              ＋
            </button>
          </div>
        </div>
      )}

      {over && (
        <Result
          title={board.status === 'won' ? `🎉 성공! ${formatTime(g.time)}` : '💥 펑! 지뢰를 밟았어요'}
          onAgain={onNew}
        >
          {board.status === 'won' &&
            (g.assisted ? (
              <p className="muted">봐주기를 써서 기록에는 남지 않아요.</p>
            ) : (
              <p>{newRecord ? '🏆 새로운 최고 기록!' : best != null ? `최고 기록: ${formatTime(best)}` : ''}</p>
            ))}
          {board.status === 'lost' && g.prev && (
            <button
              className="btn accent"
              onClick={() => setG((s) => (s.prev ? { ...s, board: s.prev, prev: null, assisted: true } : s))}
            >
              ↶ 한 번만 봐주기 (기록 제외)
            </button>
          )}
          <button className="btn ghost" onClick={onExit}>
            난이도 바꾸기
          </button>
        </Result>
      )}

      <div ref={wrapRef} className="mine-scroll">
        <div
          className={`mine-board ${over ? 'over' : ''} ${board.status}`}
          style={{ gridTemplateColumns: `repeat(${board.w}, ${cell}px)`, fontSize: Math.round(cell * 0.58) }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={cancel}
          onPointerLeave={cancel}
          onContextMenu={(e) => e.preventDefault()}
        >
          {board.open.map((open, i) => {
            const isMine = board.mine[i]
            const flagged = board.flag[i]
            let cls = 'mine-cell'
            let content: string | number = ''
            if (open) {
              cls += ' open'
              if (isMine) {
                cls += i === board.exploded ? ' boom' : ''
                content = '💣'
              } else if (board.adj[i]) {
                cls += ' ' + NUM_COLORS[board.adj[i]]
                content = board.adj[i]
                if (canChord(board, i)) cls += ' chord'
              }
            } else if (board.status === 'lost' && isMine && !flagged) {
              cls += ' open reveal'
              content = '💣'
            } else if (flagged) {
              cls += ' flagged'
              content = board.status === 'lost' && !isMine ? '❌' : '🚩'
            }
            return (
              <div key={i} data-i={i} className={cls} style={{ width: cell, height: cell }}>
                {content}
              </div>
            )
          })}
        </div>
      </div>
      {!over && (
        <p className="muted mine-hint">
          {flagMode ? '탭: 깃발 꽂기 · 길게 누르기: 열기' : '탭: 열기 · 길게 누르기(우클릭): 깃발'} · 숫자 탭: 주변 한꺼번에 열기
        </p>
      )}
    </div>
  )
}
