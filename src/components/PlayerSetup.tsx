import { useState } from 'react'
import { useStored } from '../lib/storage'
import type { Difficulty, PlayerConfig } from '../lib/types'

const DEFAULT_NAMES = ['플레이어 1', '플레이어 2', '플레이어 3', '플레이어 4', '플레이어 5', '플레이어 6', '플레이어 7', '플레이어 8', '플레이어 9', '플레이어 10']
const AI_NAMES = ['컴퓨터 A', '컴퓨터 B', '컴퓨터 C', '컴퓨터 D', '컴퓨터 E', '컴퓨터 F', '컴퓨터 G', '컴퓨터 H', '컴퓨터 I']

interface Props {
  gameId: string
  min: number
  max: number
  defaultCount?: number
  /** Allow AI seats. When false, every seat is human (hot-seat). */
  allowAI?: boolean
  /** Show the difficulty selector (only meaningful when allowAI). */
  showDifficulty?: boolean
  /** Seat 0 is always human; other seats default to AI. */
  defaultAI?: boolean
  startLabel?: string
  extra?: React.ReactNode
  onStart: (players: PlayerConfig[], difficulty: Difficulty) => void
}

export function PlayerSetup({
  gameId,
  min,
  max,
  defaultCount,
  allowAI = true,
  showDifficulty = false,
  defaultAI = true,
  startLabel = '게임 시작',
  extra,
  onStart,
}: Props) {
  const [count, setCount] = useStored(`setup:${gameId}:count`, defaultCount ?? min)
  const [names, setNames] = useStored<string[]>('setup:names', DEFAULT_NAMES)
  const [aiSeats, setAiSeats] = useState<boolean[]>(() =>
    Array.from({ length: max }, (_, i) => allowAI && defaultAI && i > 0),
  )
  const [difficulty, setDifficulty] = useStored<Difficulty>(`setup:${gameId}:diff`, 'normal')
  const n = Math.min(max, Math.max(min, count))

  const players: PlayerConfig[] = Array.from({ length: n }, (_, i) => {
    const aiIndex = aiSeats.slice(0, i).filter(Boolean).length
    return aiSeats[i]
      ? { name: AI_NAMES[aiIndex] ?? `컴퓨터 ${aiIndex + 1}`, isAI: true }
      : { name: names[i] || DEFAULT_NAMES[i], isAI: false }
  })

  return (
    <div className="setup card-panel">
      {min !== max && (
        <div className="setup-row">
          <span>인원</span>
          <div className="stepper">
            <button className="btn small" disabled={n <= min} onClick={() => setCount(n - 1)}>
              −
            </button>
            <strong>{n}명</strong>
            <button className="btn small" disabled={n >= max} onClick={() => setCount(n + 1)}>
              +
            </button>
          </div>
        </div>
      )}
      <ul className="seat-list">
        {players.map((p, i) => (
          <li key={i} className="seat">
            {p.isAI ? (
              <span className="seat-name">🤖 {p.name}</span>
            ) : (
              <input
                className="seat-input"
                value={names[i] ?? ''}
                maxLength={10}
                placeholder={DEFAULT_NAMES[i]}
                onChange={(e) => {
                  const next = names.slice()
                  next[i] = e.target.value
                  setNames(next)
                }}
              />
            )}
            {allowAI && (
              <button
                className={`btn small ${p.isAI ? '' : 'ghost'}`}
                onClick={() => {
                  const next = aiSeats.slice()
                  next[i] = !next[i]
                  setAiSeats(next)
                }}
              >
                {p.isAI ? '컴퓨터' : '사람'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {allowAI && showDifficulty && players.some((p) => p.isAI) && (
        <div className="setup-row">
          <span>난이도</span>
          <div className="segmented">
            {(['easy', 'normal', 'hard'] as const).map((d) => (
              <button key={d} className={difficulty === d ? 'active' : ''} onClick={() => setDifficulty(d)}>
                {d === 'easy' ? '쉬움' : d === 'normal' ? '보통' : '어려움'}
              </button>
            ))}
          </div>
        </div>
      )}
      {extra}
      <button className="btn primary big" onClick={() => onStart(players, difficulty)}>
        {startLabel}
      </button>
    </div>
  )
}
