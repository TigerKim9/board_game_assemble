/**
 * 대통령 (President / 대부호 style climbing game) — pure rules + AI.
 *
 * - Rank order (weak → strong): 3 4 5 6 7 8 9 10 J Q K A 2, then joker (optional, wild).
 * - Play 1–4 cards of one rank; jokers may stand in for any rank. A lone joker (or jokers only) is the top.
 * - Follow with the same number of cards of a strictly higher rank, or pass. Once you pass you sit out
 *   until the trick ends; when everyone else has passed, the last player leads anything.
 * - 혁명 (optional): playing 4 cards at once flips the order (3 becomes strongest…) until the next 혁명.
 * - Finish order gives titles: 대통령 · 부통령 · 평민 · 부국민 · 노예 (depends on player count).
 * - From round 2: 노예 gives the best 2 cards to 대통령 and gets 2 back; 부국민 ↔ 부통령 swap 1.
 */
import { cardLabel, createDeck, isJoker, rankLabel, shuffleDeck, type Card } from '../../cards/deck'
import type { Difficulty } from '../../lib/types'
import { pushLog, type LogEntry } from '../onecard/log'

export type Title = 'president' | 'vice' | 'citizen' | 'poor' | 'slave'
export const TITLE_KO: Record<Title, string> = {
  president: '대통령',
  vice: '부통령',
  citizen: '평민',
  poor: '부국민',
  slave: '노예',
}
export const TITLE_EMOJI: Record<Title, string> = {
  president: '👑',
  vice: '🎩',
  citizen: '🙂',
  poor: '🥲',
  slave: '⛓️',
}
export const TITLE_POINTS: Record<Title, number> = { president: 4, vice: 3, citizen: 2, poor: 1, slave: 0 }

export function titlesFor(n: number): Title[] {
  if (n <= 3) return ['president', 'citizen', 'slave'].slice(0, n) as Title[]
  if (n === 4) return ['president', 'vice', 'poor', 'slave']
  return ['president', 'vice', ...Array<Title>(n - 4).fill('citizen'), 'poor', 'slave']
}

export interface Options {
  jokers: boolean
  revolution: boolean
  rounds: number
}

/** 0 (=3) … 10 (=K), 11 = A, 12 = 2, 13 = joker. */
export const strength = (c: Card): number => (isJoker(c) ? 13 : c.rank === 1 ? 11 : c.rank === 2 ? 12 : c.rank - 3)

export interface Combo {
  cards: Card[]
  count: number
  /** Strength of the rank played (13 = jokers only). */
  level: number
}

export interface Exchange {
  from: number
  to: number
  cards: Card[]
}

export interface PRState {
  n: number
  names: string[]
  opts: Options
  hands: Card[][]
  phase: 'exchange' | 'play' | 'roundEnd' | 'over'
  round: number
  turn: number
  current: (Combo & { by: number }) | null
  passed: boolean[]
  /** Finish order of this round. */
  finished: number[]
  revolution: boolean
  scores: number[]
  /** Titles from the previous round (or this round once it ends). */
  titles: (Title | null)[]
  /** Givers that still have to choose cards to hand back (human high ranks). */
  pendingGive: { from: number; to: number; count: number }[]
  exchanges: Exchange[]
  log: LogEntry[]
  /** Number of plays made in this round (for UI). */
  plays: number
}

export const sortHand = (cards: readonly Card[]) =>
  cards.slice().sort((a, b) => strength(a) - strength(b) || a.suit.localeCompare(b.suit))

/** Analyse a set of cards as a play; null if not a valid combo. */
export function analyze(cards: readonly Card[]): Combo | null {
  if (cards.length < 1 || cards.length > 4) return null
  const nat = cards.filter((c) => !isJoker(c))
  if (nat.length === 0) return { cards: cards.slice(), count: cards.length, level: 13 }
  const r = nat[0].rank
  if (nat.some((c) => c.rank !== r)) return null
  return { cards: cards.slice(), count: cards.length, level: strength(nat[0]) }
}

/** Effective strength considering revolution (jokers-only stays on top). */
export const effLevel = (level: number, revolution: boolean) => (revolution && level < 13 ? 12 - level : level)

export function beats(c: Combo, cur: Combo | null, revolution: boolean): boolean {
  if (!cur) return true
  if (c.count !== cur.count) return false
  return effLevel(c.level, revolution) > effLevel(cur.level, revolution)
}

export function comboLabel(c: Combo): string {
  return c.cards.map(cardLabel).join(' ')
}

export const isOut = (s: PRState, p: number) => s.hands[p].length === 0

/** All distinct plays from a hand (one representative per rank × count). */
export function allCombos(hand: readonly Card[]): Combo[] {
  const jokers = hand.filter(isJoker)
  const byRank = new Map<number, Card[]>()
  for (const c of hand) if (!isJoker(c)) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c])
  const out: Combo[] = []
  for (const cards of byRank.values()) {
    for (let k = 1; k <= 4; k++) {
      const use = Math.min(cards.length, k)
      const need = k - use
      if (need > jokers.length) break
      out.push({ cards: [...cards.slice(0, use), ...jokers.slice(0, need)], count: k, level: strength(cards[0]) })
    }
  }
  for (let k = 1; k <= jokers.length; k++) out.push({ cards: jokers.slice(0, k), count: k, level: 13 })
  return out
}

export const legalPlays = (s: PRState, p: number) =>
  allCombos(s.hands[p]).filter((c) => beats(c, s.current, s.revolution))

/* ------------------------------------------------------------------ */
/* Setup / rounds                                                      */
/* ------------------------------------------------------------------ */

export function newGame(names: string[], opts: Options, rng: () => number = Math.random): PRState {
  const n = names.length
  const base: PRState = {
    n,
    names,
    opts,
    hands: [],
    phase: 'play',
    round: 0,
    turn: 0,
    current: null,
    passed: Array(n).fill(false),
    finished: [],
    revolution: false,
    scores: Array(n).fill(0),
    titles: Array(n).fill(null),
    pendingGive: [],
    exchanges: [],
    log: [],
    plays: 0,
  }
  return startRound(base, [], rng)
}

/** Deal a new round. `humanSeats` decide who picks their own give-back cards. */
export function startRound(s: PRState, humanSeats: readonly number[], rng: () => number = Math.random): PRState {
  const n = s.n
  const deck = shuffleDeck(createDeck({ jokers: s.opts.jokers ? 2 : 0 }), rng)
  const hands: Card[][] = Array.from({ length: n }, () => [])
  const offset = Math.floor(rng() * n)
  deck.forEach((c, i) => hands[(i + offset) % n].push(c))
  const round = s.round + 1
  let next: PRState = {
    ...s,
    hands: hands.map(sortHand),
    round,
    phase: 'play',
    current: null,
    passed: Array(n).fill(false),
    finished: [],
    revolution: false,
    pendingGive: [],
    exchanges: [],
    plays: 0,
    log: pushLog(s.log, `${round}라운드 시작!`, 'info'),
  }
  const titled = s.titles.some((t) => t !== null)
  if (titled) {
    const who = (t: Title) => s.titles.indexOf(t)
    const pairs: [number, number, number][] = [[who('slave'), who('president'), 2]]
    if (who('vice') >= 0 && who('poor') >= 0) pairs.push([who('poor'), who('vice'), 1])
    for (const [low, high, k] of pairs) {
      if (low < 0 || high < 0) continue
      // Low rank hands over their best k automatically.
      const best = sortHand(next.hands[low]).slice(-k)
      next = moveCards(next, low, high, best)
      next.log = pushLog(next.log, `${s.names[low]} → ${s.names[high]}: 가장 센 카드 ${k}장 상납`, 'bad')
      if (humanSeats.includes(high)) next.pendingGive = [...next.pendingGive, { from: high, to: low, count: k }]
      else {
        const give = aiGiveBack(next.hands[high], k)
        next = moveCards(next, high, low, give)
      }
    }
    next.turn = who('slave') >= 0 ? who('slave') : 0
    if (next.pendingGive.length) next.phase = 'exchange'
  } else {
    next.turn = Math.max(
      0,
      next.hands.findIndex((h) => h.some((c) => c.suit === 'C' && c.rank === 3)),
    )
    next.log = pushLog(next.log, `♣3을 가진 ${s.names[next.turn]}부터 시작`, 'info')
  }
  return next
}

function moveCards(s: PRState, from: number, to: number, cards: readonly Card[]): PRState {
  const ids = new Set(cards.map((c) => c.id))
  const hands = s.hands.slice()
  hands[from] = hands[from].filter((c) => !ids.has(c.id))
  hands[to] = sortHand([...hands[to], ...cards])
  return { ...s, hands, exchanges: [...s.exchanges, { from, to, cards: cards.slice() }] }
}

/** High rank (human) gives cards back during the exchange phase. */
export function giveBack(s: PRState, from: number, cardIds: readonly string[]): PRState {
  const pend = s.pendingGive.find((g) => g.from === from)
  if (s.phase !== 'exchange' || !pend || cardIds.length !== pend.count) return s
  const cards = s.hands[from].filter((c) => cardIds.includes(c.id))
  if (cards.length !== pend.count) return s
  let next = moveCards(s, from, pend.to, cards)
  next.pendingGive = s.pendingGive.filter((g) => g !== pend)
  next.log = pushLog(next.log, `${s.names[from]} → ${s.names[pend.to]}: ${cards.length}장 돌려줌`)
  if (!next.pendingGive.length) next = { ...next, phase: 'play' }
  return next
}

/* ------------------------------------------------------------------ */
/* Play                                                                */
/* ------------------------------------------------------------------ */

function nextEligible(s: PRState, from: number): number {
  for (let k = 1; k <= s.n; k++) {
    const i = (from + k) % s.n
    if (!isOut(s, i) && !s.passed[i]) return i
  }
  return -1
}
function nextActive(s: PRState, from: number): number {
  for (let k = 1; k <= s.n; k++) {
    const i = (from + k) % s.n
    if (!isOut(s, i)) return i
  }
  return -1
}

function endTrick(s: PRState, leader: number): PRState {
  const lead = isOut(s, leader) ? nextActive(s, leader) : leader
  return {
    ...s,
    current: null,
    passed: Array(s.n).fill(false),
    turn: lead,
    log: pushLog(s.log, `모두 패스 — ${s.names[lead]}가 새로 시작`, 'info'),
  }
}

function endRoundIfDone(s: PRState): PRState {
  const left = s.hands.map((h, i) => (h.length ? i : -1)).filter((i) => i >= 0)
  if (left.length > 1) return s
  const finished = [...s.finished, ...left]
  const t = titlesFor(s.n)
  const titles: (Title | null)[] = Array(s.n).fill(null)
  finished.forEach((p, i) => (titles[p] = t[i]))
  const scores = s.scores.map((sc, i) => sc + TITLE_POINTS[titles[i]!])
  return {
    ...s,
    finished,
    titles,
    scores,
    current: null,
    phase: s.round >= s.opts.rounds ? 'over' : 'roundEnd',
    log: pushLog(s.log, `라운드 끝! 대통령은 ${s.names[finished[0]]} 👑`, 'good'),
  }
}

export function play(s: PRState, p: number, cardIds: readonly string[]): PRState {
  if (s.phase !== 'play' || s.turn !== p) return s
  const cards = s.hands[p].filter((c) => cardIds.includes(c.id))
  if (cards.length !== cardIds.length) return s
  const combo = analyze(cards)
  if (!combo || !beats(combo, s.current, s.revolution)) return s
  const hands = s.hands.slice()
  hands[p] = hands[p].filter((c) => !cardIds.includes(c.id))
  let log = pushLog(s.log, `${s.names[p]}: ${comboLabel(combo)}`)
  let revolution = s.revolution
  if (s.opts.revolution && combo.count === 4) {
    revolution = !revolution
    log = pushLog(log, revolution ? '✊ 혁명! 이제 3이 가장 세요' : '✊ 혁명 반격! 순서가 원래대로', 'bad')
  }
  const finished = s.finished.slice()
  if (hands[p].length === 0) {
    finished.push(p)
    log = pushLog(log, `🎉 ${s.names[p]} ${finished.length}등으로 탈출!`, 'good')
  }
  let next: PRState = {
    ...s,
    hands,
    current: { ...combo, by: p },
    revolution,
    finished,
    log,
    plays: s.plays + 1,
  }
  next = endRoundIfDone(next)
  if (next.phase !== 'play') return next
  const nx = nextEligible(next, p)
  if (nx < 0 || nx === p) return endTrick(next, p)
  return { ...next, turn: nx }
}

export function pass(s: PRState, p: number): PRState {
  if (s.phase !== 'play' || s.turn !== p || !s.current) return s
  const passed = s.passed.slice()
  passed[p] = true
  let next: PRState = { ...s, passed, log: pushLog(s.log, `${s.names[p]}: 패스`) }
  const leader = s.current.by
  // Anyone besides the last player still in the trick?
  const waiting = Array.from({ length: s.n }, (_, i) => i).filter((i) => i !== leader && !isOut(next, i) && !passed[i])
  if (waiting.length === 0) return endTrick(next, leader)
  next = { ...next, turn: nextEligible(next, p) }
  if (next.turn === leader) next = endTrick(next, leader)
  return next
}

/** Final standings (best first) by score, ties broken by the last round. */
export function standings(s: PRState): number[] {
  return Array.from({ length: s.n }, (_, i) => i).sort(
    (a, b) => s.scores[b] - s.scores[a] || s.finished.indexOf(a) - s.finished.indexOf(b),
  )
}

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

/** High rank gives back its weakest cards (never jokers / 2s if avoidable). */
export function aiGiveBack(hand: readonly Card[], k: number): Card[] {
  return sortHand(hand).slice(0, k)
}

export type AIMove = { type: 'play'; cardIds: string[] } | { type: 'pass' }

export function aiMove(s: PRState, p: number, diff: Difficulty, rng: () => number = Math.random): AIMove {
  const hand = s.hands[p]
  const rev = s.revolution
  const ev = (c: Combo) => effLevel(c.level, rev)
  const counts = new Map<number, number>()
  for (const c of hand) if (!isJoker(c)) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1)
  const natCount = (c: Combo) => {
    const nat = c.cards.find((x) => !isJoker(x))
    return nat ? counts.get(nat.rank)! : 0
  }
  const jokersUsed = (c: Combo) => c.cards.filter(isJoker).length
  const minOpp = Math.min(...s.hands.map((h, i) => (i === p || !h.length ? 99 : h.length)))
  const options = legalPlays(s, p)
  const mv = (c: Combo): AIMove => ({ type: 'play', cardIds: c.cards.map((x) => x.id) })
  if (!options.length) return { type: 'pass' }
  const finishing = options.find((c) => c.count === hand.length)
  if (finishing) return mv(finishing)

  if (diff === 'easy') {
    if (s.current && rng() < 0.25) return { type: 'pass' }
    const low = options.slice().sort((a, b) => ev(a) - ev(b))
    return mv(low[Math.floor(rng() * Math.min(3, low.length))])
  }

  const hard = diff === 'hard'
  // Natural groups only, not breaking bigger sets, no jokers.
  const clean = options.filter((c) => jokersUsed(c) === 0 && natCount(c) === c.count)
  const urgent = minOpp <= 2 || (hard && minOpp <= 3)

  if (!s.current) {
    // Lead: hard players with a quad and a weak hand start a revolution.
    if (hard && s.opts.revolution) {
      const quad = clean.find((c) => c.count === 4)
      const avg = hand.reduce((a, c) => a + effLevel(strength(c), rev), 0) / hand.length
      if (quad && avg < 6) return mv(quad)
    }
    const pool = clean.length ? clean : options
    if (urgent) {
      // Lead the biggest set so the near-winner (likely holding singles) can't follow easily.
      const big = pool.slice().sort((a, b) => b.count - a.count || ev(a) - ev(b))
      return mv(big[0])
    }
    const lowest = pool.slice().sort((a, b) => ev(a) - ev(b) || b.count - a.count)
    // Hard: with two sets left, cash the strong one first, then lead out the rest.
    if (hard) {
      const groups = new Set(hand.map((c) => (isJoker(c) ? 'J' : c.rank))).size
      if (groups <= 2) {
        const top = pool.slice().sort((a, b) => ev(b) - ev(a))[0]
        if (ev(top) >= 12) return mv(top)
      }
    }
    return mv(lowest[0])
  }

  // Follow.
  const strong = (c: Combo) => ev(c) >= 11 || c.level === 13
  let pool = clean.filter((c) => !strong(c) || urgent || hand.length <= 4)
  if (!pool.length && (urgent || hand.length <= 5)) pool = options
  if (!pool.length) return { type: 'pass' }
  pool.sort((a, b) => jokersUsed(a) - jokersUsed(b) || ev(a) - ev(b))
  if (urgent && hard) {
    pool.sort((a, b) => ev(b) - ev(a))
    return mv(pool[0])
  }
  // Hard: don't waste cards on a trick that's already very high unless it's cheap.
  if (hard && s.current && ev(s.current) >= 10 && !urgent && hand.length > 6 && strong(pool[0])) return { type: 'pass' }
  if (!hard && rng() < 0.1) return { type: 'pass' }
  return mv(pool[0])
}

export const rankName = (level: number) =>
  level === 13 ? '조커' : rankLabel((level === 11 ? 1 : level === 12 ? 2 : level + 3) as Card['rank'])
