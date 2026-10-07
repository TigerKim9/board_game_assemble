export type HandKind = 'pinzoro' | 'triple' | 'shigoro' | 'point' | 'hifumi' | 'none'

export interface Hand {
  kind: HandKind
  /** Triple face or point value. */
  value: number
}

export const START_CHIPS = 1000
export const MIN_BET = 10
export const MAX_ROLLS = 3

export function evalHand(dice: number[]): Hand {
  const d = dice.slice().sort((a, b) => a - b)
  if (d[0] === d[2]) return d[0] === 1 ? { kind: 'pinzoro', value: 1 } : { kind: 'triple', value: d[0] }
  const key = d.join('')
  if (key === '456') return { kind: 'shigoro', value: 0 }
  if (key === '123') return { kind: 'hifumi', value: 0 }
  if (d[0] === d[1]) return { kind: 'point', value: d[2] }
  if (d[1] === d[2]) return { kind: 'point', value: d[0] }
  return { kind: 'none', value: 0 }
}

/** A roll ends the shooter's turn once it makes any hand (1-2-3 included). */
export const isFinal = (h: Hand) => h.kind !== 'none'

export function handLabel(h: Hand): string {
  switch (h.kind) {
    case 'pinzoro':
      return '핀조로 (1·1·1)'
    case 'triple':
      return `아라시 (${h.value} 트리플)`
    case 'shigoro':
      return '시고로 (4·5·6)'
    case 'point':
      return `${h.value}점`
    case 'hifumi':
      return '히후미 (1·2·3)'
    case 'none':
      return '꽝 (패 없음)'
  }
}

/** Ranking strength used for comparisons. */
export function strength(h: Hand): number {
  switch (h.kind) {
    case 'pinzoro':
      return 100
    case 'triple':
      return 50 + h.value
    case 'shigoro':
      return 40
    case 'point':
      return 10 + h.value
    case 'none':
      return 0
    case 'hifumi':
      return -10
  }
}

/**
 * When the dealer's hand settles the round immediately, returns the payout multiplier
 * for every player (negative = players pay). Otherwise null (players must roll).
 */
export function dealerInstant(dealer: Hand): number | null {
  switch (dealer.kind) {
    case 'pinzoro':
      return -5
    case 'triple':
      return -3
    case 'shigoro':
      return -2
    case 'hifumi':
      return 2
    case 'none':
      return 1
    default:
      return null
  }
}

/** Multiplier for a player against a dealer who rolled a point. */
export function playerVsDealer(player: Hand, dealer: Hand): number {
  switch (player.kind) {
    case 'pinzoro':
      return 5
    case 'triple':
      return 3
    case 'shigoro':
      return 2
    case 'hifumi':
      return -2
    case 'none':
      return -1
    case 'point':
      return player.value > dealer.value ? 1 : player.value < dealer.value ? -1 : 0
  }
}

/** Chips after settling, never below zero. */
export const applyPayout = (chips: number, bet: number, mult: number) => Math.max(0, chips + bet * mult)

/** A computer player's bet: a cautious slice of its stack. */
export function aiBet(chips: number, rng: () => number = Math.random): number {
  if (chips < MIN_BET) return 0
  const max = Math.max(MIN_BET, Math.floor((chips * 0.2) / 10) * 10)
  const steps = Math.floor((max - MIN_BET) / 10)
  return Math.min(chips, MIN_BET + Math.floor(rng() * (steps + 1)) * 10)
}
