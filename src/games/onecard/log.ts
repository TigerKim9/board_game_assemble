/** Tiny event log shared by the card games in this batch (pure, no React). */
export interface LogEntry {
  id: number
  text: string
  /** Optional emphasis for the toast colour. */
  tone?: 'good' | 'bad' | 'info'
}

/** Append a log entry (keeps the last 30). */
export function pushLog(log: readonly LogEntry[], text: string, tone?: LogEntry['tone']): LogEntry[] {
  const id = (log.length ? log[log.length - 1].id : 0) + 1
  return [...log.slice(-29), { id, text, tone }]
}
