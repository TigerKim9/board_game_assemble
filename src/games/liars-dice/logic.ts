import type { Difficulty, PlayerConfig } from '../../lib/types'

export const START_DICE = 5

export interface Bid {
  qty: number
  face: number
}

export const facesFor = (wild: boolean) => (wild ? [2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6])

export function isHigher(b: Bid, prev: Bid | null): boolean {
  if (!prev) return b.qty >= 1
  return b.qty > prev.qty || (b.qty === prev.qty && b.face > prev.face)
}

export function minRaise(prev: Bid | null, wild: boolean): Bid {
  const faces = facesFor(wild)
  if (!prev) return { qty: 1, face: faces[0] }
  if (prev.face < 6) return { qty: prev.qty, face: prev.face + 1 }
  return { qty: prev.qty + 1, face: faces[0] }
}

export function countMatching(dice: number[], face: number, wild: boolean): number {
  return dice.filter((d) => d === face || (wild && d === 1 && face !== 1)).length
}

/** P(X ≥ k) for X ~ Binomial(n, p). */
export function atLeast(n: number, k: number, p: number): number {
  if (k <= 0) return 1
  if (k > n) return 0
  let total = 0
  let c = 1 // C(n, i)
  for (let i = 0; i <= n; i++) {
    if (i >= k) total += c * p ** i * (1 - p) ** (n - i)
    c = (c * (n - i)) / (i + 1)
  }
  return Math.min(1, total)
}

/** Probability that a bid is true from one player's point of view. */
export function bidChance(bid: Bid, myDice: number[], totalDice: number, wild: boolean): number {
  const known = countMatching(myDice, bid.face, wild)
  const unknown = totalDice - myDice.length
  const p = wild && bid.face !== 1 ? 1 / 3 : 1 / 6
  return atLeast(unknown, bid.qty - known, p)
}

export type Action = { type: 'bid'; bid: Bid } | { type: 'challenge' }

const NOISE: Record<Difficulty, number> = { easy: 0.25, normal: 0.08, hard: 0 }
const BLUFF: Record<Difficulty, number> = { easy: 0.05, normal: 0.1, hard: 0.08 }
const CALL_WEIGHT: Record<Difficulty, number> = { easy: 1.15, normal: 1, hard: 0.7 }

export function aiAction(
  myDice: number[],
  totalDice: number,
  current: Bid | null,
  wild: boolean,
  difficulty: Difficulty,
  rng: () => number = Math.random,
): Action {
  const noise = () => (rng() * 2 - 1) * NOISE[difficulty]
  const faces = facesFor(wild)
  const unknown = totalDice - myDice.length
  const p = wild ? 1 / 3 : 1 / 6

  let pCur = 1
  if (current) {
    pCur = bidChance(current, myDice, totalDice, wild)
    if (difficulty === 'hard') {
      // The bidder probably holds some of that face: soften towards one extra known die.
      const softer = bidChance({ qty: current.qty - 1, face: current.face }, myDice, totalDice, wild)
      pCur = 0.65 * pCur + 0.35 * softer
    }
    pCur = Math.max(0, Math.min(1, pCur + noise()))
    if (current.qty > totalDice) return { type: 'challenge' }
  }

  // Candidate raises (or openings).
  const cands: { bid: Bid; chance: number; mine: number }[] = []
  const lo = current ? current.qty : 1
  const hi = Math.min(totalDice, lo + 3)
  for (let q = lo; q <= hi; q++) {
    for (const f of faces) {
      const bid = { qty: q, face: f }
      if (!isHigher(bid, current)) continue
      const chance = bidChance(bid, myDice, totalDice, wild)
      cands.push({ bid, chance, mine: countMatching(myDice, f, wild) })
    }
  }
  if (cands.length === 0) return { type: 'challenge' }

  const minQ = Math.min(...cands.map((c) => c.bid.qty))
  const score = (c: (typeof cands)[number]) => c.chance + noise() * 0.6 - 0.015 * (c.bid.qty - minQ)
  let best = cands[0]
  let bestScore = -Infinity
  for (const c of cands) {
    const sc = score(c)
    if (sc > bestScore) {
      bestScore = sc
      best = c
    }
  }

  if (!current) {
    // Opening: push the quantity up while it stays likely.
    const face = best.bid.face
    const known = countMatching(myDice, face, wild)
    const expected = known + unknown * p
    const want = difficulty === 'easy' ? known + 1 : Math.max(1, Math.floor(expected - (difficulty === 'hard' ? 0.5 : 1)))
    let qty = Math.max(1, Math.min(totalDice, want))
    if (rng() < BLUFF[difficulty]) {
      const f2 = faces[Math.floor(rng() * faces.length)]
      return { type: 'bid', bid: { qty: Math.max(1, Math.floor(unknown * p)), face: f2 } }
    }
    while (qty > 1 && bidChance({ qty, face }, myDice, totalDice, wild) < 0.5) qty--
    return { type: 'bid', bid: { qty, face } }
  }

  // Challenge when the current bid looks less likely than our best raise.
  // Raising is only punished when the next player calls, so a raise is safer than it looks.
  const raiseRisk = (1 - best.chance) * CALL_WEIGHT[difficulty]
  if (pCur < raiseRisk || pCur < 0.2) return { type: 'challenge' }

  // Occasional bluff: a plausible bid on a face we barely hold.
  if (rng() < BLUFF[difficulty]) {
    const bluffs = cands.filter((c) => c.mine === 0 && c.chance >= 0.4 && c.bid.qty <= minQ + 1)
    if (bluffs.length) return { type: 'bid', bid: bluffs[Math.floor(rng() * bluffs.length)].bid }
  }
  return { type: 'bid', bid: best.bid }
}

// ---------- game state ----------

export interface Reveal {
  challenger: number
  bidder: number
  bid: Bid
  actual: number
  loser: number
}

export interface LiarState {
  players: PlayerConfig[]
  wild: boolean
  hands: number[][]
  turn: number
  bids: { player: number; bid: Bid }[]
  phase: 'bid' | 'reveal' | 'over'
  reveal: Reveal | null
  winner: number | null
  round: number
}

export const alive = (s: LiarState) => s.hands.map((h, i) => (h.length > 0 ? i : -1)).filter((i) => i >= 0)
export const totalDice = (s: LiarState) => s.hands.reduce((a, h) => a + h.length, 0)
export const currentBid = (s: LiarState) => (s.bids.length ? s.bids[s.bids.length - 1] : null)

export function rollHand(n: number, rng: () => number = Math.random): number[] {
  return Array.from({ length: n }, () => Math.floor(rng() * 6) + 1).sort((a, b) => a - b)
}

export function newLiar(players: PlayerConfig[], wild: boolean, rolled?: number[][]): LiarState {
  return {
    players,
    wild,
    hands: rolled ?? players.map(() => rollHand(START_DICE)),
    turn: 0,
    bids: [],
    phase: 'bid',
    reveal: null,
    winner: null,
    round: 1,
  }
}

export function nextAlive(s: LiarState, from: number): number {
  const n = s.players.length
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n
    if (s.hands[i].length > 0) return i
  }
  return from
}

export function placeBid(s: LiarState, bid: Bid): LiarState {
  if (s.phase !== 'bid') return s
  const cur = currentBid(s)
  if (!isHigher(bid, cur?.bid ?? null) || bid.qty > totalDice(s)) return s
  if (s.wild && bid.face === 1) return s
  return { ...s, bids: [...s.bids, { player: s.turn, bid }], turn: nextAlive(s, s.turn) }
}

export function challenge(s: LiarState): LiarState {
  const cur = currentBid(s)
  if (s.phase !== 'bid' || !cur) return s
  const all = s.hands.flat()
  const actual = countMatching(all, cur.bid.face, s.wild)
  const loser = actual >= cur.bid.qty ? s.turn : cur.player
  return { ...s, phase: 'reveal', reveal: { challenger: s.turn, bidder: cur.player, bid: cur.bid, actual, loser } }
}

/** Remove the loser's die and start the next round (or end the game). */
export function nextRound(s: LiarState, rolled?: number[][]): LiarState {
  if (s.phase !== 'reveal' || !s.reveal) return s
  const loser = s.reveal.loser
  const counts = s.hands.map((h, i) => h.length - (i === loser ? 1 : 0))
  const hands = rolled ?? counts.map((c) => rollHand(c))
  const base: LiarState = { ...s, hands, bids: [], reveal: null, round: s.round + 1, phase: 'bid' }
  const left = alive(base)
  if (left.length <= 1) return { ...base, phase: 'over', winner: left[0] ?? loser }
  const starter = hands[loser].length > 0 ? loser : nextAlive(base, loser)
  return { ...base, turn: starter }
}
