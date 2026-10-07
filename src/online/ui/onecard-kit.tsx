// Small helpers shared by the online card-game screens (원카드 · 도둑잡기 · 대통령 · 하트 · 블랙잭).
import { useMemo } from 'react'
import type { LogEntry } from '../../games/onecard/log'
import { fillNames } from '../games/onecard-shared'
import type { SeatInfo } from '../protocol'

export const nameOf = (seats: readonly SeatInfo[], i: number) => seats[i]?.name || `${i + 1}번`

/** Log with "{n}" placeholders replaced by seat names (and "(나)" for me). */
export function useNamedLog(log: readonly LogEntry[], seats: readonly SeatInfo[], me: number | null): LogEntry[] {
  const key = seats.map((s) => s.name).join('|')
  return useMemo(() => {
    const names = seats.map((_, i) => (i === me ? `${nameOf(seats, i)}(나)` : nameOf(seats, i)))
    return log.map((e) => ({ ...e, text: fillNames(e.text, names) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, key, me])
}

/** Other seats in table order, starting after me (spectators: everyone from seat 0). */
export function othersInOrder(n: number, me: number | null): number[] {
  return Array.from({ length: n }, (_, k) => ((me ?? -1) + 1 + k) % n).filter((i) => i !== me)
}

/** Status note for a seat chip: offline / bot marker. */
export function presence(seats: readonly SeatInfo[], i: number): string | undefined {
  return seats[i]?.connected === false ? '📴 연결 끊김' : undefined
}
