/** 하트 table: the three (or four) seat boxes around the trick. Shared by local and online play. */
import type { ReactNode } from 'react'
import { PlayingCard } from '../../cards'
import { MiniBack } from '../onecard/kit'
import type { Play } from './logic'

const POS = ['bottom', 'left', 'top', 'right'] as const

export interface HeartsSeat {
  name: string
  isAI: boolean
  count: number
  /** Points taken this hand. */
  pts: number
  total: number
  active: boolean
  note?: ReactNode
}

export function HeartsBoard({
  seats,
  base,
  hide,
  trick,
  winner,
  center,
}: {
  seats: HeartsSeat[]
  /** Seat shown at the bottom. */
  base: number
  /** Seat whose box is not drawn (the local player, shown below the table). */
  hide: number | null
  trick: readonly Play[]
  /** Seat taking the trick shown (highlighted), or -1. */
  winner: number
  /** Shown in the middle when no cards are on the table. */
  center: ReactNode
}) {
  return (
    <div className="hearts-board">
      {[0, 1, 2, 3]
        .filter((p) => p !== hide)
        .map((p) => {
          const s = seats[p]
          const rel = (p - base + 4) % 4
          return (
            <div
              key={p}
              className={`hearts-seat ${POS[rel]} ${s.active ? 'active' : ''}`}
              style={{ borderColor: `var(--p${p + 1})` }}
            >
              <span className="hearts-seat-name">
                {s.isAI ? '🤖' : '🙂'} {s.name}
              </span>
              <span className="hearts-seat-stats">
                <MiniBack count={s.count} />
                <span className="hearts-pts" title="이번 판 점수">
                  ♥{s.pts}
                </span>
                <span className="hearts-total" title="총점">
                  총{s.total}
                </span>
              </span>
              {s.note}
            </div>
          )
        })}
      <div className="hearts-trick">
        {trick.map((t) => {
          const rel = (t.p - base + 4) % 4
          return (
            <div key={t.card.id} className={`hearts-tcard ${POS[rel]} ${t.p === winner ? 'win' : ''}`}>
              <PlayingCard card={t.card} width={48} />
            </div>
          )
        })}
        {trick.length === 0 && <div className="hearts-center-info">{center}</div>}
      </div>
    </div>
  )
}

/** Score table (best first). */
export function HeartsScores({
  order,
  label,
  lastHand,
  scores,
  win,
}: {
  order: number[]
  label: (p: number) => ReactNode
  lastHand: number[] | null
  scores: number[]
  /** Highlighted rows (winners, once the game is over). */
  win: number[]
}) {
  return (
    <table className="hearts-scores">
      <thead>
        <tr>
          <th>이름</th>
          <th>이번 판</th>
          <th>총점</th>
        </tr>
      </thead>
      <tbody>
        {order.map((p) => (
          <tr key={p} className={win.includes(p) ? 'win' : ''}>
            <td>{label(p)}</td>
            <td>+{lastHand?.[p] ?? 0}</td>
            <td>
              <strong>{scores[p]}</strong>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
