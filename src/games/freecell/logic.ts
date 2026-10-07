import { createDeck, oppositeColor, shuffleDeck, SUITS, type Card } from '../../cards/deck'
import { mulberry32 } from '../../lib/random'

export interface FState {
  /** Four free cells. */
  cells: (Card | null)[]
  /** Foundations in suit order ♠ ♥ ♦ ♣ (f0..f3). */
  found: Card[][]
  /** Eight columns, last element = top card. */
  cols: Card[][]
  moves: number
  deal: number
}

/** Pile ids: 'c0'..'c3' free cells, 'f0'..'f3' foundations, 't0'..'t7' columns. */
export type PileId = string

export const MAX_DEAL = 999999

export function newGame(deal: number): FState {
  const deck = shuffleDeck(createDeck(), mulberry32(deal))
  const cols: Card[][] = Array.from({ length: 8 }, () => [])
  deck.forEach((c, i) => cols[i % 8].push(c))
  return {
    cells: [null, null, null, null],
    found: [[], [], [], []],
    cols,
    moves: 0,
    deal,
  }
}

export const randomDeal = () => 1 + Math.floor(Math.random() * MAX_DEAL)

const top = <T>(a: readonly T[]): T | undefined => a[a.length - 1]
const num = (p: PileId) => +p.slice(1)

/** True when `cards` form a movable run: alternating colours, descending by one. */
export function isRun(cards: readonly Card[]): boolean {
  for (let i = 1; i < cards.length; i++) {
    if (!oppositeColor(cards[i - 1], cards[i]) || cards[i].rank !== cards[i - 1].rank - 1) return false
  }
  return true
}

export function pickUp(s: FState, pile: PileId, index: number): Card[] | null {
  if (pile[0] === 'c') {
    const c = s.cells[num(pile)]
    return c && index === 0 ? [c] : null
  }
  if (pile[0] === 'f') {
    const f = s.found[num(pile)]
    return f.length && index === f.length - 1 ? [top(f)!] : null
  }
  if (pile[0] === 't') {
    const col = s.cols[num(pile)]
    if (index < 0 || index >= col.length) return null
    const run = col.slice(index)
    return isRun(run) ? run : null
  }
  return null
}

/**
 * Supermove limit: how many cards can be moved at once using free cells and empty columns
 * as temporary space — (free cells + 1) × 2^(empty columns). Moving into an empty column
 * means that column doesn't count.
 */
export function maxMovable(s: FState, target: PileId | null): number {
  const free = s.cells.filter((c) => c == null).length
  let empty = s.cols.filter((c) => c.length === 0).length
  if (target && target[0] === 't' && s.cols[num(target)].length === 0) empty--
  return (free + 1) * 2 ** Math.max(0, empty)
}

export function canDrop(s: FState, cards: Card[], target: PileId): boolean {
  if (!cards.length) return false
  const first = cards[0]
  if (target[0] === 'c') return cards.length === 1 && s.cells[num(target)] == null
  if (target[0] === 'f') {
    const i = num(target)
    if (cards.length !== 1 || first.suit !== SUITS[i]) return false
    return first.rank === s.found[i].length + 1
  }
  if (target[0] === 't') {
    if (cards.length > maxMovable(s, target)) return false
    const t = top(s.cols[num(target)])
    return !t || (oppositeColor(t, first) && first.rank === t.rank - 1)
  }
  return false
}

function clone(s: FState): FState {
  return {
    ...s,
    cells: s.cells.slice(),
    found: s.found.map((f) => f.slice()),
    cols: s.cols.map((c) => c.slice()),
  }
}

function applyMove(s: FState, pile: PileId, index: number, target: PileId): FState | null {
  if (pile === target) return null
  const cards = pickUp(s, pile, index)
  if (!cards || !canDrop(s, cards, target)) return null
  const n = clone(s)
  if (pile[0] === 'c') n.cells[num(pile)] = null
  else if (pile[0] === 'f') n.found[num(pile)].pop()
  else n.cols[num(pile)].splice(index)
  if (target[0] === 'c') n.cells[num(target)] = cards[0]
  else if (target[0] === 'f') n.found[num(target)].push(cards[0])
  else n.cols[num(target)].push(...cards)
  return n
}

const foundIndex = (c: Card) => SUITS.indexOf(c.suit)

/**
 * A card is "safe" to auto-play when no other card could still need it as a landing spot:
 * aces and twos always, otherwise when both opposite-colour foundations reach rank − 1.
 */
export function isSafe(s: FState, c: Card): boolean {
  if (s.found[foundIndex(c)].length !== c.rank - 1) return false
  if (c.rank <= 2) return true
  const red = c.suit === 'H' || c.suit === 'D'
  const opp = red ? [0, 3] : [1, 2]
  return opp.every((i) => s.found[i].length >= c.rank - 1)
}

/** Repeatedly send safe cards to the foundations. */
export function autoPlaySafe(s: FState): FState {
  let cur = s
  for (;;) {
    let moved = false
    for (let i = 0; i < 4 && !moved; i++) {
      const c = cur.cells[i]
      if (c && isSafe(cur, c)) {
        cur = applyMove(cur, `c${i}`, 0, `f${foundIndex(c)}`)!
        moved = true
      }
    }
    for (let i = 0; i < 8 && !moved; i++) {
      const c = top(cur.cols[i])
      if (c && isSafe(cur, c)) {
        cur = applyMove(cur, `t${i}`, cur.cols[i].length - 1, `f${foundIndex(c)}`)!
        moved = true
      }
    }
    if (!moved) return cur
  }
}

/** Player move (+1 move), followed by safe auto-play. */
export function move(s: FState, pile: PileId, index: number, target: PileId): FState | null {
  const n = applyMove(s, pile, index, target)
  if (!n) return null
  n.moves = s.moves + 1
  return autoPlaySafe(n)
}

/** Where a double-tap sends cards: foundation → column with cards → empty column → free cell. */
export function autoTarget(s: FState, pile: PileId, index: number): PileId | null {
  const cards = pickUp(s, pile, index)
  if (!cards) return null
  if (cards.length === 1 && pile[0] !== 'f') {
    const f = `f${foundIndex(cards[0])}`
    if (canDrop(s, cards, f)) return f
  }
  let empty: PileId | null = null
  for (let i = 0; i < 8; i++) {
    const id = `t${i}`
    if (id === pile || !canDrop(s, cards, id)) continue
    if (s.cols[i].length) return id
    if (!(pile[0] === 't' && index === 0)) empty ??= id
  }
  if (empty) return empty
  if (cards.length === 1 && pile[0] === 't') {
    const free = s.cells.findIndex((c) => c == null)
    if (free >= 0) return `c${free}`
  }
  return null
}

export const isWon = (s: FState) => s.found.every((f) => f.length === 13)

/** Does any legal move exist? (used to tell the player they're stuck) */
export function hasAnyMove(s: FState): boolean {
  const sources: [PileId, number][] = []
  s.cells.forEach((c, i) => c && sources.push([`c${i}`, 0]))
  s.cols.forEach((c, i) => c.length && sources.push([`t${i}`, c.length - 1]))
  const targets = ['c0', 'c1', 'c2', 'c3', 'f0', 'f1', 'f2', 'f3', 't0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']
  return sources.some(([p, i]) => targets.some((t) => t !== p && !!applyMove(s, p, i, t)))
}

/**
 * When every column is already in descending order, the game is won by just moving
 * cards up — returns the step-by-step states, else null.
 */
export function autoSolve(s: FState): FState[] | null {
  const sorted = s.cols.every((c) => c.every((card, i) => i === 0 || card.rank < c[i - 1].rank))
  if (!sorted || isWon(s)) return null
  const out: FState[] = []
  let cur = s
  while (!isWon(cur)) {
    let best: { pile: PileId; index: number; rank: number } | null = null
    cur.cells.forEach((c, i) => {
      if (c && (!best || c.rank < best.rank)) best = { pile: `c${i}`, index: 0, rank: c.rank }
    })
    cur.cols.forEach((c, i) => {
      const t = top(c)
      if (t && (!best || t.rank < best.rank)) best = { pile: `t${i}`, index: c.length - 1, rank: t.rank }
    })
    if (!best) return null
    const b = best as { pile: PileId; index: number }
    const card = pickUp(cur, b.pile, b.index)![0]
    const next = applyMove(cur, b.pile, b.index, `f${foundIndex(card)}`)
    if (!next) return null
    next.moves = cur.moves + 1
    out.push(next)
    cur = next
  }
  return out
}
