/**
 * 훌라 (한국식 러미) — 순수 규칙 + AI.
 *
 * 이 게임이 쓰는 규칙(간단 버전)
 * - 52장, 2~4명, 모두 7장씩. 남은 카드는 더미, 한 장을 뒤집어 버린 카드 더미 시작.
 * - 차례: ① 더미에서 1장 뽑기, 또는 버린 카드 맨 위 장 가져오기(바로 등록·붙이기에 쓸 때만)
 *         ② 원하면 등록(멜드 내려놓기)·붙이기 ③ 1장 버리기.
 * - 멜드: 같은 무늬 연속 3장 이상(런, A는 1로만: A-2-3 가능, Q-K-A 불가) · 같은 숫자 3~4장(세트).
 *         7은 특별: 7 한 장만으로도 등록 가능, 7끼리 모아도 되고, 7에는 같은 무늬 6·8을 붙여 런으로 키울 수 있음.
 * - 붙이기: 한 번이라도 등록한 사람만, 누구의 멜드에든 카드를 붙일 수 있음(같은 차례에 첫 등록 후 바로 가능).
 * - 땡큐: 누가 카드를 버리면, 버린 사람과 바로 다음 사람을 뺀 다른 사람이 그 카드로 바로 등록·붙이기를 할 수 있을 때
 *         "땡큐!"를 외치고 가져감. 가져간 사람이 이어서 차례를 진행(등록 후 1장 버림)하고, 그 다음 사람부터 계속.
 *         여럿이면 버린 사람 기준 차례가 빠른 사람이 우선.
 * - 손패를 모두 털면(마지막 장을 버리거나 등록으로) 라운드 승리. 나머지는 손에 남은 카드 점수만큼 벌점
 *   (A=1, 2~10 숫자대로, J=11, Q=12, K=13).
 * - 훌라: 그 라운드에 한 번도 등록하지 않았다가 한 차례에 모두 내려놓고 끝내면 벌점 2배.
 * - 더미가 떨어지면 스톱: 손패 점수가 가장 낮은 사람이 승리, 나머지는 자기 손패 점수만큼 벌점.
 * - 정해진 라운드를 마치면 벌점 합계가 가장 낮은 사람이 우승.
 */
import { createDeck, shuffleDeck, type Card } from '../../cards'
import type { Difficulty } from '../../lib/types'

export interface HulaPlayer {
  name: string
  isAI: boolean
}

export interface Meld {
  id: number
  owner: number
  cards: Card[]
}

export type Phase = 'draw' | 'play' | 'thankyou' | 'roundEnd'

export interface RoundResult {
  winner: number | null
  /** 같은 점수로 스톱 승리한 사람들 */
  winners: number[]
  hula: boolean
  reason: 'out' | 'stop'
  penalties: number[]
}

export interface HulaState {
  players: HulaPlayer[]
  hands: Card[][]
  deck: Card[]
  /** 버린 카드 더미 (맨 위 = 마지막) */
  discard: Card[]
  melds: Meld[]
  nextMeldId: number
  registered: boolean[]
  turn: number
  phase: Phase
  /** 버린 카드 더미/땡큐로 가져와 이번 차례에 꼭 써야 하는 카드 */
  mustUse: string | null
  /** 이번 차례 시작 때 등록한 적이 있었는지(훌라 판정) */
  regAtTurnStart: boolean
  /** 땡큐 후보(차례 순) */
  thankQueue: number[]
  /** 방금 버린 사람 */
  discarder: number
  round: number
  totalRounds: number
  scores: number[]
  result: RoundResult | null
  log: string[]
}

export const cardPoints = (c: Card) => c.rank
export const handPoints = (cs: readonly Card[]) => cs.reduce((a, c) => a + cardPoints(c), 0)

// ---------------------------------------------------------------------------
// 멜드 판정
// ---------------------------------------------------------------------------

export function isValidMeld(cards: readonly Card[]): boolean {
  const n = cards.length
  if (n === 0) return false
  if (cards.every((c) => c.rank === 7)) return new Set(cards.map((c) => c.suit)).size === n
  if (cards.every((c) => c.rank === cards[0].rank)) return n >= 3 && n <= 4 && new Set(cards.map((c) => c.suit)).size === n
  if (!cards.every((c) => c.suit === cards[0].suit)) return false
  const ranks = cards.map((c) => c.rank as number).sort((a, b) => a - b)
  for (let i = 1; i < n; i++) if (ranks[i] !== ranks[i - 1] + 1) return false
  return n >= 3 || (n === 2 && ranks.includes(7))
}

/** 멜드 카드 보기 좋게 정렬 */
export function sortMeld(cards: readonly Card[]): Card[] {
  const so = 'SHDC'
  return cards.slice().sort((a, b) => a.rank - b.rank || so.indexOf(a.suit) - so.indexOf(b.suit))
}

/** 손패에서 만들 수 있는 모든 멜드 후보(카드 인덱스) */
export function candidateMelds(hand: readonly Card[]): number[][] {
  const out: number[][] = []
  // 같은 숫자
  const byRank = new Map<number, number[]>()
  hand.forEach((c, i) => byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), i]))
  for (const [rank, idx] of byRank) {
    if (rank === 7) for (const i of idx) out.push([i])
    if (idx.length >= 3) {
      out.push(idx.slice(0, 3))
      if (idx.length === 4) {
        out.push(idx)
        out.push([idx[0], idx[1], idx[3]], [idx[0], idx[2], idx[3]], [idx[1], idx[2], idx[3]])
      }
    }
  }
  // 런
  for (const suit of ['S', 'H', 'D', 'C']) {
    const idx = hand.map((c, i) => (c.suit === suit ? i : -1)).filter((i) => i >= 0)
    idx.sort((a, b) => hand[a].rank - hand[b].rank)
    for (let s = 0; s < idx.length; s++) {
      let e = s
      while (e + 1 < idx.length && hand[idx[e + 1]].rank === hand[idx[e]].rank + 1) e++
      for (let a = s; a <= e; a++)
        for (let b = a + 1; b <= e; b++) {
          const seg = idx.slice(a, b + 1)
          if (isValidMeld(seg.map((i) => hand[i])) && !(seg.length === 1)) out.push(seg)
        }
    }
  }
  // 중복 제거
  const seen = new Set<string>()
  return out.filter((m) => {
    const k = m.slice().sort((a, b) => a - b).join(',')
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** 서로 겹치지 않는 멜드 조합 중 내려놓는 점수가 가장 큰 것 */
export function bestPartition(hand: readonly Card[], mustInclude?: number): number[][] {
  const cands = candidateMelds(hand)
  let best: number[][] = []
  let bestVal = -1
  const value = (ms: number[][]) => ms.reduce((a, m) => a + m.reduce((x, i) => x + cardPoints(hand[i]) + 0.01, 0), 0)
  const dfs = (start: number, used: Set<number>, chosen: number[][]) => {
    const ok = mustInclude == null || chosen.some((m) => m.includes(mustInclude))
    if (ok) {
      const v = value(chosen)
      if (v > bestVal) {
        bestVal = v
        best = chosen.slice()
      }
    }
    for (let k = start; k < cands.length; k++) {
      const m = cands[k]
      if (m.some((i) => used.has(i))) continue
      m.forEach((i) => used.add(i))
      chosen.push(m)
      dfs(k + 1, used, chosen)
      chosen.pop()
      m.forEach((i) => used.delete(i))
    }
  }
  dfs(0, new Set(), [])
  return bestVal < 0 ? [] : best
}

/** 이 카드를 테이블 멜드에 붙일 수 있는 멜드 id들 */
export function attachTargets(melds: readonly Meld[], card: Card): number[] {
  return melds.filter((m) => isValidMeld([...m.cards, card])).map((m) => m.id)
}

/** 손패 + 이 카드로 바로 쓸 수 있는지(새 멜드 또는, 등록한 적 있으면 붙이기) */
export function canUseCard(hand: readonly Card[], card: Card, registered: boolean, melds: readonly Meld[]): boolean {
  const h = [...hand, card]
  const k = h.length - 1
  if (candidateMelds(h).some((m) => m.includes(k))) return true
  return registered && attachTargets(melds, card).length > 0
}

// ---------------------------------------------------------------------------
// 진행
// ---------------------------------------------------------------------------

export function newGame(players: HulaPlayer[], totalRounds: number, starter: number, rng: () => number = Math.random): HulaState {
  return newRound(
    {
      players,
      hands: [],
      deck: [],
      discard: [],
      melds: [],
      nextMeldId: 1,
      registered: [],
      turn: starter,
      phase: 'draw',
      mustUse: null,
      regAtTurnStart: false,
      thankQueue: [],
      discarder: -1,
      round: 0,
      totalRounds,
      scores: players.map(() => 0),
      result: null,
      log: [],
    },
    starter,
    rng,
  )
}

export function newRound(s: HulaState, starter: number, rng: () => number = Math.random): HulaState {
  const n = s.players.length
  let deck = shuffleDeck(createDeck(), rng)
  const hands: Card[][] = s.players.map(() => [])
  for (let r = 0; r < 7; r++)
    for (let k = 0; k < n; k++) {
      hands[(starter + k) % n].push(deck[0])
      deck = deck.slice(1)
    }
  const discard = [deck[0]]
  deck = deck.slice(1)
  return {
    ...s,
    hands,
    deck,
    discard,
    melds: [],
    registered: s.players.map(() => false),
    turn: starter,
    phase: 'draw',
    mustUse: null,
    regAtTurnStart: false,
    thankQueue: [],
    discarder: -1,
    round: s.round + 1,
    result: null,
    log: [`${s.round + 1}라운드 시작! ${s.players[starter].name}님부터`],
  }
}

const addLog = (s: HulaState, msg: string) => [...s.log.slice(-5), msg]
const label = (c: Card) => `${{ S: '♠', H: '♥', D: '◆', C: '♣' }[c.suit]}${c.rank === 1 ? 'A' : c.rank === 11 ? 'J' : c.rank === 12 ? 'Q' : c.rank === 13 ? 'K' : c.rank}`
export const cardText = label

export const topDiscard = (s: HulaState): Card | null => s.discard[s.discard.length - 1] ?? null

/** 버린 카드 맨 위를 가져갈 수 있는지(차례 시작 시) */
export function canTakeDiscard(s: HulaState): boolean {
  const top = topDiscard(s)
  return s.phase === 'draw' && !!top && canUseCard(s.hands[s.turn], top, s.registered[s.turn], s.melds)
}

export function drawCard(s: HulaState): HulaState {
  if (s.phase !== 'draw') return s
  if (s.deck.length === 0) return endByStop(s)
  const c = s.deck[0]
  const hands = s.hands.map((h, i) => (i === s.turn ? [...h, c] : h))
  return { ...s, hands, deck: s.deck.slice(1), phase: 'play', regAtTurnStart: s.registered[s.turn], log: addLog(s, `${s.players[s.turn].name}: 더미에서 뽑음`) }
}

export function takeDiscard(s: HulaState): HulaState {
  if (!canTakeDiscard(s)) return s
  const c = topDiscard(s)!
  const hands = s.hands.map((h, i) => (i === s.turn ? [...h, c] : h))
  return {
    ...s,
    hands,
    discard: s.discard.slice(0, -1),
    phase: 'play',
    mustUse: c.id,
    regAtTurnStart: s.registered[s.turn],
    log: addLog(s, `${s.players[s.turn].name}: 버린 ${label(c)} 가져옴`),
  }
}

function checkOut(s: HulaState): HulaState {
  if (s.hands[s.turn].length > 0) return s
  return endByOut(s, s.turn)
}

export function register(s: HulaState, ids: readonly string[]): HulaState {
  if (s.phase !== 'play') return s
  const hand = s.hands[s.turn]
  const cards = ids.map((id) => hand.find((c) => c.id === id)).filter((c): c is Card => !!c)
  if (cards.length !== ids.length || !isValidMeld(cards)) return s
  const set = new Set(ids)
  const hands = s.hands.map((h, i) => (i === s.turn ? h.filter((c) => !set.has(c.id)) : h))
  const registered = s.registered.map((r, i) => r || i === s.turn)
  const melds = [...s.melds, { id: s.nextMeldId, owner: s.turn, cards: sortMeld(cards) }]
  const mustUse = s.mustUse && set.has(s.mustUse) ? null : s.mustUse
  return checkOut({
    ...s,
    hands,
    registered,
    melds,
    nextMeldId: s.nextMeldId + 1,
    mustUse,
    log: addLog(s, `${s.players[s.turn].name}: 등록 ${sortMeld(cards).map(label).join(' ')}`),
  })
}

export function attach(s: HulaState, cardId: string, meldId: number): HulaState {
  if (s.phase !== 'play' || !s.registered[s.turn]) return s
  const card = s.hands[s.turn].find((c) => c.id === cardId)
  const meld = s.melds.find((m) => m.id === meldId)
  if (!card || !meld || !isValidMeld([...meld.cards, card])) return s
  const hands = s.hands.map((h, i) => (i === s.turn ? h.filter((c) => c.id !== cardId) : h))
  const melds = s.melds.map((m) => (m.id === meldId ? { ...m, cards: sortMeld([...m.cards, card]) } : m))
  return checkOut({
    ...s,
    hands,
    melds,
    mustUse: s.mustUse === cardId ? null : s.mustUse,
    log: addLog(s, `${s.players[s.turn].name}: ${label(card)} 붙이기`),
  })
}

/** 땡큐 후보: 버린 사람·다음 사람 제외, 차례 순 */
function thankCandidates(s: HulaState, discarder: number, card: Card): number[] {
  const n = s.players.length
  const out: number[] = []
  for (let k = 2; k < n; k++) {
    const i = (discarder + k) % n
    if (canUseCard(s.hands[i], card, s.registered[i], s.melds)) out.push(i)
  }
  return out
}

export function discardCard(s: HulaState, cardId: string): HulaState {
  if (s.phase !== 'play' || s.mustUse) return s
  const card = s.hands[s.turn].find((c) => c.id === cardId)
  if (!card) return s
  const hands = s.hands.map((h, i) => (i === s.turn ? h.filter((c) => c.id !== cardId) : h))
  const next: HulaState = { ...s, hands, discard: [...s.discard, card], log: addLog(s, `${s.players[s.turn].name}: ${label(card)} 버림`) }
  if (hands[s.turn].length === 0) return endByOut(next, s.turn)
  const queue = thankCandidates(next, s.turn, card)
  if (queue.length) return { ...next, phase: 'thankyou', thankQueue: queue, discarder: s.turn }
  return { ...next, phase: 'draw', turn: (s.turn + 1) % s.players.length, discarder: s.turn }
}

/** 땡큐 후보 seat가 가져감 */
export function claimThankYou(s: HulaState, seat: number): HulaState {
  if (s.phase !== 'thankyou' || s.thankQueue[0] !== seat) return s
  const c = topDiscard(s)!
  const hands = s.hands.map((h, i) => (i === seat ? [...h, c] : h))
  return {
    ...s,
    hands,
    discard: s.discard.slice(0, -1),
    turn: seat,
    phase: 'play',
    mustUse: c.id,
    regAtTurnStart: s.registered[seat],
    thankQueue: [],
    log: addLog(s, `${s.players[seat].name}: 땡큐! ${label(c)}`),
  }
}

/** 땡큐 후보가 넘김 */
export function passThankYou(s: HulaState): HulaState {
  if (s.phase !== 'thankyou') return s
  const rest = s.thankQueue.slice(1)
  if (rest.length) return { ...s, thankQueue: rest }
  return { ...s, thankQueue: [], phase: 'draw', turn: (s.discarder + 1) % s.players.length }
}

function endByOut(s: HulaState, winner: number): HulaState {
  const hula = !s.regAtTurnStart
  const penalties = s.hands.map((h, i) => (i === winner ? 0 : handPoints(h) * (hula ? 2 : 1)))
  return {
    ...s,
    phase: 'roundEnd',
    mustUse: null,
    scores: s.scores.map((x, i) => x + penalties[i]),
    result: { winner, winners: [winner], hula, reason: 'out', penalties },
    log: addLog(s, hula ? `🎉 ${s.players[winner].name}: 훌라!` : `🎉 ${s.players[winner].name}: 다 털었어요!`),
  }
}

function endByStop(s: HulaState): HulaState {
  const pts = s.hands.map(handPoints)
  const low = Math.min(...pts)
  const winners = pts.map((p, i) => (p === low ? i : -1)).filter((i) => i >= 0)
  const penalties = pts.map((p) => (p === low ? 0 : p))
  return {
    ...s,
    phase: 'roundEnd',
    scores: s.scores.map((x, i) => x + penalties[i]),
    result: { winner: winners.length === 1 ? winners[0] : null, winners, hula: false, reason: 'stop', penalties },
    log: addLog(s, '더미가 떨어져서 스톱!'),
  }
}

export const isGameOver = (s: HulaState) => s.phase === 'roundEnd' && s.round >= s.totalRounds

/** 다음 라운드: 지난 라운드 승자(여럿이면 그중 첫 사람)가 먼저 */
export function nextRound(s: HulaState, rng: () => number = Math.random): HulaState {
  const starter = s.result?.winners[0] ?? (s.turn + 1) % s.players.length
  return newRound(s, starter, rng)
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export type HulaAction =
  | { type: 'draw' }
  | { type: 'take' }
  | { type: 'register'; ids: string[] }
  | { type: 'attach'; cardId: string; meldId: number }
  | { type: 'discard'; cardId: string }

export function applyHula(s: HulaState, a: HulaAction): HulaState {
  switch (a.type) {
    case 'draw':
      return drawCard(s)
    case 'take':
      return takeDiscard(s)
    case 'register':
      return register(s, a.ids)
    case 'attach':
      return attach(s, a.cardId, a.meldId)
    case 'discard':
      return discardCard(s, a.cardId)
  }
}

/** 멜드 후보에 걸칠 만한 카드인지(짝·연결 가능성) */
function usefulness(hand: readonly Card[], c: Card): number {
  let u = 0
  for (const o of hand) {
    if (o.id === c.id) continue
    if (o.rank === c.rank) u += 2
    if (o.suit === c.suit) {
      const d = Math.abs(o.rank - c.rank)
      if (d === 1) u += 2
      else if (d === 2) u += 1
    }
  }
  if (c.rank === 7) u += 5
  return u
}

function chooseDiscard(s: HulaState, seat: number, d: Difficulty, rng: () => number): Card {
  const hand = s.hands[seat]
  const options = hand.filter((c) => c.id !== s.mustUse)
  if (d === 'easy' && rng() < 0.35) return options[Math.floor(rng() * options.length)]
  const next = (seat + 1) % s.players.length
  let best = options[0]
  let bestV = Infinity
  for (const c of options) {
    let v = usefulness(hand, c) * 3 - cardPoints(c) * 0.6
    if (d === 'hard') {
      // 다음 사람이 바로 쓸 수 있는 카드는 피함(보이는 정보: 테이블 멜드 붙이기)
      if (s.registered[next] && attachTargets(s.melds, c).length) v += 8
      if (attachTargets(s.melds, c).length) v += 3
    }
    if (v < bestV) {
      bestV = v
      best = c
    }
  }
  return best
}

/** 지금 상태에서 AI가 할 다음 행동 하나 */
export function aiAction(s: HulaState, d: Difficulty, rng: () => number = Math.random): HulaAction {
  const seat = s.turn
  const hand = s.hands[seat]
  if (s.phase === 'draw') {
    const top = topDiscard(s)
    if (top && canTakeDiscard(s)) {
      // 가져와서 쓰면 이득인지: 새 멜드에 들어가거나 붙일 수 있으면 거의 항상 이득
      const takeP = d === 'easy' ? 0.5 : d === 'normal' ? 0.9 : 1
      if (rng() < takeP) return { type: 'take' }
    }
    if (s.deck.length === 0 && top && canTakeDiscard(s)) return { type: 'take' }
    return { type: 'draw' }
  }
  // play
  const mustIdx = s.mustUse ? hand.findIndex((c) => c.id === s.mustUse) : -1
  if (mustIdx >= 0) {
    const part = bestPartition(hand, mustIdx)
    const m = part.find((x) => x.includes(mustIdx))
    if (m) return { type: 'register', ids: m.map((i) => hand[i].id) }
    const targets = attachTargets(s.melds, hand[mustIdx])
    if (s.registered[seat] && targets.length) return { type: 'attach', cardId: hand[mustIdx].id, meldId: targets[0] }
  }
  const part = bestPartition(hand)
  const meldedCount = part.reduce((a, m) => a + m.length, 0)
  const left = hand.length - meldedCount
  // 훌라 노리기: 어려움 AI는 아직 등록 전이고 초반이면 멜드를 숨겨둠(남는 카드가 많을 때만)
  const holdForHula =
    d === 'hard' &&
    !s.registered[seat] &&
    left > 1 &&
    left <= 3 &&
    s.deck.length > 14 &&
    s.hands.every((h, i) => i === seat || h.length >= 4) &&
    handPoints(hand) < 45
  const easySkip = d === 'easy' && rng() < 0.25
  if (part.length && !holdForHula && !easySkip) return { type: 'register', ids: part[0].map((i) => hand[i].id) }
  if (s.registered[seat] && !(d === 'easy' && rng() < 0.3)) {
    // 붙일 수 있는 카드 중 점수 높은 것부터 (손패가 1장 남으면 붙여서 끝낼 수 있음)
    const opts = hand
      .map((c) => ({ c, t: attachTargets(s.melds, c) }))
      .filter((x) => x.t.length)
      .sort((a, b) => cardPoints(b.c) - cardPoints(a.c))
    if (opts.length) return { type: 'attach', cardId: opts[0].c.id, meldId: opts[0].t[0] }
  }
  return { type: 'discard', cardId: chooseDiscard(s, seat, d, rng).id }
}

/** 땡큐 할지 */
export function aiWantsThankYou(s: HulaState, seat: number, d: Difficulty, rng: () => number = Math.random): boolean {
  const top = topDiscard(s)
  if (!top || !canUseCard(s.hands[seat], top, s.registered[seat], s.melds)) return false
  const p = d === 'easy' ? 0.45 : d === 'normal' ? 0.85 : 1
  return rng() < p
}
