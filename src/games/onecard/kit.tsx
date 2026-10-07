/**
 * Small shared table kit for the multiplayer card games in this batch
 * (원카드 · 도둑잡기 · 대통령 · 하트). Lives here because helpers must stay inside our own folders.
 *
 * - HandFan: a hand that always fits its container (overlap, or two rows when very crowded).
 * - Seats: opponent chips with name, card count, badge and turn glow.
 * - Toasts: floating event messages from a game log.
 * - PassCover: "pass the device" screen for hot-seat play with 2+ humans (see useHotSeat in kitHooks.ts).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PlayingCard, useElementWidth, type Card, type CardBack } from '../../cards'
import type { LogEntry } from './log'
import './kit.css'

/* ------------------------------------------------------------------ */
/* Hand                                                                */
/* ------------------------------------------------------------------ */

export interface HandFanProps {
  cards: readonly Card[]
  selected?: ReadonlySet<string>
  /** When given, cards for which it returns false are dimmed and not tappable. */
  isPlayable?: (c: Card) => boolean
  onTap?: (c: Card, index: number) => void
  faceDown?: boolean
  back?: CardBack
  /** Preferred card width (shrinks on narrow screens). */
  cardWidth?: number
  /** Highlight (glow) these ids. */
  highlight?: ReadonlySet<string>
  /** Card currently "aimed at" (e.g. an AI about to take it). */
  aimed?: number | null
  className?: string
}

export function HandFan({
  cards,
  selected,
  isPlayable,
  onTap,
  faceDown,
  back = 'blue',
  cardWidth = 58,
  highlight,
  aimed,
  className,
}: HandFanProps) {
  const ref = useRef<HTMLDivElement>(null)
  const W = useElementWidth(ref, 336)
  const cw = Math.max(36, Math.min(cardWidth, Math.floor(W / 4.2)))
  const ch = cw * 1.4
  const n = cards.length
  const span = (k: number) => (k <= 1 ? cw : Math.min(cw + 6, (W - cw) / (k - 1)))
  const rows = n > 9 && span(n) < cw * 0.34 ? 2 : 1
  const perRow = Math.ceil(n / rows)
  const step = span(perRow)
  const rowGap = ch * 0.56
  const raise = 14
  const height = ch + (rows - 1) * rowGap + raise
  return (
    <div ref={ref} className={`onecard-kit-hand ${className ?? ''}`} style={{ height }}>
      {cards.map((c, i) => {
        const row = rows === 2 ? (i < perRow ? 0 : 1) : 0
        const k = row === 0 ? Math.min(perRow, n) : n - perRow
        const col = row === 0 ? i : i - perRow
        const rowW = cw + (k - 1) * step
        const left = (W - rowW) / 2 + col * step
        const playable = isPlayable ? isPlayable(c) : true
        const sel = selected?.has(c.id)
        const top = raise + row * rowGap - (sel ? raise : 0) - (aimed === i ? 8 : 0)
        return (
          <div
            key={c.id}
            className={`onecard-kit-slot ${aimed === i ? 'aimed' : ''}`}
            style={{ left, top, zIndex: i + 1 }}
          >
            <PlayingCard
              card={c}
              faceDown={faceDown}
              back={back}
              width={cw}
              selected={sel}
              highlight={highlight?.has(c.id)}
              disabled={!!onTap && !playable}
              onClick={onTap && playable ? () => onTap(c, i) : undefined}
            />
          </div>
        )
      })}
      {n === 0 && <div className="onecard-kit-empty">손에 든 카드가 없어요</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Opponent seats                                                      */
/* ------------------------------------------------------------------ */

export interface SeatInfo {
  index: number
  name: string
  isAI: boolean
  count: number
  active?: boolean
  out?: boolean
  badge?: ReactNode
  note?: ReactNode
}

export function MiniBack({ count }: { count: number }) {
  return (
    <span className="onecard-kit-mini" aria-label={`카드 ${count}장`}>
      <span className="onecard-kit-mini-card" />
      <b>{count}</b>
    </span>
  )
}

export function Seats({ seats, onTap }: { seats: SeatInfo[]; onTap?: (index: number) => void }) {
  return (
    <ul className="onecard-kit-seats">
      {seats.map((s) => (
        <li
          key={s.index}
          className={`onecard-kit-seat ${s.active ? 'active' : ''} ${s.out ? 'out' : ''}`}
          style={{ borderColor: `var(--p${(s.index % 6) + 1})` }}
          onClick={onTap ? () => onTap(s.index) : undefined}
        >
          <div className="onecard-kit-seat-top">
            <span className="onecard-kit-seat-name">
              {s.isAI ? '🤖' : '🙂'} {s.name}
            </span>
          </div>
          <div className="onecard-kit-seat-bottom">
            <MiniBack count={s.count} />
            {s.badge != null && <span className="onecard-kit-badge">{s.badge}</span>}
          </div>
          {s.note != null && <div className="onecard-kit-note">{s.note}</div>}
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

/**
 * In-flow toast zone: shows the entries added by the latest action (up to 3 lines) and fades them
 * out after ~2.6s. The zone keeps its height so the table doesn't jump.
 */
export function Toasts({ log }: { log: readonly LogEntry[] }) {
  const newest = log.length ? log[log.length - 1].id : 0
  const prev = useRef(newest)
  const [batch, setBatch] = useState<{ key: number; items: LogEntry[] }>(() => ({ key: newest, items: log.slice(-1) }))
  useEffect(() => {
    if (newest === prev.current) return
    const items = log.filter((e) => e.id > prev.current).slice(-3)
    prev.current = newest
    setBatch({ key: newest, items: items.length ? items : log.slice(-1) })
  }, [newest, log])
  const tone = batch.items.some((e) => e.tone === 'bad')
    ? 'bad'
    : batch.items.some((e) => e.tone === 'good')
      ? 'good'
      : ''
  return (
    <div className="onecard-kit-toasts" aria-live="polite">
      {batch.items.length > 0 && (
        <div key={batch.key} className={`onecard-kit-toast ${tone}`}>
          {batch.items.map((e) => (
            <span key={e.id}>{e.text}</span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Recent history list (last few entries, newest first). */
export function LogList({ log, count = 4 }: { log: readonly LogEntry[]; count?: number }) {
  return (
    <ul className="onecard-kit-log">
      {log
        .slice(-count)
        .reverse()
        .map((e) => (
          <li key={e.id}>{e.text}</li>
        ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/* Hot seat                                                            */
/* ------------------------------------------------------------------ */

export function PassCover({ name, note, onReady }: { name: string; note?: string; onReady: () => void }) {
  return (
    <div className="onecard-kit-cover" role="dialog" aria-label="차례 넘기기">
      <div className="onecard-kit-cover-box">
        <div className="onecard-kit-cover-emoji">🙈</div>
        <h2>{name}님 차례</h2>
        <p>{note ?? '다른 사람은 보지 않게 화면을 넘겨주세요.'}</p>
        <button className="btn primary big" onClick={onReady}>
          준비됐어요 — 카드 보기
        </button>
      </div>
    </div>
  )
}
