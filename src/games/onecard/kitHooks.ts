/** Hooks for the shared card-table kit (kept apart from components for fast refresh). */
import { useCallback, useState } from 'react'
import type { PlayerConfig } from '../../lib/types'

/**
 * Who may see their cards right now.
 * - 0 or 1 human: that human's hand is always shown (no cover).
 * - 2+ humans: when a human must act and wasn't the last human to look, a cover hides the table
 *   until they tap "ready"; a hand is shown only while its owner is acting.
 */
export function useHotSeat(players: readonly PlayerConfig[], actor: number | null) {
  const humans = players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0)
  const multi = humans.length >= 2
  const [viewer, setViewer] = useState<number | null>(null)
  if (!multi) return { multi, cover: false, coverName: '', shown: humans.length ? humans[0] : null, reveal: () => {} }
  const actorHuman = actor !== null && !players[actor].isAI
  return {
    multi,
    cover: actorHuman && viewer !== actor,
    coverName: actorHuman ? players[actor!].name : '',
    shown: actorHuman && viewer === actor ? actor : null,
    reveal: () => setViewer(actor),
  }
}

/** State that silently resets to `initial` whenever `key` changes (e.g. a card selection per turn). */
export function useKeyedState<T>(initial: T, key: string): [T, (v: T) => void] {
  const [st, setSt] = useState<{ key: string; v: T }>({ key, v: initial })
  const set = useCallback((v: T) => setSt({ key, v }), [key])
  return [st.key === key ? st.v : initial, set]
}
