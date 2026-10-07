// Shared plumbing for the two-player board games: move history with undo and automatic AI turns
// (cancelled on undo/restart/unmount and safe under StrictMode's double effects).
import { useCallback, useEffect, useRef, useState } from 'react'
import { sleep } from '../../lib/random'
import type { PlayerConfig } from '../../lib/types'

export interface DuelConfig<S, M> {
  players: PlayerConfig[]
  initial: () => S
  turnOf: (s: S) => number
  isOver: (s: S) => boolean
  apply: (s: S, m: M) => S
  /** AI move for the side to move (sync; keep it under ~1s). */
  think: (s: S) => M | null
  /** Pause before the AI starts thinking so people can follow. */
  aiDelay?: number | ((s: S) => number)
}

export function useDuel<S, M>(cfg: DuelConfig<S, M>) {
  const [hist, setHist] = useState<S[]>(() => [cfg.initial()])
  const cfgRef = useRef(cfg)
  useEffect(() => {
    cfgRef.current = cfg
  })
  const state = hist[hist.length - 1]
  const { players, turnOf, isOver } = cfg
  const over = isOver(state)
  const current = players[turnOf(state)]

  const play = useCallback((m: M) => {
    setHist((h) => [...h, cfgRef.current.apply(h[h.length - 1], m)])
  }, [])

  // AI turn: cancelled by cleanup when the state changes (undo/restart) or on unmount / StrictMode re-run.
  useEffect(() => {
    if (over || !current?.isAI) return
    let cancelled = false
    ;(async () => {
      const c = cfgRef.current
      const d = typeof c.aiDelay === 'function' ? c.aiDelay(state) : (c.aiDelay ?? 450)
      await sleep(d)
      if (cancelled) return
      // Let the "thinking" indicator paint before a potentially heavy search.
      await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)))
      if (cancelled) return
      const m = c.think(state)
      if (cancelled || m == null) return
      setHist((h) => (h[h.length - 1] === state ? [...h, c.apply(state, m)] : h))
    })()
    return () => {
      cancelled = true
    }
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  const anyHuman = players.some((p) => !p.isAI)
  // Undo goes back to the latest earlier position where a human is to move.
  const undoIndex = (() => {
    if (!anyHuman) return -1
    for (let i = hist.length - 2; i >= 0; i--) if (!players[turnOf(hist[i])].isAI) return i
    return -1
  })()

  const undo = useCallback(() => {
    if (undoIndex >= 0) setHist((h) => h.slice(0, undoIndex + 1))
  }, [undoIndex])

  const restart = useCallback(() => setHist([cfgRef.current.initial()]), [])

  return {
    state,
    history: hist,
    play,
    undo,
    canUndo: undoIndex >= 0,
    restart,
    /** An AI is to move (its move is pending). */
    thinking: !over && !!current?.isAI,
    over,
    current,
    /** True when a human may act right now. */
    humanTurn: !over && !!current && !current.isAI,
  }
}

/** Status line text helper. */
export function turnText(p: PlayerConfig | undefined, thinking: boolean, yourTurn = '차례예요') {
  if (!p) return ''
  if (p.isAI) return thinking ? `🤖 ${p.name} 생각 중…` : `🤖 ${p.name} 차례`
  return `${p.name} ${yourTurn}`
}
