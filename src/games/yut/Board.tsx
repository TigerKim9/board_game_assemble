import { useState } from 'react'
import { DONE, OFF, legalMoves, stackOf, type GameState, type Move } from './logic'

export const COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)']
export const TOKENS = ['🐯', '🐰', '🐻', '🐶']

// Node coordinates on a 100×100 board.
const NODE_XY: Record<number, [number, number]> = (() => {
  const xy: Record<number, [number, number]> = {}
  const step = 16
  xy[0] = [90, 90]
  for (let k = 1; k <= 4; k++) xy[k] = [90, 90 - step * k]
  xy[5] = [90, 10]
  for (let k = 1; k <= 4; k++) xy[5 + k] = [90 - step * k, 10]
  xy[10] = [10, 10]
  for (let k = 1; k <= 4; k++) xy[10 + k] = [10, 10 + step * k]
  xy[15] = [10, 90]
  for (let k = 1; k <= 4; k++) xy[15 + k] = [10 + step * k, 90]
  const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ]
  xy[20] = lerp([90, 10], [50, 50], 1 / 3)
  xy[21] = lerp([90, 10], [50, 50], 2 / 3)
  xy[22] = [50, 50]
  xy[23] = lerp([50, 50], [10, 90], 1 / 3)
  xy[24] = lerp([50, 50], [10, 90], 2 / 3)
  xy[25] = lerp([10, 10], [50, 50], 1 / 3)
  xy[26] = lerp([10, 10], [50, 50], 2 / 3)
  xy[27] = lerp([50, 50], [90, 90], 1 / 3)
  xy[28] = lerp([50, 50], [90, 90], 2 / 3)
  return xy
})()
const BIG_NODES = new Set([0, 5, 10, 15, 22])

/** Throw/piece selection for the side to move. `human` = the viewer controls the current turn. */
export function useYutPick(state: GameState, human: boolean, doMove: (m: Move) => void) {
  const [selThrow, setSelThrow] = useState(0)
  const [selPiece, setSelPiece] = useState<number | null>(null)
  const moves = legalMoves(state)
  const activeThrow = state.pending[selThrow] ?? state.pending[0]
  const movesForThrow = moves.filter((m) => state.pending[m.throwIndex] === activeThrow)
  const movableIdx = new Set(human ? movesForThrow.flatMap((m) => stackOf(state, m.piece)) : [])
  const offMove = movesForThrow.find((m) => state.pieces[m.piece].pos === OFF)
  const selectedMove =
    selPiece != null ? movesForThrow.find((m) => stackOf(state, m.piece).includes(selPiece)) : undefined

  const clickPiece = (i: number) => {
    if (!human || !movableIdx.has(i)) return
    const m = movesForThrow.find((mm) => stackOf(state, mm.piece).includes(i))
    if (!m) return
    if (selPiece != null && stackOf(state, m.piece).includes(selPiece)) doMove(m)
    else setSelPiece(i)
  }
  return { selThrow, setSelThrow, selPiece, setSelPiece, movableIdx, offMove, selectedMove, clickPiece }
}

export type YutPick = ReturnType<typeof useYutPick>

/** The 윷판 with pieces (shared by the local and online games). */
export function YutBoard({ state, pick, onMove }: { state: GameState; pick: YutPick; onMove: (m: Move) => void }) {
  const { selectedMove, movableIdx, selPiece, clickPiece } = pick
  // Group pieces by node for rendering.
  const byNode = new Map<number, number[]>()
  state.pieces.forEach((p, i) => {
    if (p.pos === OFF || p.pos === DONE) return
    byNode.set(p.pos, [...(byNode.get(p.pos) ?? []), i])
  })
  return (
    <svg className="yut-board" viewBox="0 0 100 100">
      <rect x="2" y="2" width="96" height="96" rx="6" className="yut-bg" />
      <path d="M10 10 H90 V90 H10 Z M10 10 L90 90 M90 10 L10 90" className="yut-lines" />
      {Object.entries(NODE_XY).map(([id, [x, y]]) => {
        const n = Number(id)
        const target = selectedMove?.to === n
        return (
          <g key={id}>
            <circle
              cx={x}
              cy={y}
              r={BIG_NODES.has(n) ? 5.2 : 3.6}
              className={`yut-node ${BIG_NODES.has(n) ? 'big' : ''} ${target ? 'target' : ''}`}
              onClick={() => target && selectedMove && onMove(selectedMove)}
            />
            {n === 0 && (
              <text x={x - 9} y={y + 1} className="yut-label">
                출발
              </text>
            )}
          </g>
        )
      })}
      {selectedMove?.to === DONE && (
        <g onClick={() => onMove(selectedMove)} className="yut-finish">
          <rect x="72" y="93" width="26" height="6" rx="3" />
          <text x="85" y="97.4">
            나가기 ▶
          </text>
        </g>
      )}
      {[...byNode.entries()].map(([node, idxs]) => {
        const [x, y] = NODE_XY[node]
        const owner = state.pieces[idxs[0]].owner
        const can = idxs.some((i) => movableIdx.has(i))
        const sel = selPiece != null && idxs.includes(selPiece)
        return (
          <g
            key={node}
            className={`yut-piece ${can ? 'movable' : ''} ${sel ? 'selected' : ''}`}
            onClick={() => clickPiece(idxs[0])}
            transform={`translate(${x} ${y})`}
          >
            <circle r="4.6" fill={COLORS[owner]} />
            <text y="1.6" className="yut-token">
              {TOKENS[owner]}
            </text>
            {idxs.length > 1 && (
              <g transform="translate(3.6 -3.6)">
                <circle r="2.4" className="yut-badge" />
                <text y="0.9" className="yut-badge-text">
                  {idxs.length}
                </text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function YutSticks({ sticks, throwing }: { sticks: boolean[]; throwing: boolean }) {
  return (
    <div className={`yut-sticks ${throwing ? 'throwing' : ''}`}>
      {sticks.map((flat, i) => (
        <span key={i} className={`yut-stick ${flat ? 'flat' : 'round'} ${i === 0 ? 'marked' : ''}`} />
      ))}
    </div>
  )
}
