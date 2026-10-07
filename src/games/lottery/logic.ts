import { shuffle } from '../../lib/random'

export const MIN_TICKETS = 2
export const MAX_TICKETS = 20
export const LOSE_LABEL = '꽝'

export interface Ticket {
  label: string
  win: boolean
  /** Draw order (1-based) once opened, else null. */
  openedAt: number | null
}

export function clampWins(wins: number, total: number): number {
  return Math.max(1, Math.min(total - 1, wins))
}

export function winLoseLabels(total: number, wins: number, winLabel: string, loseLabel: string): { label: string; win: boolean }[] {
  const w = clampWins(wins, total)
  return Array.from({ length: total }, (_, i) =>
    i < w ? { label: winLabel.trim() || '당첨', win: true } : { label: loseLabel.trim() || LOSE_LABEL, win: false },
  )
}

/** Custom list: one label per line; blank lines ignored; padded with 꽝 / truncated to `total`. */
export function customLabels(text: string, total: number): { label: string; win: boolean }[] {
  const lines = text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, total)
  const out = lines.map((label) => ({ label, win: label !== LOSE_LABEL }))
  while (out.length < total) out.push({ label: LOSE_LABEL, win: false })
  return out
}

export function makeTickets(labels: { label: string; win: boolean }[], rng: () => number = Math.random): Ticket[] {
  return shuffle(labels, rng).map((l) => ({ ...l, openedAt: null }))
}

export function openTicket(tickets: Ticket[], i: number): Ticket[] {
  if (!tickets[i] || tickets[i].openedAt != null) return tickets
  const order = tickets.filter((t) => t.openedAt != null).length + 1
  return tickets.map((t, j) => (j === i ? { ...t, openedAt: order } : t))
}

export function openAll(tickets: Ticket[]): Ticket[] {
  let order = tickets.filter((t) => t.openedAt != null).length
  return tickets.map((t) => (t.openedAt != null ? t : { ...t, openedAt: ++order }))
}

export function openedCount(tickets: Ticket[]): number {
  return tickets.filter((t) => t.openedAt != null).length
}

export function winsLeft(tickets: Ticket[]): number {
  return tickets.filter((t) => t.win && t.openedAt == null).length
}
