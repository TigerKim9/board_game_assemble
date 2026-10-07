import { useState, type ReactNode } from 'react'
import { navigate } from '../lib/router'
import type { GameMeta } from '../lib/types'
import { Modal } from './Modal'

export function GameShell({ meta, children }: { meta: GameMeta; children: ReactNode }) {
  const [showRules, setShowRules] = useState(false)
  return (
    <div className="game-page">
      <header className="game-header">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="홈으로">
          ←
        </button>
        <h1>
          <span aria-hidden>{meta.emoji}</span> {meta.name}
        </h1>
        <button className="icon-btn" onClick={() => setShowRules(true)} aria-label="규칙 보기">
          ?
        </button>
      </header>
      <main className="game-main">{children}</main>
      {showRules && (
        <Modal title={`${meta.name} 규칙`} onClose={() => setShowRules(false)}>
          <p className="muted">{meta.description}</p>
          <ul className="rules">
            {meta.rules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  )
}
