import type { ReactNode } from 'react'
import type { SeatInfo } from '../protocol'

/** Players row for online games: highlights whose turn it is and who is offline. */
export function SeatBar({
  seats,
  active,
  you,
  icons,
  extra,
}: {
  seats: SeatInfo[]
  active: number[]
  you: number | null
  icons?: ReactNode[]
  extra?: (seat: number) => ReactNode
}) {
  return (
    <div className="players-bar">
      {seats.map((s) => (
        <span
          key={s.seat}
          className={`player-chip ${active.includes(s.seat) ? 'active' : ''} ${s.connected === false ? 'online-away' : ''}`}
        >
          {icons?.[s.seat]} {s.bot ? '🤖 ' : ''}
          {s.name}
          {s.seat === you && ' (나)'}
          {s.connected === false && ' 📴'}
          {extra?.(s.seat)}
        </span>
      ))}
    </div>
  )
}
