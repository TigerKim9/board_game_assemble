import { useMemo, useRef, useState } from 'react'
import { SIZE, candidates, coord, isForbidden, stoneOf, type GomokuState } from './logic'

const STARS = [
  [3, 3],
  [3, 11],
  [7, 7],
  [11, 3],
  [11, 11],
]

interface Props {
  state: GomokuState
  /** The local player may place a stone now. */
  live: boolean
  onPlay: (cell: number) => void
  /** Status line for the current player while it's their turn (before any preview). */
  idleText: string
  /** Status line otherwise (opponent's turn, game over …). */
  status: string
}

/** Gomoku board with tap-to-preview / tap-again-to-place on touch and one-click placing with a mouse. */
export function GomokuBoard({ state: s, live, onPlay, idleText, status }: Props) {
  const [preview, setPreview] = useState<number | null>(null)
  const [mouse, setMouse] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const color = stoneOf(s.turn)
  const over = s.over

  // Drop the preview whenever the position changes.
  const [previewFor, setPreviewFor] = useState(s)
  if (previewFor !== s) {
    setPreviewFor(s)
    setPreview(null)
  }

  const forbidden = useMemo(() => {
    if (s.rule !== 'renju' || !live || color !== 1) return []
    return candidates(s.board).filter((i) => isForbidden(s, i, 1))
  }, [s, live, color])
  const forbiddenSet = new Set(forbidden)
  const winSet = new Set(s.winLine ?? [])

  const pointAt = (clientX: number, clientY: number): number | null => {
    const el = svgRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const c = Math.floor(((clientX - rect.left) / rect.width) * SIZE)
    const r = Math.floor(((clientY - rect.top) / rect.height) * SIZE)
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null
    return r * SIZE + c
  }
  const canPlace = (i: number) => live && s.board[i] === 0 && !forbiddenSet.has(i)

  const onTap = (e: React.MouseEvent) => {
    if (!live) return
    const i = pointAt(e.clientX, e.clientY)
    if (i == null || s.board[i] !== 0) return
    if (forbiddenSet.has(i)) {
      setPreview(i)
      return
    }
    // Mouse: one click places. Touch: first tap previews, second tap on the same point places.
    if (mouse || preview === i) onPlay(i)
    else setPreview(i)
  }

  let text = status
  if (live) {
    if (preview != null && forbiddenSet.has(preview)) text = '흑은 33(열린 삼 두 개)을 만들 수 없어요!'
    else if (preview != null) text = `${coord(preview)} — 한 번 더 누르면 놓여요`
    else text = idleText
  }

  const p = (i: number) => ({ x: (i % SIZE) + 0.5, y: Math.floor(i / SIZE) + 0.5 })

  return (
    <>
      <div className="status gomoku-status">{over ? '게임 끝!' : text}</div>
      <div className="gomoku-wrap">
        <svg
          ref={svgRef}
          className={`gomoku-board ${live ? 'live' : ''}`}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          onPointerDown={(e) => setMouse(e.pointerType === 'mouse')}
          onPointerMove={(e) => {
            if (e.pointerType !== 'mouse' || !live) return
            const i = pointAt(e.clientX, e.clientY)
            setPreview(i != null && s.board[i] === 0 ? i : null)
          }}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setPreview(null)}
          onClick={onTap}
          role="grid"
          aria-label="오목판"
        >
          <defs>
            <radialGradient id="gomoku-black" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#666" />
              <stop offset="60%" stopColor="#111" />
            </radialGradient>
            <radialGradient id="gomoku-white" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#fff" />
              <stop offset="75%" stopColor="#d6d2c6" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width={SIZE} height={SIZE} className="gomoku-wood" />
          {Array.from({ length: SIZE }, (_, k) => (
            <g key={k} className="gomoku-line">
              <line x1={0.5} y1={k + 0.5} x2={SIZE - 0.5} y2={k + 0.5} />
              <line x1={k + 0.5} y1={0.5} x2={k + 0.5} y2={SIZE - 0.5} />
            </g>
          ))}
          {STARS.map(([r, c]) => (
            <circle key={`${r}-${c}`} cx={c + 0.5} cy={r + 0.5} r={0.11} className="gomoku-star" />
          ))}
          {preview != null && canPlace(preview) && (
            <g className="gomoku-cross">
              <line x1={0.5} y1={p(preview).y} x2={SIZE - 0.5} y2={p(preview).y} />
              <line x1={p(preview).x} y1={0.5} x2={p(preview).x} y2={SIZE - 0.5} />
            </g>
          )}
          {s.board.map((c, i) =>
            c ? (
              <circle
                key={i}
                cx={p(i).x}
                cy={p(i).y}
                r={0.45}
                fill={c === 1 ? 'url(#gomoku-black)' : 'url(#gomoku-white)'}
                className={`gomoku-stone ${c === 1 ? 'black' : 'white'} ${s.last === i ? 'placed' : ''} ${
                  winSet.has(i) ? 'win' : ''
                }`}
              />
            ) : null,
          )}
          {forbidden.map((i) => (
            <text key={i} x={p(i).x} y={p(i).y + 0.17} className="gomoku-forbid">
              ✕
            </text>
          ))}
          {preview != null && canPlace(preview) && (
            <circle
              cx={p(preview).x}
              cy={p(preview).y}
              r={0.45}
              fill={color === 1 ? 'url(#gomoku-black)' : 'url(#gomoku-white)'}
              className="gomoku-ghost"
            />
          )}
          {s.last != null && !over && <circle cx={p(s.last).x} cy={p(s.last).y} r={0.13} className="gomoku-lastdot" />}
        </svg>
      </div>
      {live && preview != null && canPlace(preview) && !mouse && (
        <button className="btn primary gomoku-place" onClick={() => onPlay(preview)}>
          {coord(preview)}에 두기
        </button>
      )}
    </>
  )
}
