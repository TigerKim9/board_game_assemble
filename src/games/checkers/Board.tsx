import { useMemo, useState } from 'react'
import { isDark, isKing, jumpedAlong, legalMoves, ownerOf, type CheckersState, type Move } from './logic'

export const Token = ({ p, size = 18 }: { p: number; size?: number }) => (
  <span className={`checkers-mini p${p}`} style={{ width: size, height: size }} />
)

/** Tap-to-move selection state for the side to move: pick a piece, then each landing square of the path. */
export function useCheckersPick(s: CheckersState, live: boolean, onMove: (m: Move) => void) {
  const [path, setPath] = useState<number[]>([])
  const legal = useMemo(() => (s.over ? [] : legalMoves(s.board, s.turn)), [s])
  const mustCapture = legal.length > 0 && legal[0].captures.length > 0
  const movable = useMemo(() => new Set(legal.map((m) => m.path[0])), [legal])

  // Path is only valid for the current state.
  const [pathFor, setPathFor] = useState(s)
  if (pathFor !== s) {
    setPathFor(s)
    setPath([])
  }

  const candidates = path.length ? legal.filter((m) => path.every((p, i) => m.path[i] === p)) : []
  const targets = new Set(candidates.map((m) => m.path[path.length]).filter((x) => x != null))

  const tap = (i: number) => {
    if (!live) return
    if (targets.has(i)) {
      const next = [...path, i]
      const done = candidates.find((m) => m.path.length === next.length && m.path.every((p, k) => p === next[k]))
      if (done) onMove(done)
      else setPath(next)
      return
    }
    if (path.length <= 1 && movable.has(i)) setPath(path[0] === i ? [] : [i])
    else if (path.length > 1 && i === path[path.length - 1]) setPath([path[0]])
    else if (path.length <= 1) setPath([])
  }
  return { path, mustCapture, movable, targets, tap }
}

export type CheckersPick = ReturnType<typeof useCheckersPick>

/** Checkers board (shared by the local and online games). `flip` shows it from player 1's side. */
export function CheckersBoard({
  state: s,
  live,
  flip,
  pick,
}: {
  state: CheckersState
  live: boolean
  flip: boolean
  pick: CheckersPick
}) {
  const { path, movable, targets, tap } = pick
  // Display: move the selected piece along the partial path and fade jumped pieces.
  const displayIds = s.ids.slice()
  const displayBoard = s.board.slice()
  if (path.length > 1) {
    const from = path[0]
    const to = path[path.length - 1]
    displayIds[to] = displayIds[from]
    displayBoard[to] = displayBoard[from]
    displayIds[from] = 0
    displayBoard[from] = 0
  }
  const fading = new Set(path.length > 1 ? jumpedAlong(path) : [])
  const lastSquares = new Set(s.last ? s.last.path : [])
  const lastCaps = new Set(s.last ? s.last.captures : [])

  const view = (i: number) => (flip ? 63 - i : i)
  const pieces: { id: number; sq: number; p: number }[] = []
  displayIds.forEach((id, sq) => id && pieces.push({ id, sq, p: displayBoard[sq] }))
  pieces.sort((a, b) => a.id - b.id)

  return (
    <div className="checkers-board" role="grid" aria-label="체커 판">
      {Array.from({ length: 64 }, (_, v) => {
        const i = view(v)
        const dark = isDark(i)
        const cls = [
          'checkers-sq',
          dark ? 'dark' : 'light',
          lastSquares.has(i) ? 'last' : '',
          lastCaps.has(i) ? 'captured' : '',
          targets.has(i) ? 'target' : '',
          live && !path.length && movable.has(i) ? 'movable' : '',
          path[0] === i ? 'selected' : '',
          path.includes(i) && path[0] !== i ? 'via' : '',
        ].join(' ')
        return (
          <button key={v} className={cls} disabled={!dark} onClick={() => tap(i)} aria-label={`${(i >> 3) + 1}행 ${(i & 7) + 1}열`}>
            {targets.has(i) && <span className="checkers-dot" />}
          </button>
        )
      })}
      {pieces.map(({ id, sq, p }) => {
        const v = view(sq)
        const owner = ownerOf(p as 0)
        return (
          <span
            key={id}
            className={`checkers-piece p${owner} ${isKing(p as 0) ? 'king' : ''} ${fading.has(sq) ? 'fading' : ''} ${
              path[path.length - 1] === sq && path.length ? 'lifted' : ''
            }`}
            style={{ left: `${(v & 7) * 12.5}%`, top: `${(v >> 3) * 12.5}%` }}
          >
            <span className="checkers-disc">{isKing(p as 0) && '♛'}</span>
          </span>
        )
      })}
    </div>
  )
}
