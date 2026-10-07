/** Small shared helpers for the puzzle games (timer, records, celebration, stat bar). */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { load } from '../../lib/storage'
import './puzzleKit.css'

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

/** Calls onTick once per second while running and the tab is visible. */
export function useTicker(running: boolean, onTick: () => void) {
  const cb = useRef(onTick)
  useEffect(() => {
    cb.current = onTick
  })
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      cb.current()
    }, 1000)
    return () => clearInterval(t)
  }, [running])
}

/** Read a best record saved by useBestScore(id) without subscribing to it. */
export function readBest(id: string): number | null {
  return load<number | null>(`best:${id}`, null)
}

export function StatBar({ children }: { children: ReactNode }) {
  return <div className="pz-stats">{children}</div>
}

export function Stat({ label, value, highlight }: { label: string; value: ReactNode; highlight?: boolean }) {
  return (
    <div className={`pz-stat ${highlight ? 'hl' : ''}`}>
      <span className="pz-stat-label">{label}</span>
      <strong className="pz-stat-value">{value}</strong>
    </div>
  )
}

const CONFETTI = ['🎉', '⭐', '✨', '🧩', '🎊', '💫']

/** Full-screen falling confetti for a few seconds. */
export function Celebration({ count = 36 }: { count?: number }) {
  const [bits] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      ch: CONFETTI[i % CONFETTI.length],
      left: Math.random() * 100,
      delay: Math.random() * 1.4,
      dur: 2.2 + Math.random() * 1.6,
      size: 18 + Math.random() * 20,
    })),
  )
  const [on, setOn] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setOn(false), 4500)
    return () => clearTimeout(t)
  }, [])
  if (!on) return null
  return (
    <div className="pz-celebrate" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, fontSize: b.size }}
        >
          {b.ch}
        </span>
      ))}
    </div>
  )
}

/** Shown on the setup screen when an unfinished game was saved. */
export function ResumeCard({ text, onResume, onDiscard }: { text: string; onResume: () => void; onDiscard: () => void }) {
  return (
    <div className="pz-resume">
      <span>💾 {text}</span>
      <div className="btn-row">
        <button className="btn primary small" onClick={onResume}>
          이어 하기
        </button>
        <button className="btn ghost small" onClick={onDiscard}>
          버리기
        </button>
      </div>
    </div>
  )
}
