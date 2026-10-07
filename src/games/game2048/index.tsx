import { useEffect, useRef, useState } from 'react'
import { Result } from '../../components/Result'
import { useBestScore, useStored } from '../../lib/storage'
import { Celebration, Stat, StatBar } from '../minesweeper/puzzleKit'
import { GOAL, maxTile, move, newGame, settle, type Dir, type State } from './logic'
import './game2048.css'

const UNDOS = 3

interface Save {
  state: State
  prev: State | null
  undos: number
}

const fresh = (size: number): Save => ({ state: newGame(size), prev: null, undos: UNDOS })

export default function Game2048() {
  const [size, setSize] = useStored<number>('game2048:size', 4)
  return (
    <div className="g2048-wrap">
      <div className="segmented g2048-size">
        {[4, 5].map((n) => (
          <button key={n} className={size === n ? 'active' : ''} onClick={() => setSize(n)}>
            {n}×{n}
          </button>
        ))}
      </div>
      <Play key={size} size={size} />
    </div>
  )
}

const KEYS: Record<string, Dir> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  a: 'left',
  d: 'right',
  w: 'up',
  s: 'down',
}

function Play({ size }: { size: number }) {
  const [save, setSave] = useStored<Save | null>(`game2048:save:${size}`, null)
  const [g, setG] = useState<Save>(() => (save && !save.state.over ? { ...save, state: settle(save.state) } : fresh(size)))
  const { best, submit } = useBestScore(`game2048:${size}`)
  const startBest = useRef(best ?? 0)
  const [bump, setBump] = useState<{ n: number; key: number } | null>(null)
  const { state } = g
  const showWin = state.won && !state.keepGoing

  useEffect(() => {
    setSave(g.state.over ? null : g)
    if (g.state.score > 0) submit(g.state.score)
  }, [g]) // eslint-disable-line react-hooks/exhaustive-deps

  // Latest state for rapid key repeats / swipes that arrive before a re-render.
  const gRef = useRef(g)
  gRef.current = g
  const doMove = (dir: Dir) => {
    const cur = gRef.current
    if (cur.state.won && !cur.state.keepGoing) return
    const next = move(cur.state, dir)
    if (!next) return
    const gained = next.score - cur.state.score
    if (gained > 0) setBump({ n: gained, key: next.moves })
    const ng = { ...cur, state: next, prev: settle(cur.state) }
    gRef.current = ng
    setG(ng)
  }

  const undo = () =>
    setG((cur) => (cur.prev && cur.undos > 0 ? { state: cur.prev, prev: null, undos: cur.undos - 1 } : cur))

  const restart = () => {
    startBest.current = Math.max(startBest.current, state.score, best ?? 0)
    setG(fresh(size))
  }

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const dir = KEYS[e.key] ?? KEYS[e.key.toLowerCase()]
      if (!dir) return
      e.preventDefault()
      doMove(dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Swipe
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
  }
  const onUp = (e: React.PointerEvent) => {
    const s = start.current
    start.current = null
    if (!s || s.id !== e.pointerId) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
  }

  const top = maxTile(state)
  const newRecord = state.over && state.score > startBest.current

  return (
    <>
      {showWin && <Celebration />}
      <StatBar>
        <Stat label="점수" value={<span className="g2048-score">{state.score}{bump && <em key={bump.key} className="g2048-bump">+{bump.n}</em>}</span>} />
        <Stat label="최고" value={Math.max(best ?? 0, state.score)} highlight />
        <Stat label="최대 타일" value={top} />
      </StatBar>

      {state.over && (
        <Result title={newRecord ? '🏆 새 최고 기록!' : '더 이상 움직일 수 없어요'} onAgain={restart} againLabel="새 게임">
          <p>
            점수 <strong>{state.score}</strong> · 최대 타일 <strong>{top}</strong>
          </p>
          {g.prev && g.undos > 0 && (
            <button className="btn accent" onClick={undo}>
              ↶ 한 수 되돌리기 ({g.undos}회 남음)
            </button>
          )}
        </Result>
      )}

      <div
        className={`g2048-board n${size}`}
        style={{ ['--n' as string]: size }}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={() => (start.current = null)}
      >
        {Array.from({ length: size * size }, (_, i) => (
          <div key={`bg${i}`} className="g2048-cell" style={pos(Math.floor(i / size), i % size)} />
        ))}
        {state.tiles.map((t) => (
          <div
            key={t.id}
            className={`g2048-tile v${Math.min(t.v, 8192)} d${String(t.v).length} ${t.merged ? 'merged' : ''} ${t.isNew ? 'new' : ''} ${t.dead ? 'dead' : ''}`}
            style={pos(t.r, t.c)}
          >
            <span>{t.v}</span>
          </div>
        ))}
        {showWin && (
          <div className="g2048-overlay">
            <strong>🎉 {GOAL} 달성!</strong>
            <div className="btn-row">
              <button
                className="btn primary"
                onClick={() => setG((cur) => ({ ...cur, state: { ...cur.state, keepGoing: true } }))}
              >
                계속하기
              </button>
              <button className="btn" onClick={restart}>
                새 게임
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="btn-row">
        <button className="btn" onClick={undo} disabled={!g.prev || g.undos <= 0 || state.over}>
          ↶ 되돌리기 ({g.undos})
        </button>
        <button className="btn" onClick={restart}>
          🔄 새 게임
        </button>
      </div>
      <p className="muted g2048-hint">판을 밀거나 방향키로 타일을 움직여 같은 숫자를 합치세요!</p>
    </>
  )
}

function pos(r: number, c: number): React.CSSProperties {
  return { ['--r' as string]: r, ['--c' as string]: c }
}
