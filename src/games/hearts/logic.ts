/**
 * 하트 (Hearts, 4 players) — pure rules + AI.
 * Pass 3 cards (left → right → across → none), ♣2 leads the first trick, follow suit,
 * no points on the first trick, hearts can't be led until broken. ♥ = 1, ♠Q = 13,
 * taking all 26 "shoots the moon" (everyone else +26). Game ends at 100; lowest wins.
 */
import { createDeck, shuffleDeck, type Card, type Suit } from '../../cards/deck'
import type { Difficulty } from '../../lib/types'
import { pushLog, type LogEntry } from '../onecard/log'

export const TARGET = 100
export type PassDir = 'left' | 'right' | 'across' | 'none'
export const PASS_ORDER: PassDir[] = ['left', 'right', 'across', 'none']
export const PASS_OFFSET: Record<PassDir, number> = { left: 1, right: 3, across: 2, none: 0 }
export const PASS_KO: Record<PassDir, string> = { left: '왼쪽', right: '오른쪽', across: '맞은편', none: '없음' }

export interface Play {
  p: number
  card: Card
}

export interface HState {
  names: string[]
  hands: Card[][]
  phase: 'pass' | 'play' | 'handEnd' | 'over'
  /** Number of hands dealt so far (1-based after the first deal). */
  handNo: number
  passSel: (string[] | null)[]
  received: Card[][]
  trick: Play[]
  turn: number
  trickNo: number
  heartsBroken: boolean
  /** Point cards taken this hand. */
  taken: Card[][]
  scores: number[]
  /** Points added at the end of the last hand. */
  lastHand: number[] | null
  moon: number | null
  /** All cards played this hand (AI memory). */
  played: Card[]
  /** voids[p][suit] = p showed out of that suit this hand. */
  voids: Record<Suit, boolean>[]
  lastTrick: { plays: Play[]; winner: number } | null
  log: LogEntry[]
}

export const passDir = (handNo: number): PassDir => PASS_ORDER[(handNo - 1) % 4]
export const rv = (c: Card) => (c.rank === 1 ? 14 : c.rank)
export const isQS = (c: Card) => c.suit === 'S' && c.rank === 12
export const points = (c: Card) => (c.suit === 'H' ? 1 : isQS(c) ? 13 : 0)
export const handPoints = (cards: readonly Card[]) => cards.reduce((a, c) => a + points(c), 0)

const SUIT_ORDER: Suit[] = ['C', 'D', 'S', 'H']
export const sortHearts = (cards: readonly Card[]) =>
  cards.slice().sort((a, b) => SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || rv(a) - rv(b))

const noVoids = (): Record<Suit, boolean> => ({ S: false, H: false, D: false, C: false })

export function newGame(names: string[], rng: () => number = Math.random): HState {
  const base: HState = {
    names,
    hands: [],
    phase: 'pass',
    handNo: 0,
    passSel: [null, null, null, null],
    received: [[], [], [], []],
    trick: [],
    turn: 0,
    trickNo: 0,
    heartsBroken: false,
    taken: [[], [], [], []],
    scores: [0, 0, 0, 0],
    lastHand: null,
    moon: null,
    played: [],
    voids: [noVoids(), noVoids(), noVoids(), noVoids()],
    lastTrick: null,
    log: [],
  }
  return deal(base, rng)
}

export function deal(s: HState, rng: () => number = Math.random): HState {
  const deck = shuffleDeck(createDeck(), rng)
  const hands = [0, 1, 2, 3].map((p) => sortHearts(deck.slice(p * 13, p * 13 + 13)))
  const handNo = s.handNo + 1
  const dir = passDir(handNo)
  const next: HState = {
    ...s,
    hands,
    handNo,
    phase: 'pass',
    passSel: [null, null, null, null],
    received: [[], [], [], []],
    trick: [],
    trickNo: 0,
    heartsBroken: false,
    taken: [[], [], [], []],
    moon: null,
    played: [],
    voids: [noVoids(), noVoids(), noVoids(), noVoids()],
    lastTrick: null,
    log: pushLog(s.log, dir === 'none' ? `${handNo}번째 판 — 이번엔 카드를 넘기지 않아요` : `${handNo}번째 판 — ${PASS_KO[dir]}으로 3장 넘기기`, 'info'),
  }
  return dir === 'none' ? startPlay(next) : next
}

function startPlay(s: HState): HState {
  const leader = s.hands.findIndex((h) => h.some((c) => c.suit === 'C' && c.rank === 2))
  return { ...s, phase: 'play', turn: leader, log: pushLog(s.log, `♣2를 가진 ${s.names[leader]}부터 시작`, 'info') }
}

/** Player chooses 3 cards to pass. When all four have chosen, the cards move. */
export function choosePass(s: HState, p: number, ids: readonly string[]): HState {
  if (s.phase !== 'pass' || ids.length !== 3 || s.passSel[p]) return s
  if (!ids.every((id) => s.hands[p].some((c) => c.id === id))) return s
  const passSel = s.passSel.slice()
  passSel[p] = ids.slice()
  const next = { ...s, passSel }
  if (passSel.some((x) => !x)) return next
  const off = PASS_OFFSET[passDir(s.handNo)]
  const hands = s.hands.map((h, i) => h.filter((c) => !passSel[i]!.includes(c.id)))
  const received: Card[][] = [[], [], [], []]
  for (let i = 0; i < 4; i++) {
    const to = (i + off) % 4
    const cards = s.hands[i].filter((c) => passSel[i]!.includes(c.id))
    received[to] = cards
    hands[to] = [...hands[to], ...cards]
  }
  return startPlay({ ...next, hands: hands.map(sortHearts), received })
}

export function legalCards(s: HState, p: number): Card[] {
  if (s.phase !== 'play' || s.turn !== p || s.trick.length === 4) return []
  const hand = s.hands[p]
  if (s.trick.length === 0) {
    if (s.trickNo === 0) return hand.filter((c) => c.suit === 'C' && c.rank === 2)
    if (!s.heartsBroken) {
      const non = hand.filter((c) => c.suit !== 'H')
      if (non.length) return non
    }
    return hand.slice()
  }
  const lead = s.trick[0].card.suit
  const follow = hand.filter((c) => c.suit === lead)
  if (follow.length) return follow
  if (s.trickNo === 0) {
    const safe = hand.filter((c) => points(c) === 0)
    if (safe.length) return safe
  }
  return hand.slice()
}

export function trickWinner(trick: readonly Play[]): number {
  const lead = trick[0].card.suit
  let best = trick[0]
  for (const t of trick) if (t.card.suit === lead && rv(t.card) > rv(best.card)) best = t
  return best.p
}

export function playCard(s: HState, p: number, id: string): HState {
  const card = legalCards(s, p).find((c) => c.id === id)
  if (!card) return s
  const hands = s.hands.slice()
  hands[p] = hands[p].filter((c) => c.id !== id)
  const trick = [...s.trick, { p, card }]
  let log = s.log
  let heartsBroken = s.heartsBroken
  if (card.suit === 'H' && !heartsBroken) {
    heartsBroken = true
    log = pushLog(log, '💔 하트가 깨졌어요!', 'bad')
  }
  if (isQS(card)) log = pushLog(log, `😱 ${s.names[p]}: 스페이드 Q!`, 'bad')
  const voids = s.voids.slice()
  if (s.trick.length && card.suit !== s.trick[0].card.suit) voids[p] = { ...voids[p], [s.trick[0].card.suit]: true }
  return {
    ...s,
    hands,
    trick,
    heartsBroken,
    voids,
    played: [...s.played, card],
    turn: trick.length === 4 ? -1 : (p + 1) % 4,
    log,
  }
}

/** After 4 cards: winner takes the trick (UI calls this after a short pause). */
export function collect(s: HState): HState {
  if (s.trick.length !== 4) return s
  const w = trickWinner(s.trick)
  const pts = s.trick.filter((t) => points(t.card) > 0).map((t) => t.card)
  const taken = s.taken.slice()
  taken[w] = [...taken[w], ...pts]
  const got = handPoints(pts)
  let log = got ? pushLog(s.log, `${s.names[w]}가 ${got}점을 가져갔어요`, got >= 13 ? 'bad' : undefined) : s.log
  const next: HState = {
    ...s,
    taken,
    trick: [],
    turn: w,
    trickNo: s.trickNo + 1,
    lastTrick: { plays: s.trick, winner: w },
    log,
  }
  if (next.trickNo < 13) return next
  // Hand over.
  const raw = taken.map(handPoints)
  const moon = raw.findIndex((x) => x === 26)
  const add = moon >= 0 ? raw.map((_, i) => (i === moon ? 0 : 26)) : raw
  const scores = s.scores.map((x, i) => x + add[i])
  if (moon >= 0) log = pushLog(log, `🌙 ${s.names[moon]} 문 슛! 다른 사람 모두 +26`, 'good')
  return {
    ...next,
    log,
    scores,
    lastHand: add,
    moon: moon >= 0 ? moon : null,
    phase: scores.some((x) => x >= TARGET) ? 'over' : 'handEnd',
  }
}

/** Seats sorted best (lowest) first. */
export const standings = (s: HState) => [0, 1, 2, 3].sort((a, b) => s.scores[a] - s.scores[b])
export const winners = (s: HState) => {
  const min = Math.min(...s.scores)
  return [0, 1, 2, 3].filter((i) => s.scores[i] === min)
}

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

export function aiPass(hand: readonly Card[], diff: Difficulty, rng: () => number = Math.random): string[] {
  if (diff === 'easy') {
    // Mostly random, slight preference for high cards.
    return hand
      .map((c) => ({ c, k: rng() * 10 + rv(c) * 0.3 }))
      .sort((a, b) => b.k - a.k)
      .slice(0, 3)
      .map((x) => x.c.id)
  }
  const spades = hand.filter((c) => c.suit === 'S').length
  const hasQ = hand.some(isQS)
  const count = (s: Suit) => hand.filter((c) => c.suit === s).length
  // Shortest minor suit to void (hard).
  const minors = (['C', 'D'] as Suit[]).filter((s) => count(s) > 0 && count(s) <= 3).sort((a, b) => count(a) - count(b))
  const voidSuit = diff === 'hard' ? minors[0] : undefined
  const danger = (c: Card) => {
    let d = rv(c)
    if (isQS(c)) d = diff === 'hard' && spades >= 5 ? 5 : 100
    else if (c.suit === 'S' && rv(c) > 12) d = hasQ && spades >= 5 && diff === 'hard' ? 8 : 60 + rv(c)
    else if (c.suit === 'S') d = rv(c) * 0.5
    else if (c.suit === 'H') d = rv(c) * 2.2
    if (voidSuit && c.suit === voidSuit && !(c.suit === 'C' && c.rank === 2)) d += 40
    return d
  }
  return hand
    .slice()
    .sort((a, b) => danger(b) - danger(a))
    .slice(0, 3)
    .map((c) => c.id)
}

export function aiPlay(s: HState, p: number, diff: Difficulty, rng: () => number = Math.random): string {
  const legal = legalCards(s, p)
  if (legal.length === 1) return legal[0].id
  if (diff === 'easy' && rng() < 0.5) return legal[Math.floor(rng() * legal.length)].id
  const hard = diff === 'hard'
  const hand = s.hands[p]
  const qsOut = s.played.some(isQS) || hand.some(isQS)
  const hi = (cs: Card[]) => cs.reduce((a, c) => (rv(c) > rv(a) ? c : a))
  const lo = (cs: Card[]) => cs.reduce((a, c) => (rv(c) < rv(a) ? c : a))

  // Moon defence: someone else has every point so far.
  const raw = s.taken.map(handPoints)
  const total = raw.reduce((a, b) => a + b, 0)
  const shooter = raw.findIndex((x) => x > 0 && x === total)
  const defend = hard && shooter >= 0 && shooter !== p && total >= 8

  if (s.trick.length === 0) {
    // Lead.
    if (hard && !qsOut) {
      const sp = legal.filter((c) => c.suit === 'S' && rv(c) < 12)
      const big = hand.some((c) => c.suit === 'S' && rv(c) > 12)
      if (sp.length && !big) return lo(sp).id
    }
    if (defend) {
      // Grab a trick with a high card to keep the shooter from a clean sweep.
      return hi(legal).id
    }
    const safe = legal.filter((c) => !(c.suit === 'S' && rv(c) >= 12 && !s.played.some(isQS)))
    const pool = safe.length ? safe : legal
    // Prefer suits nobody is void in (hard), lowest card.
    const scored = pool.map((c) => {
      let k = rv(c)
      if (c.suit === 'H') k += 6
      if (hard && s.voids.some((v, i) => i !== p && v[c.suit])) k += 8
      return { c, k }
    })
    scored.sort((a, b) => a.k - b.k)
    return scored[0].c.id
  }

  const lead = s.trick[0].card.suit
  const following = legal[0].suit === lead && legal.every((c) => c.suit === lead)
  const trickPts = s.trick.reduce((a, t) => a + points(t.card), 0)
  const last = s.trick.length === 3
  const winning = s.trick.filter((t) => t.card.suit === lead).reduce((a, t) => (rv(t.card) > rv(a.card) ? t : a))
  if (following) {
    if (defend && (trickPts > 0 || last) && winning.p === shooter) {
      const beat = legal.filter((c) => rv(c) > rv(winning.card))
      if (beat.length) return hi(beat).id
    }
    const under = legal.filter((c) => rv(c) < rv(winning.card))
    if (under.length) return hi(under).id // duck as high as possible (dumps ♠Q under ♠K/♠A)
    if (last && trickPts === 0) {
      const nonQ = legal.filter((c) => !isQS(c))
      return hi(nonQ.length ? nonQ : legal).id
    }
    if (lead === 'S') {
      const nonQ = legal.filter((c) => !isQS(c))
      return lo(nonQ.length ? nonQ : legal).id
    }
    return (last ? hi(legal) : lo(legal)).id
  }
  // Void: dump.
  const shooterWinning = defend && winning.p === shooter
  const qs = legal.find(isQS)
  if (qs && !shooterWinning) return qs.id
  if (!s.played.some(isQS)) {
    const bigS = legal.filter((c) => c.suit === 'S' && rv(c) > 12)
    if (bigS.length) return hi(bigS).id
  }
  const hearts = legal.filter((c) => c.suit === 'H')
  if (hearts.length && !shooterWinning) return hi(hearts).id
  // Highest card of the shortest suit (towards another void).
  const nonPts = legal.filter((c) => points(c) === 0)
  const pool = nonPts.length ? nonPts : legal
  const len = (su: Suit) => hand.filter((c) => c.suit === su).length
  return pool.slice().sort((a, b) => (hard ? len(a.suit) - len(b.suit) : 0) || rv(b) - rv(a))[0].id
}
