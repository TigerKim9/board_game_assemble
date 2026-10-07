export type PopMode = 'lose' | 'win'

export const SLOT_OPTIONS = [12, 16, 24] as const

export interface Barrel {
  slots: number
  /** Index of the slot that launches the pirate. */
  trigger: number
  stabbed: boolean[]
}

export function createBarrel(slots: number, rng: () => number = Math.random): Barrel {
  return { slots, trigger: Math.floor(rng() * slots), stabbed: Array<boolean>(slots).fill(false) }
}

export function remaining(b: Barrel): number {
  return b.stabbed.filter((s) => !s).length
}

/** Stab a slot. Already-stabbed slots are rejected (returns null). */
export function stab(b: Barrel, slot: number): { barrel: Barrel; popped: boolean } | null {
  if (slot < 0 || slot >= b.slots || b.stabbed[slot]) return null
  const stabbed = b.stabbed.slice()
  stabbed[slot] = true
  return { barrel: { ...b, stabbed }, popped: slot === b.trigger }
}

/** AI picks any free slot — the barrel gives no clues, so random is optimal. */
export function aiChoose(b: Barrel, rng: () => number = Math.random): number {
  const free = b.stabbed.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0)
  return free[Math.floor(rng() * free.length)]
}

export function nextTurn(turn: number, players: number): number {
  return (turn + 1) % players
}

export function gridColumns(slots: number): number {
  return slots === 24 ? 6 : 4
}
