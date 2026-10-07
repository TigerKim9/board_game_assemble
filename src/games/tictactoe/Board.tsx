import type { TttState } from './logic'

export function Mark({ p, size = 18 }: { p: number; size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`tictactoe-mark p${p}`} aria-label={p === 0 ? '동그라미' : '가위표'}>
      {p === 0 ? (
        <circle cx="50" cy="50" r="32" pathLength={100} />
      ) : (
        <>
          <line x1="22" y1="22" x2="78" y2="78" pathLength={100} />
          <line x1="78" y1="22" x2="22" y2="78" pathLength={100} className="second" />
        </>
      )}
    </svg>
  )
}

/** Tic-tac-toe board (shared by the local and online games). `live` = the viewer may mark a cell now. */
export function TttBoard({ state: s, live, onPlay }: { state: TttState; live: boolean; onPlay: (i: number) => void }) {
  const winSet = new Set(s.winLine ?? [])
  return (
    <div className={`tictactoe-board ${s.winLine ? 'won' : ''}`}>
      {s.board.map((c, i) => (
        <button
          key={i}
          className={`tictactoe-cell ${winSet.has(i) ? 'win' : ''} ${s.last === i ? 'last' : ''}`}
          disabled={!live || c !== 0}
          aria-label={`${Math.floor(i / 3) + 1}행 ${(i % 3) + 1}열`}
          onClick={() => onPlay(i)}
        >
          {c !== 0 && <Mark p={c - 1} size={0} />}
        </button>
      ))}
    </div>
  )
}
