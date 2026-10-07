/** Shared card-game UI: a stats/undo bar for solitaires and a falling-suits win celebration. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatTime } from './hooks'
import './cards.css'

/** Timer · moves · best time, plus undo / new game buttons. */
export function SolitaireBar({
  seconds,
  moves,
  best,
  canUndo,
  onUndo,
  onNew,
  children,
}: {
  seconds: number
  moves: number
  best: number | null
  canUndo: boolean
  onUndo: () => void
  onNew: () => void
  children?: ReactNode
}) {
  return (
    <div className="pc-bar">
      <div className="pc-stats">
        <span aria-label="시간">⏱ {formatTime(seconds)}</span>
        <span aria-label="이동 수">👣 {moves}</span>
        {best != null && <span className="pc-stat-best">🏆 {formatTime(best)}</span>}
      </div>
      <div className="pc-bar-buttons">
        {children}
        <button className="btn small" onClick={onUndo} disabled={!canUndo}>
          ↶ 되돌리기
        </button>
        <button className="btn small" onClick={onNew}>
          새 게임
        </button>
      </div>
    </div>
  )
}

const CONFETTI = ['♠', '♥', '♦', '♣', '🎉', '⭐']

/** Full-screen falling suits. Render while a win banner is shown. */
export function Celebration({ count = 36 }: { count?: number }) {
  const [bits] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      ch: CONFETTI[i % CONFETTI.length],
      left: Math.random() * 100,
      delay: Math.random() * 1.6,
      dur: 2.2 + Math.random() * 1.8,
      size: 18 + Math.random() * 22,
      red: i % 4 === 1 || i % 4 === 2,
    })),
  )
  const [on, setOn] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    timer.current = setTimeout(() => setOn(false), 4500)
    return () => clearTimeout(timer.current)
  }, [])
  if (!on) return null
  return (
    <div className="pc-celebrate" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          style={{
            left: `${b.left}%`,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
            fontSize: b.size,
            color: b.red ? '#e0362c' : '#222',
            textShadow: '0 0 3px #fff',
          }}
        >
          {b.ch}
        </span>
      ))}
    </div>
  )
}
