import { useEffect, useMemo, useRef, useState } from 'react'
import { Result } from '../../components/Result'
import { useBestScore, useStored } from '../../lib/storage'
import { Celebration, Stat, StatBar, formatTime, useTicker } from '../minesweeper/puzzleKit'
import {
  THEMES,
  isSolved,
  movable,
  pictureUrl,
  scramble,
  slideDir,
  slideFrom,
  type Dir,
  type Theme,
  type Tiles,
} from './logic'
import './fifteen.css'

interface Game {
  size: number
  tiles: Tiles
  moves: number
  time: number
  started: boolean
  won: boolean
  theme: Theme
  seed: number
  history: { tiles: Tiles; moves: number }[]
}

function fresh(size: number): Game {
  return {
    size,
    tiles: scramble(size),
    moves: 0,
    time: 0,
    started: false,
    won: false,
    theme: THEMES[Math.floor(Math.random() * THEMES.length)],
    seed: Math.floor(Math.random() * 1e9),
    history: [],
  }
}

export default function Fifteen() {
  const [size, setSize] = useStored<number>('fifteen:size', 4)
  const [picture, setPicture] = useStored('fifteen:picture', false)
  return (
    <div className="fifteen-wrap">
      <div className="fifteen-top">
        <div className="segmented">
          {[3, 4, 5].map((n) => (
            <button key={n} className={size === n ? 'active' : ''} onClick={() => setSize(n)}>
              {n}×{n}
            </button>
          ))}
        </div>
        <div className="segmented">
          <button className={!picture ? 'active' : ''} onClick={() => setPicture(false)}>
            🔢 숫자
          </button>
          <button className={picture ? 'active' : ''} onClick={() => setPicture(true)}>
            🖼️ 그림
          </button>
        </div>
      </div>
      <Play key={size} size={size} picture={picture} />
    </div>
  )
}

const KEYS: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }

function Play({ size, picture }: { size: number; picture: boolean }) {
  const [save, setSave] = useStored<Game | null>(`fifteen:save:${size}`, null)
  const [g, setG] = useState<Game>(() => (save && !save.won && save.size === size ? save : fresh(size)))
  const bestTime = useBestScore(`fifteen:${size}:time`, true)
  const bestMoves = useBestScore(`fifteen:${size}:moves`, true)
  const [records, setRecords] = useState({ time: false, moves: false })
  const [peek, setPeek] = useState(false)

  useTicker(g.started && !g.won, () => setG((s) => ({ ...s, time: s.time + 1 })))

  useEffect(() => {
    setSave(g.won ? null : g)
  }, [g]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (g.won) setRecords({ time: bestTime.submit(g.time), moves: bestMoves.submit(g.moves) })
  }, [g.won]) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (res: { tiles: Tiles; moved: number } | null) => {
    if (!res) return
    setG((s) => {
      if (s.won) return s
      const won = isSolved(res.tiles)
      return {
        ...s,
        tiles: res.tiles,
        moves: s.moves + res.moved,
        started: true,
        won,
        history: [...s.history, { tiles: s.tiles, moves: s.moves }].slice(-200),
      }
    })
  }

  const gRef = useRef(g)
  gRef.current = g
  const tap = (idx: number) => {
    const s = gRef.current
    if (s.won) return
    apply(slideFrom(s.tiles, s.size, idx))
  }

  const undo = () =>
    setG((s) => {
      const last = s.history[s.history.length - 1]
      if (!last || s.won) return s
      return { ...s, tiles: last.tiles, moves: last.moves, history: s.history.slice(0, -1) }
    })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = KEYS[e.key]
      if (!dir) return
      e.preventDefault()
      const s = gRef.current
      if (!s.won) apply(slideDir(s.tiles, s.size, dir))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Swipe anywhere on the board also works (moves the tile next to the blank).
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY }
  }
  const onUp = (e: React.PointerEvent) => {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) {
      const t = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null
      if (t) tap(Number(t.dataset.i))
      return
    }
    const st = gRef.current
    if (st.won) return
    apply(slideDir(st.tiles, st.size, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'))
  }

  const can = useMemo(() => movable(g.tiles, g.size), [g.tiles, g.size])
  const bg = useMemo(() => pictureUrl(g.theme, g.seed), [g.theme, g.seed])
  const restart = () => {
    setRecords({ time: false, moves: false })
    setG(fresh(size))
  }

  // Position of each tile number (0 = blank) for absolute layout.
  const order = useMemo(() => {
    const pos: number[] = []
    g.tiles.forEach((v, i) => (pos[v] = i))
    return pos
  }, [g.tiles])

  return (
    <>
      {g.won && <Celebration />}
      <StatBar>
        <Stat label="이동" value={g.moves} />
        <Stat label="시간" value={formatTime(g.time)} />
        <Stat
          label="최고"
          value={bestTime.best == null ? '—' : `${formatTime(bestTime.best)} · ${bestMoves.best}수`}
          highlight
        />
      </StatBar>

      {g.won && (
        <Result title={`🎉 완성! ${g.moves}수 · ${formatTime(g.time)}`} onAgain={restart} againLabel="새로 섞기">
          {(records.time || records.moves) && (
            <p>
              🏆 새 기록! {records.time && '최단 시간'} {records.time && records.moves && '·'} {records.moves && '최소 이동'}
            </p>
          )}
        </Result>
      )}

      <div
        className={`fifteen-board s${size} ${picture ? 'pic' : ''} ${g.won ? 'won' : ''}`}
        style={{ ['--n' as string]: size, ['--img' as string]: bg }}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        {order.map((idx, v) => {
          if (v === 0 && !g.won) return null
          const home = v === 0 ? size * size - 1 : v - 1
          const r = Math.floor(idx / size)
          const c = idx % size
          const hr = Math.floor(home / size)
          const hc = home % size
          return (
            <div
              key={v}
              data-i={idx}
              className={`fifteen-tile ${can.has(idx) && !g.won ? 'can' : ''} ${idx === home ? 'home' : ''} ${v === 0 ? 'last' : ''}`}
              style={{
                ['--r' as string]: r,
                ['--c' as string]: c,
                ['--hr' as string]: hr,
                ['--hc' as string]: hc,
              }}
            >
              {v !== 0 && <span className="fifteen-num">{v}</span>}
            </div>
          )
        })}
        {picture && peek && <div className="fifteen-peek" />}
      </div>

      <div className="btn-row">
        <button className="btn" onClick={undo} disabled={!g.history.length || g.won}>
          ↶ 되돌리기
        </button>
        {picture && (
          <button
            className="btn"
            onPointerDown={() => setPeek(true)}
            onPointerUp={() => setPeek(false)}
            onPointerLeave={() => setPeek(false)}
            onPointerCancel={() => setPeek(false)}
          >
            👀 완성 그림
          </button>
        )}
        <button className="btn" onClick={restart}>
          🔀 새로 섞기
        </button>
      </div>
      <p className="muted fifteen-hint">빈칸과 같은 줄에 있는 타일을 누르면 여러 칸이 한꺼번에 밀려요. 방향키나 밀기도 돼요.</p>
    </>
  )
}
