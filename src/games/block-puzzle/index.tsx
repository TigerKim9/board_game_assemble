import { useEffect, useMemo, useRef, useState } from 'react'
import { Result } from '../../components/Result'
import { useBestScore, useStored } from '../../lib/storage'
import { Celebration, Stat, StatBar } from '../minesweeper/puzzleKit'
import { canPlace, fitsAnywhere, linesAfter, newGame, place, shapeSize, type Piece, type State } from './logic'
import './block-puzzle.css'

export default function BlockPuzzle() {
  const [size, setSize] = useStored<number>('block-puzzle:size', 8)
  return (
    <div className="bp-wrap">
      <div className="segmented bp-size">
        {[8, 9].map((n) => (
          <button key={n} className={size === n ? 'active' : ''} onClick={() => setSize(n)}>
            {n}×{n}
          </button>
        ))}
      </div>
      <Play key={size} size={size} />
    </div>
  )
}

interface Drag {
  idx: number
  x: number
  y: number
  pointerId: number
  touch: boolean
  /** Board geometry measured when the drag started. */
  ox: number
  oy: number
  pitch: number
}

interface Pop {
  key: number
  text: string
  sub?: string
}

function Play({ size }: { size: number }) {
  const [save, setSave] = useStored<State | null>(`block-puzzle:save:${size}`, null)
  const [s, setS] = useState<State>(() => (save && !save.over && save.size === size ? save : newGame(size)))
  const { best, submit } = useBestScore(`block-puzzle:${size}`)
  const startBest = useRef(best ?? 0)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [flash, setFlash] = useState<{ cells: Map<number, number>; key: number } | null>(null)
  const [pop, setPop] = useState<Pop | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSave(s.over ? null : s)
    if (s.score > 0) submit(s.score)
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 450)
    return () => clearTimeout(t)
  }, [flash])
  useEffect(() => {
    if (!pop) return
    const t = setTimeout(() => setPop(null), 1100)
    return () => clearTimeout(t)
  }, [pop])

  const piece: Piece | null = drag ? s.tray[drag.idx] : null

  // Where the dragged piece would land.
  const target = useMemo(() => {
    if (!drag || !piece) return null
    const { h, w } = shapeSize(piece.shape)
    const left = drag.x - (w * drag.pitch) / 2
    const top = drag.touch ? drag.y - h * drag.pitch - 48 : drag.y - (h * drag.pitch) / 2
    const c0 = Math.round((left - drag.ox) / drag.pitch)
    const r0 = Math.round((top - drag.oy) / drag.pitch)
    const ok = canPlace(s.board, s.size, piece.shape, r0, c0)
    return { left, top, r0, c0, ok }
  }, [drag, piece, s.board, s.size])

  const preview = useMemo(() => {
    const cells = new Set<number>()
    const clear = new Set<number>()
    if (!target?.ok || !piece) return { cells, clear }
    for (const [r, c] of piece.shape) cells.add((target.r0 + r) * s.size + target.c0 + c)
    const { rows, cols } = linesAfter(s.board, s.size, piece.shape, target.r0, target.c0)
    for (const r of rows) for (let k = 0; k < s.size; k++) clear.add(r * s.size + k)
    for (const c of cols) for (let k = 0; k < s.size; k++) clear.add(k * s.size + c)
    return { cells, clear }
  }, [target, piece, s.board, s.size])

  const onDown = (idx: number) => (e: React.PointerEvent) => {
    if (s.over || !s.tray[idx] || drag) return
    const board = boardRef.current
    if (!board) return
    const cells = board.querySelectorAll<HTMLElement>('.bp-cell')
    const a = cells[0].getBoundingClientRect()
    const b = cells[1].getBoundingClientRect()
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
    setDrag({
      idx,
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
      touch: e.pointerType !== 'mouse',
      ox: a.left,
      oy: a.top,
      pitch: b.left - a.left,
    })
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    setDrag({ ...drag, x: e.clientX, y: e.clientY })
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    const t = target
    setDrag(null)
    if (!t?.ok) return
    const res = place(s, drag.idx, t.r0, t.c0)
    if (!res) return
    if (res.cleared.length) {
      setFlash({ cells: new Map(res.cleared.map((i) => [i, s.board[i] || s.tray[drag.idx]!.color])), key: Date.now() })
      setPop({
        key: Date.now(),
        text: res.allClear ? '✨ 올 클리어!' : res.lines >= 3 ? '대단해요!' : res.lines === 2 ? '좋아요!' : '+' + res.gained,
        sub: res.combo > 1 ? `콤보 ×${res.combo}` : res.allClear || res.lines >= 2 ? `+${res.gained}` : undefined,
      })
      navigator.vibrate?.(30)
    }
    setS(res.state)
  }
  const onCancel = () => setDrag(null)

  const restart = () => {
    startBest.current = Math.max(startBest.current, s.score)
    setDrag(null)
    setS(newGame(size))
  }

  const newRecord = s.over && s.score > startBest.current
  const draggedSize = piece ? shapeSize(piece.shape) : null

  return (
    <>
      {newRecord && <Celebration />}
      <StatBar>
        <Stat label="점수" value={s.score} />
        <Stat label="최고" value={Math.max(best ?? 0, s.score)} highlight />
        <Stat label="지운 줄" value={s.lines} />
        {s.streak > 1 && <Stat label="콤보" value={`×${s.streak}`} />}
      </StatBar>

      {s.over && (
        <Result title={newRecord ? '🏆 새 최고 기록!' : '더 놓을 곳이 없어요'} onAgain={restart}>
          <p>
            점수 <strong>{s.score}</strong> · 지운 줄 <strong>{s.lines}</strong>
          </p>
        </Result>
      )}

      <div className="bp-board-wrap">
        <div ref={boardRef} className="bp-board" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
          {s.board.map((v, i) => {
            const fl = flash?.cells.get(i)
            let cls = 'bp-cell'
            let color = v
            if (preview.cells.has(i)) {
              cls += ' ghost'
              color = piece!.color
            }
            if (preview.clear.has(i)) cls += ' willclear'
            if (fl) {
              cls += ' flash'
              color = fl
            }
            return <div key={fl ? `f${flash!.key}-${i}` : i} className={`${cls} ${color ? `c${color}` : ''}`} />
          })}
        </div>
        {pop && (
          <div key={pop.key} className="bp-pop">
            <strong>{pop.text}</strong>
            {pop.sub && <span>{pop.sub}</span>}
          </div>
        )}
      </div>

      <div className="bp-tray">
        {s.tray.map((p, idx) => {
          const fits = p ? fitsAnywhere(s.board, s.size, p.shape) : false
          const dragging = drag?.idx === idx
          return (
            <div
              key={p ? p.id : `empty${idx}`}
              className={`bp-slot ${p && !fits ? 'nofit' : ''} ${dragging ? 'dragging' : ''}`}
              onPointerDown={onDown(idx)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onCancel}
            >
              {p && <Mini piece={p} />}
            </div>
          )
        })}
      </div>
      <p className="muted bp-hint">아래 블록을 끌어다 판에 놓으세요. 가로나 세로 한 줄을 꽉 채우면 사라져요!</p>
      <div className="btn-row">
        <button className="btn small ghost" onClick={restart}>
          🔄 새 게임
        </button>
      </div>

      {drag && piece && target && draggedSize && (
        <div
          className="bp-drag"
          style={{
            left: target.left,
            top: target.top,
            width: draggedSize.w * drag.pitch,
            height: draggedSize.h * drag.pitch,
          }}
        >
          {piece.shape.map(([r, c], k) => (
            <div
              key={k}
              className={`bp-cell c${piece.color}`}
              style={{ left: c * drag.pitch, top: r * drag.pitch, width: drag.pitch - 2, height: drag.pitch - 2 }}
            />
          ))}
        </div>
      )}
    </>
  )
}

function Mini({ piece }: { piece: Piece }) {
  const { h, w } = shapeSize(piece.shape)
  return (
    <div className="bp-mini" style={{ gridTemplateColumns: `repeat(${w}, var(--mini))`, gridTemplateRows: `repeat(${h}, var(--mini))` }}>
      {piece.shape.map(([r, c], k) => (
        <div key={k} className={`bp-cell c${piece.color}`} style={{ gridRow: r + 1, gridColumn: c + 1 }} />
      ))}
    </div>
  )
}
