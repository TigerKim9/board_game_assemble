// Shared UI pieces for the two-player board games (othello, connect4, checkers, tictactoe, gomoku, dots-boxes).
import type { ReactNode } from 'react'
import type { PlayerConfig } from '../../lib/types'
import './duel.css'

export function DuelBar({
  players,
  turn,
  icons,
  scores,
  thinking,
  over,
}: {
  players: PlayerConfig[]
  turn: number
  icons: ReactNode[]
  scores?: (string | number)[]
  thinking?: boolean
  over?: boolean
}) {
  return (
    <div className="othello-duel-bar">
      {players.map((p, i) => (
        <div key={i} className={`othello-duel-chip ${i === turn && !over ? 'active' : ''}`}>
          <span className="othello-duel-icon">{icons[i]}</span>
          <span className="othello-duel-name">
            {p.isAI ? '🤖 ' : ''}
            {p.name}
          </span>
          {scores && <strong className="othello-duel-score">{scores[i]}</strong>}
          {p.isAI && <span className={`othello-duel-dots ${i === turn && !over && thinking ? 'on' : ''}`} aria-hidden />}
        </div>
      ))}
    </div>
  )
}

export function DuelActions({
  canUndo,
  onUndo,
  onRestart,
  onSetup,
  children,
}: {
  canUndo: boolean
  onUndo: () => void
  onRestart: () => void
  onSetup: () => void
  children?: ReactNode
}) {
  return (
    <div className="othello-duel-actions">
      <button className="btn small" disabled={!canUndo} onClick={onUndo}>
        ↶ 무르기
      </button>
      {children}
      <button className="btn small ghost" onClick={onRestart}>
        새 판
      </button>
      <button className="btn small ghost" onClick={onSetup}>
        설정
      </button>
    </div>
  )
}
