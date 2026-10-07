import type { GameMeta } from '../lib/types'

// Each game folder exports its metadata from meta.ts; the component itself is lazy-loaded.
const modules = import.meta.glob<{ meta: GameMeta }>('./*/meta.ts', { eager: true })

export const GAMES: GameMeta[] = Object.values(modules)
  .map((m) => m.meta)
  .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

export function findGame(id: string): GameMeta | undefined {
  return GAMES.find((g) => g.id === id)
}
