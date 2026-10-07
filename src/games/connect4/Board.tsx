import { useState } from 'react'
import { COLS, dropRow, type C4State } from './logic'

export const Chip = ({ p, size = 18 }: { p: number; size?: number }) => (
  <span className={`connect4-mini p${p}`} style={{ width: size, height: size }} />
)

/** Connect-four board (shared by the local and online games). `live` = the viewer may drop a disc now. */
export function Connect4Board({ state: s, live, onDrop }: { state: C4State; live: boolean; onDrop: (col: number) => void }) {
  const [hover, setHover] = useState<number | null>(null)
  const winSet = new Set(s.winLine ?? [])
  const lastRow = s.last != null ? Math.floor(s.last / COLS) : 0
  const drop = (col: number) => {
    if (!live || dropRow(s.board, col) < 0) return
    onDrop(col)
  }
  return (
    <div className="connect4-wrap" onPointerLeave={() => setHover(null)}>
      <div className="connect4-preview" aria-hidden>
        {Array.from({ length: COLS }, (_, c) => (
          <span key={c} className="connect4-slot">
            {live && hover === c && dropRow(s.board, c) >= 0 && <Chip p={s.turn} size={0} />}
          </span>
        ))}
      </div>
      <div className="connect4-board" role="grid" aria-label="사목 판">
        {s.board.map((cell, i) => {
          const col = i % COLS
          const isLast = s.last === i
          return (
            <button
              key={i}
              className={`connect4-cell ${live && dropRow(s.board, col) >= 0 ? 'can' : ''} ${hover === col && live ? 'hover' : ''}`}
              aria-label={`${col + 1}번째 줄`}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(col)}
              onClick={() => drop(col)}
            >
              {cell !== 0 && (
                <span
                  key={isLast ? `d${s.moveNo}` : 'd'}
                  className={`connect4-disc p${cell - 1} ${isLast ? 'drop' : ''} ${winSet.has(i) ? 'win' : ''}`}
                  style={isLast ? ({ '--r': lastRow + 1 } as React.CSSProperties) : undefined}
                />
              )}
              {isLast && !s.over && <span className="connect4-lastmark" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
