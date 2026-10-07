import { useMemo } from 'react'
import { colorOf, legalMoves, type OthelloState } from './logic'

export const Disc = ({ c, size = 18 }: { c: 1 | 2; size?: number }) => (
  <span className={`othello-mini ${c === 1 ? 'black' : 'white'}`} style={{ width: size, height: size }} />
)

/** Othello board (shared by the local and online games). `live` = the viewer may place a disc now. */
export function OthelloBoard({
  state: s,
  live,
  hints,
  onPlay,
}: {
  state: OthelloState
  live: boolean
  hints: boolean
  onPlay: (idx: number) => void
}) {
  const legal = useMemo(() => (s.over ? [] : legalMoves(s.board, colorOf(s.turn))), [s])
  const legalSet = useMemo(() => new Set(legal), [legal])
  const flippedSet = useMemo(() => new Set(s.flipped), [s])
  return (
    <div className="othello-board" role="grid" aria-label="오델로 판">
      {s.board.map((c, i) => {
        const can = live && legalSet.has(i)
        return (
          <button
            key={i}
            className={`othello-cell ${can ? 'can' : ''}`}
            disabled={!can}
            aria-label={`${(i >> 3) + 1}행 ${(i & 7) + 1}열`}
            onClick={() => can && onPlay(i)}
          >
            {c !== 0 && (
              <span
                key={`${i}-${s.moveNo}-${c}`}
                className={`othello-disc ${c === 1 ? 'black' : 'white'} ${flippedSet.has(i) ? 'flip' : ''} ${
                  s.last === i ? 'placed' : ''
                }`}
              />
            )}
            {s.last === i && <span className="othello-last" />}
            {c === 0 && can && hints && <span className="othello-hint" />}
          </button>
        )
      })}
    </div>
  )
}
