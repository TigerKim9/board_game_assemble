/**
 * 원카드 (Korean "one card") — pure rules + AI.
 *
 * Rules chosen here (also shown in meta.rules):
 * - 52 cards + 2 jokers. 2~4명 7장, 5~6명 6장. Match the top card's suit or rank; jokers go on anything.
 * - Attack cards: 2 = +2, A = +3, ♠A = +5, 흑백 조커 = +5, 컬러 조커 = +7. Attacks stack.
 * - Defence: under attack you may only play an attack card that matches the top card's suit or rank
 *   AND has equal or greater power. A joker defends against any non-joker attack; on a joker only the
 *   colour joker may be played on the black joker. Otherwise you take all the stacked cards.
 * - J = skip next, Q = reverse direction, K = play once more, 7 = choose the next suit.
 *   After a joker (once its attack is taken) any card may be played.
 * - When you are down to 1 card you must press "원카드!" (you may also press it beforehand with 2 cards).
 *   If someone calls it first, you draw 1 penalty card.
 * - 20 cards or more in hand → 파산 (bust, out of the game, ranked last).
 * - First to empty the hand wins; play continues for the remaining places.
 */
import { createDeck, isJoker, shuffleDeck, SUITS, cardLabel, type Card, type Suit } from '../../cards/deck'
import type { Difficulty } from '../../lib/types'
import { pushLog, type LogEntry } from './log'

export const BUST_LIMIT = 20

export interface OCState {
  n: number
  names: string[]
  hands: Card[][]
  pile: Card[]
  discard: Card[]
  /** Suit to follow; null = anything goes (after a joker). */
  suit: Suit | null
  /** Stacked attack (cards the next player must take). */
  attack: number
  dir: 1 | -1
  turn: number
  /** Finish order of players who emptied their hand. */
  done: number[]
  /** Players who went bust, in order. */
  busted: number[]
  /** Player sitting on 1 card without having called "원카드". */
  vulnerable: number | null
  /** Players who already called "원카드" with 2 cards on their turn. */
  predeclared: boolean[]
  /** End the game as soon as these seats are all finished (humans), or never if empty. */
  watch: number[]
  over: boolean
  log: LogEntry[]
  /** Last action, for UI animation. */
  last?: { p: number; kind: 'play' | 'draw'; count?: number }
}

export const attackPower = (c: Card): number => {
  if (isJoker(c)) return c.suit === 'H' ? 7 : 5
  if (c.rank === 1) return c.suit === 'S' ? 5 : 3
  if (c.rank === 2) return 2
  return 0
}
export const isAttack = (c: Card) => attackPower(c) > 0

export const top = (s: OCState) => s.discard[s.discard.length - 1]
export const isActive = (s: OCState, p: number) => !s.done.includes(p) && !s.busted.includes(p)
export const activePlayers = (s: OCState) => Array.from({ length: s.n }, (_, i) => i).filter((i) => isActive(s, i))

export function advance(s: Pick<OCState, 'n' | 'done' | 'busted'>, from: number, dir: 1 | -1, steps = 1): number {
  let i = from
  for (let k = 0; k < steps; k++) {
    let guard = 0
    do {
      i = (i + dir + s.n) % s.n
      guard++
    } while ((s.done.includes(i) || s.busted.includes(i)) && guard <= s.n)
  }
  return i
}

export function newGame(names: string[], watch: number[], rng: () => number = Math.random): OCState {
  const n = names.length
  let deck = shuffleDeck(createDeck({ jokers: 2 }), rng)
  const per = n <= 4 ? 7 : 6
  const hands: Card[][] = Array.from({ length: n }, () => [])
  for (let r = 0; r < per; r++) for (let p = 0; p < n; p++) hands[p].push(deck.shift()!)
  // Flip a non-joker starter (specials have no effect on the first flip).
  let idx = deck.findIndex((c) => !isJoker(c))
  const first = deck[idx]
  deck = deck.filter((_, i) => i !== idx)
  const start = Math.floor(rng() * n)
  return {
    n,
    names,
    hands,
    pile: deck,
    discard: [first],
    suit: first.suit,
    attack: 0,
    dir: 1,
    turn: start,
    done: [],
    busted: [],
    vulnerable: null,
    predeclared: Array(n).fill(false),
    watch,
    over: false,
    log: pushLog([], `${names[start]}부터 시작해요! 첫 카드는 ${cardLabel(first)}`, 'info'),
  }
}

/** Can `c` be played now? */
export function canPlay(s: OCState, c: Card): boolean {
  const t = top(s)
  if (s.attack > 0) {
    if (isJoker(c)) return !(isJoker(t) && attackPower(c) < attackPower(t))
    if (!isAttack(c) || isJoker(t)) return false
    return (c.suit === t.suit || c.rank === t.rank) && attackPower(c) >= attackPower(t)
  }
  if (isJoker(c) || s.suit === null) return true
  return c.suit === s.suit || (!isJoker(t) && c.rank === t.rank)
}

export const legalCards = (s: OCState, p: number) => (s.turn === p && !s.over ? s.hands[p].filter((c) => canPlay(s, c)) : [])

function takeCards(s: OCState, p: number, k: number, rng: () => number): { s: OCState; got: number } {
  let pile = s.pile
  let discard = s.discard
  const hand = s.hands[p].slice()
  let got = 0
  for (let i = 0; i < k; i++) {
    if (pile.length === 0) {
      if (discard.length <= 1) break
      pile = shuffleDeck(discard.slice(0, -1), rng)
      discard = discard.slice(-1)
    }
    hand.push(pile[0])
    pile = pile.slice(1)
    got++
  }
  const hands = s.hands.slice()
  hands[p] = hand
  return { s: { ...s, hands, pile, discard }, got }
}

function finishCheck(s: OCState): OCState {
  const act = activePlayers(s)
  const watched = s.watch.length > 0 && s.watch.every((p) => !isActive(s, p))
  if (act.length <= 1 || watched) return { ...s, over: true, vulnerable: null }
  return s
}

/** Final ranking (best first): finishers, then remaining by card count, then busted (latest bust first). */
export function ranking(s: OCState): number[] {
  const rest = activePlayers(s).sort((a, b) => s.hands[a].length - s.hands[b].length)
  return [...s.done, ...rest, ...s.busted.slice().reverse()]
}

export function play(s: OCState, p: number, cardId: string, chosenSuit?: Suit, declare = false): OCState {
  if (s.over || s.turn !== p) return s
  const card = s.hands[p].find((c) => c.id === cardId)
  if (!card || !canPlay(s, card)) return s
  const hands = s.hands.slice()
  hands[p] = hands[p].filter((c) => c.id !== cardId)
  const name = s.names[p]
  let next: OCState = {
    ...s,
    hands,
    discard: [...s.discard, card],
    vulnerable: null,
    last: { p, kind: 'play' },
  }
  let log = s.log
  const power = attackPower(card)
  if (power) {
    next.attack = s.attack + power
    log = pushLog(log, `${name}: ${cardLabel(card)} 공격! (누적 +${next.attack})`, 'bad')
  } else {
    log = pushLog(log, `${name}: ${cardLabel(card)}`)
  }
  next.suit = isJoker(card) ? null : card.suit
  if (card.rank === 7) {
    const suit = chosenSuit ?? card.suit
    next.suit = suit
    log = pushLog(log, `${name}: 무늬를 ${SUIT_KO[suit]}(으)로 바꿨어요`, 'info')
  }
  let dir = s.dir
  let steps = 1
  let again = false
  if (!power) {
    if (card.rank === 11) {
      steps = 2
      log = pushLog(log, `J! ${s.names[advance(s, p, dir)]} 건너뛰기`, 'info')
    } else if (card.rank === 12) {
      dir = (dir * -1) as 1 | -1
      log = pushLog(log, 'Q! 방향이 바뀌어요 🔄', 'info')
    } else if (card.rank === 13) {
      again = true
    }
  }
  next.dir = dir
  const left = hands[p].length
  const predeclared = s.predeclared.slice()
  if (left === 0) {
    next.done = [...s.done, p]
    log = pushLog(log, `🎉 ${name} ${next.done.length}등으로 탈출!`, 'good')
    predeclared[p] = false
  } else if (left === 1) {
    if (declare || predeclared[p]) log = pushLog(log, `${name}: 원카드! ☝️`, 'info')
    else next.vulnerable = p
    predeclared[p] = false
  }
  next.predeclared = predeclared
  if (again && left > 0) {
    log = pushLog(log, `K! ${name} 한 번 더`, 'info')
    next.turn = p
  } else {
    next.turn = advance(next, p, dir, steps)
  }
  next.log = log
  return finishCheck(next)
}

/** Draw (1 card, or take the whole attack). */
export function drawTurn(s: OCState, p: number, rng: () => number = Math.random): OCState {
  if (s.over || s.turn !== p) return s
  const k = s.attack > 0 ? s.attack : 1
  const r = takeCards({ ...s, vulnerable: null }, p, k, rng)
  let next = r.s
  let log = next.log
  const name = s.names[p]
  log = pushLog(log, s.attack > 0 ? `${name}: 공격을 받아 ${r.got}장 먹었어요 😵` : `${name}: 1장 뽑기`, s.attack > 0 ? 'bad' : undefined)
  next = { ...next, attack: 0, last: { p, kind: 'draw', count: r.got } }
  if (r.got === 0 && s.attack === 0) log = pushLog(log, '더 뽑을 카드가 없어요', 'info')
  const predeclared = next.predeclared.slice()
  predeclared[p] = false
  next.predeclared = predeclared
  if (next.hands[p].length >= BUST_LIMIT) {
    next = bust(next, p, rng)
    log = pushLog(log, `💥 ${name} 카드 ${BUST_LIMIT}장 이상 — 파산!`, 'bad')
  }
  next.log = log
  next.turn = advance(next, p, next.dir)
  return finishCheck(next)
}

function bust(s: OCState, p: number, rng: () => number): OCState {
  const hands = s.hands.slice()
  const pile = shuffleDeck([...s.pile, ...hands[p]], rng)
  hands[p] = []
  return { ...s, hands, pile, busted: [...s.busted, p] }
}

/** Press the "원카드!" button. */
export function declare(s: OCState, p: number): OCState {
  if (s.over) return s
  if (s.vulnerable === p) return { ...s, vulnerable: null, log: pushLog(s.log, `${s.names[p]}: 원카드! ☝️`, 'info') }
  if (s.turn === p && s.hands[p].length === 2 && !s.predeclared[p]) {
    const predeclared = s.predeclared.slice()
    predeclared[p] = true
    return { ...s, predeclared, log: pushLog(s.log, `${s.names[p]}: 원카드 준비! ☝️`, 'info') }
  }
  return s
}

/** `by` catches the vulnerable player → they take 1 penalty card. */
export function catchOne(s: OCState, by: number, rng: () => number = Math.random): OCState {
  const v = s.vulnerable
  if (s.over || v === null || v === by) return s
  const r = takeCards({ ...s, vulnerable: null }, v, 1, rng)
  return {
    ...r.s,
    log: pushLog(s.log, `🚨 ${s.names[by]}: "원카드!" — ${s.names[v]} 벌칙 1장`, 'bad'),
  }
}

export const SUIT_KO: Record<Suit, string> = { S: '♠ 스페이드', H: '♥ 하트', D: '♦ 다이아', C: '♣ 클로버' }

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

export const AI_PARAMS: Record<Difficulty, { declare: number; catchProb: number }> = {
  easy: { declare: 0.7, catchProb: 0.35 },
  normal: { declare: 0.92, catchProb: 0.7 },
  hard: { declare: 1, catchProb: 0.95 },
}

export type AIMove = { type: 'play'; cardId: string; suit?: Suit; declare: boolean } | { type: 'draw' }

function bestSuit(hand: readonly Card[], exclude: string, rng: () => number): Suit {
  const counts: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 }
  for (const c of hand) if (c.id !== exclude && !isJoker(c) && c.rank !== 7) counts[c.suit]++
  let best: Suit = SUITS[Math.floor(rng() * 4)]
  for (const s of SUITS) if (counts[s] > counts[best]) best = s
  return best
}

export function aiMove(s: OCState, p: number, diff: Difficulty, rng: () => number = Math.random): AIMove {
  const hand = s.hands[p]
  const legal = hand.filter((c) => canPlay(s, c))
  const declareNow = rng() < AI_PARAMS[diff].declare
  const mk = (c: Card): AIMove => ({
    type: 'play',
    cardId: c.id,
    suit: c.rank === 7 ? (diff === 'easy' ? SUITS[Math.floor(rng() * 4)] : bestSuit(hand, c.id, rng)) : undefined,
    declare: declareNow,
  })
  if (!legal.length) return { type: 'draw' }
  if (s.attack > 0) {
    if (diff === 'easy' && rng() < 0.25) return { type: 'draw' }
    // Defend with the weakest card that works (save jokers).
    const sorted = legal.slice().sort((a, b) => attackPower(a) - attackPower(b))
    return mk(diff === 'easy' ? legal[Math.floor(rng() * legal.length)] : sorted[0])
  }
  if (diff === 'easy') return mk(legal[Math.floor(rng() * legal.length)])

  const nextP = advance(s, p, s.dir)
  const nextCount = s.hands[nextP].length
  const danger = nextCount <= 2
  const hard = diff === 'hard'
  const suitCount = (suit: Suit, except: string) => hand.filter((c) => c.id !== except && c.suit === suit).length
  let best: Card = legal[0]
  let bestScore = -Infinity
  for (const c of legal) {
    let sc = rng() * 0.5
    const pw = attackPower(c)
    if (isJoker(c)) {
      sc += danger || hand.length <= 2 ? 6 : -6
    } else if (pw) {
      sc += danger ? 7 : hard ? 1.5 : 1
    } else if (c.rank === 11) {
      sc += danger ? 5 : 0.5
    } else if (c.rank === 12) {
      sc += hard && s.n > 2 && s.hands[advance(s, p, (s.dir * -1) as 1 | -1)].length > nextCount ? 2 : 0.3
    } else if (c.rank === 13) {
      const follow = hand.some((o) => o.id !== c.id && (o.suit === c.suit || o.rank === 13 || isJoker(o)))
      sc += follow ? 3 : hard ? -3 : 0
    } else if (c.rank === 7) {
      sc += legal.length === 1 ? 2 : -3
    } else {
      sc += 2
    }
    if (hard && !isJoker(c)) sc += suitCount(c.suit, c.id) * 0.8
    if (hard && hand.length === 2 && !isJoker(c)) {
      // keep the more flexible last card
      const other = hand.find((o) => o.id !== c.id)!
      if (isJoker(other) || other.rank === 7) sc += 3
    }
    if (sc > bestScore) {
      bestScore = sc
      best = c
    }
  }
  return mk(best)
}

/** Does AI `by` call out the vulnerable player now? */
export function aiCatches(s: OCState, by: number, diff: Difficulty, rng: () => number = Math.random): boolean {
  return s.vulnerable !== null && s.vulnerable !== by && isActive(s, by) && rng() < AI_PARAMS[diff].catchProb
}
