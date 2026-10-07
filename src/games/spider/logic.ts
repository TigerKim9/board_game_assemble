import { createDeck, shuffleDeck, SUITS, type Card, type Suit } from '../../cards/deck'

export type SuitCount = 1 | 2 | 4

export interface Col {
  down: Card[]
  up: Card[]
}

export interface SState {
  cols: Col[]
  /** Remaining stock, dealt 10 at a time. */
  stock: Card[]
  /** Suits of completed K→A runs (8 to win). */
  done: Suit[]
  moves: number
  suits: SuitCount
}

/** Pile ids: 't0'..'t9' (columns). */
export type PileId = string

export function suitsFor(n: SuitCount): Suit[] {
  return n === 1 ? ['S'] : n === 2 ? ['S', 'H'] : SUITS.slice()
}

export function newGame(suits: SuitCount, rng: () => number = Math.random): SState {
  const deck = shuffleDeck(createDeck({ decks: 2, suits: suitsFor(suits) }), rng)
  const cols: Col[] = []
  let i = 0
  for (let c = 0; c < 10; c++) {
    const n = c < 4 ? 6 : 5
    cols.push({ down: deck.slice(i, i + n - 1), up: [deck[i + n - 1]] })
    i += n
  }
  return { cols, stock: deck.slice(i), done: [], moves: 0, suits }
}

const num = (p: PileId) => +p.slice(1)
const top = <T>(a: readonly T[]): T | undefined => a[a.length - 1]

/** Same suit, descending by one — the only kind of group that may be moved together. */
export function isSuitedRun(cards: readonly Card[]): boolean {
  for (let i = 1; i < cards.length; i++) {
    if (cards[i].suit !== cards[0].suit || cards[i].rank !== cards[i - 1].rank - 1) return false
  }
  return true
}

/** Cards grabbed at `index` (into down ++ up) or null. */
export function pickUp(s: SState, pile: PileId, index: number): Card[] | null {
  if (pile[0] !== 't') return null
  const col = s.cols[num(pile)]
  const k = index - col.down.length
  if (k < 0 || k >= col.up.length) return null
  const run = col.up.slice(k)
  return isSuitedRun(run) ? run : null
}

/** Any card may go on a card one rank higher (any suit) or into an empty column. */
export function canDrop(s: SState, cards: Card[], target: PileId): boolean {
  if (!cards.length || target[0] !== 't') return false
  const t = top(s.cols[num(target)].up)
  return !t || t.rank === cards[0].rank + 1
}

/** Remove completed K…A runs and flip newly exposed cards in one column (mutates). */
function settle(col: Col, done: Suit[]) {
  for (;;) {
    if (col.up.length >= 13) {
      const run = col.up.slice(-13)
      if (run[0].rank === 13 && isSuitedRun(run)) {
        col.up.splice(-13)
        done.push(run[0].suit)
      }
    }
    if (col.up.length === 0 && col.down.length) {
      col.up.push(col.down.pop()!)
      continue
    }
    return
  }
}

function clone(s: SState): SState {
  return {
    ...s,
    cols: s.cols.map((c) => ({ down: c.down.slice(), up: c.up.slice() })),
    done: s.done.slice(),
  }
}

export function move(s: SState, pile: PileId, index: number, target: PileId): SState | null {
  if (pile === target) return null
  const cards = pickUp(s, pile, index)
  if (!cards || !canDrop(s, cards, target)) return null
  const n = clone(s)
  const src = n.cols[num(pile)]
  src.up.splice(index - src.down.length)
  n.cols[num(target)].up.push(...cards)
  settle(n.cols[num(target)], n.done)
  settle(src, n.done)
  n.moves++
  return n
}

export type DealBlock = 'empty' | 'none' | null

/** Why dealing is not possible right now (null = OK). */
export function dealBlocked(s: SState): DealBlock {
  if (!s.stock.length) return 'none'
  if (s.cols.some((c) => c.up.length + c.down.length === 0)) return 'empty'
  return null
}

/** Deal one face-up card onto each column. */
export function dealRow(s: SState): SState | null {
  if (dealBlocked(s)) return null
  const n = clone(s)
  n.cols.forEach((c, i) => c.up.push(n.stock[i]))
  n.stock = n.stock.slice(10)
  n.cols.forEach((c) => settle(c, n.done))
  n.moves++
  return n
}

/**
 * Best destination for a double-tap: a same-suit card one higher, then any card one higher,
 * then an empty column (unless the run already starts its column).
 */
export function autoTarget(s: SState, pile: PileId, index: number): PileId | null {
  const cards = pickUp(s, pile, index)
  if (!cards) return null
  const src = s.cols[num(pile)]
  let any: PileId | null = null
  let empty: PileId | null = null
  for (let i = 0; i < 10; i++) {
    const id = `t${i}`
    if (id === pile || !canDrop(s, cards, id)) continue
    const t = top(s.cols[i].up)
    if (t && t.suit === cards[0].suit) return id
    if (t) any ??= id
    else if (index > 0 || src.down.length) empty ??= id
  }
  return any ?? empty
}

export interface Hint {
  pile: PileId
  index: number
  target: PileId
}

/** Compact key of a position (for loop detection). */
export const stateKey = (s: SState) =>
  s.cols.map((c) => c.down.length + ':' + c.up.map((x) => x.id).join(',')).join('|')

/**
 * Suggest a useful move: prefer building same-suit runs and moves that uncover a face-down card.
 * Moves leading to a position in `seen` (state keys) are skipped to avoid going in circles.
 * Returns null when only dealing (or nothing) remains.
 */
export function findHint(s: SState, seen?: ReadonlySet<string>): Hint | null {
  const cands: { h: Hint; score: number }[] = []
  s.cols.forEach((col, ci) => {
    for (let k = 0; k < col.up.length; k++) {
      const index = col.down.length + k
      const cards = pickUp(s, `t${ci}`, index)
      if (!cards) continue
      for (let ti = 0; ti < 10; ti++) {
        if (ti === ci || !canDrop(s, cards, `t${ti}`)) continue
        const t = top(s.cols[ti].up)
        const below = col.up[k - 1]
        // pointless: moving onto an equivalent spot (same-suit link already exists or empty→empty)
        if (!t && k === 0 && col.down.length === 0) continue
        if (
          below &&
          t &&
          below.rank === t.rank &&
          Number(below.suit === cards[0].suit) >= Number(t.suit === cards[0].suit)
        )
          continue
        if (
          below &&
          below.suit === cards[0].suit &&
          below.rank === cards[0].rank + 1 &&
          !(t && t.suit === cards[0].suit)
        )
          continue
        let score = cards.length
        if (t && t.suit === cards[0].suit) score += 20
        if (k === 0 && col.down.length) score += 15
        if (k === 0 && !col.down.length) score += 5
        if (!t) score -= 10
        cands.push({ h: { pile: `t${ci}`, index, target: `t${ti}` }, score })
      }
    }
  })
  cands.sort((a, b) => b.score - a.score)
  for (const c of cands) {
    if (!seen) return c.h
    const n = move(s, c.h.pile, c.h.index, c.h.target)
    if (n && !seen.has(stateKey(n))) return c.h
  }
  // Dealing needs every column filled: suggest moving a top card into an empty column.
  const empty = s.cols.findIndex((c) => c.down.length + c.up.length === 0)
  if (s.stock.length && empty >= 0) {
    let src = -1
    s.cols.forEach((c, i) => {
      if (
        c.up.length + c.down.length >= 2 &&
        (src < 0 || c.up.length + c.down.length > s.cols[src].up.length + s.cols[src].down.length)
      )
        src = i
    })
    if (src >= 0) {
      const c = s.cols[src]
      return { pile: `t${src}`, index: c.down.length + c.up.length - 1, target: `t${empty}` }
    }
  }
  return null
}

export const isWon = (s: SState) => s.done.length === 8
