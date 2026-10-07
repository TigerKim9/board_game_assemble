import { createDeck, oppositeColor, shuffleDeck, type Card } from '../../cards/deck'

/** A tableau column: face-down cards under face-up cards. Column index = position in down ++ up. */
export interface Col {
  down: Card[]
  up: Card[]
}

export interface KState {
  stock: Card[]
  waste: Card[]
  /** Four foundations, each built A→K in one suit. */
  found: Card[][]
  tab: Col[]
  draw: 1 | 3
  moves: number
}

/** Pile ids: 'stock', 'waste', 'f0'..'f3', 't0'..'t6'. */
export type PileId = string

export function newGame(draw: 1 | 3, rng: () => number = Math.random): KState {
  const deck = shuffleDeck(createDeck(), rng)
  let i = 0
  const tab: Col[] = []
  for (let c = 0; c < 7; c++) {
    tab.push({ down: deck.slice(i, i + c), up: [deck[i + c]] })
    i += c + 1
  }
  return {
    stock: deck.slice(i),
    waste: [],
    found: [[], [], [], []],
    tab,
    draw,
    moves: 0,
  }
}

const top = <T>(a: readonly T[]): T | undefined => a[a.length - 1]

/** Flip the stock: draw 1 or 3 cards to the waste, or recycle the waste when the stock is empty. */
export function drawStock(s: KState): KState | null {
  if (s.stock.length === 0) {
    if (s.waste.length === 0) return null
    return { ...s, stock: s.waste.slice(), waste: [], moves: s.moves + 1 }
  }
  const n = Math.min(s.draw, s.stock.length)
  const drawn = s.stock.slice(0, n)
  return {
    ...s,
    stock: s.stock.slice(n),
    waste: [...s.waste, ...drawn],
    moves: s.moves + 1,
  }
}

/** Cards that would be picked up by grabbing `index` of `pile`, or null when not movable. */
export function pickUp(s: KState, pile: PileId, index: number): Card[] | null {
  if (pile === 'waste') {
    return s.waste.length && index === s.waste.length - 1 ? [top(s.waste)!] : null
  }
  if (pile[0] === 'f') {
    const f = s.found[+pile.slice(1)]
    return f.length && index === f.length - 1 ? [top(f)!] : null
  }
  if (pile[0] === 't') {
    const col = s.tab[+pile.slice(1)]
    const k = index - col.down.length
    if (k < 0 || k >= col.up.length) return null
    return col.up.slice(k)
  }
  return null
}

export function canDrop(s: KState, cards: Card[], target: PileId): boolean {
  if (!cards.length) return false
  const first = cards[0]
  if (target[0] === 'f') {
    if (cards.length !== 1) return false
    const f = s.found[+target.slice(1)]
    const t = top(f)
    return t ? t.suit === first.suit && first.rank === t.rank + 1 : first.rank === 1
  }
  if (target[0] === 't') {
    const col = s.tab[+target.slice(1)]
    const t = top(col.up)
    if (!t) return col.down.length === 0 && first.rank === 13
    return oppositeColor(t, first) && first.rank === t.rank - 1
  }
  return false
}

/** Move cards from `pile` (starting at `index`) to `target`. Returns the new state or null if illegal. */
export function move(s: KState, pile: PileId, index: number, target: PileId): KState | null {
  if (pile === target) return null
  const cards = pickUp(s, pile, index)
  if (!cards || !canDrop(s, cards, target)) return null
  const next: KState = {
    ...s,
    waste: s.waste,
    found: s.found.map((f) => f.slice()),
    tab: s.tab.map((c) => ({ down: c.down.slice(), up: c.up.slice() })),
    moves: s.moves + 1,
  }
  // remove from source
  if (pile === 'waste') next.waste = s.waste.slice(0, -1)
  else if (pile[0] === 'f') next.found[+pile.slice(1)].pop()
  else {
    const col = next.tab[+pile.slice(1)]
    col.up.splice(index - col.down.length)
    if (col.up.length === 0 && col.down.length) col.up.push(col.down.pop()!)
  }
  // add to target
  if (target[0] === 'f') next.found[+target.slice(1)].push(...cards)
  else next.tab[+target.slice(1)].up.push(...cards)
  return next
}

/** The foundation a single card can go to right now, if any. */
export function foundationFor(s: KState, card: Card): PileId | null {
  for (let i = 0; i < 4; i++) if (canDrop(s, [card], `f${i}`)) return `f${i}`
  return null
}

/** Best destination for a double-tap: foundation first, then a tableau column. */
export function autoTarget(s: KState, pile: PileId, index: number): PileId | null {
  const cards = pickUp(s, pile, index)
  if (!cards) return null
  if (cards.length === 1 && pile[0] !== 'f') {
    const f = foundationFor(s, cards[0])
    if (f) return f
  }
  const src = pile[0] === 't' ? s.tab[+pile.slice(1)] : null
  let empty: PileId | null = null
  for (let i = 0; i < 7; i++) {
    const id = `t${i}`
    if (id === pile || !canDrop(s, cards, id)) continue
    if (s.tab[i].up.length) return id
    // moving a king that already sits alone at the bottom of a column is pointless
    if (!(src && src.down.length === 0 && index === 0)) empty ??= id
  }
  return empty
}

export const isWon = (s: KState) => s.found.every((f) => f.length === 13)

/** Every tableau card is face up — the rest is just bookkeeping. */
export const noHiddenCards = (s: KState) => s.tab.every((c) => c.down.length === 0)

/**
 * One step of auto-completion: play any card that fits a foundation (lowest rank first),
 * otherwise flip the stock. Returns null when nothing can progress.
 */
export function autoStep(s: KState): KState | null {
  const sources: { pile: PileId; index: number; card: Card }[] = []
  const w = top(s.waste)
  if (w) sources.push({ pile: 'waste', index: s.waste.length - 1, card: w })
  s.tab.forEach((c, i) => {
    const t = top(c.up)
    if (t)
      sources.push({
        pile: `t${i}`,
        index: c.down.length + c.up.length - 1,
        card: t,
      })
  })
  sources.sort((a, b) => a.card.rank - b.card.rank)
  for (const src of sources) {
    const f = foundationFor(s, src.card)
    if (f) return move(s, src.pile, src.index, f)
  }
  if (s.stock.length || s.waste.length) return drawStock(s)
  return null
}

/** Simulate auto-completion; returns the states along the way, or null if it gets stuck. */
export function autoSolve(s: KState, limit = 2000): KState[] | null {
  if (!noHiddenCards(s)) return null
  const out: KState[] = []
  let cur = s
  let sinceProgress = 0
  for (let i = 0; i < limit && !isWon(cur); i++) {
    const next = autoStep(cur)
    if (!next) return null
    const progressed = next.found.reduce((a, f) => a + f.length, 0) > cur.found.reduce((a, f) => a + f.length, 0)
    sinceProgress = progressed ? 0 : sinceProgress + 1
    if (sinceProgress > 60) return null
    out.push(next)
    cur = next
  }
  return isWon(cur) ? out : null
}
