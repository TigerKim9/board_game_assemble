import { CHEONGDAN_IDS, CHODAN_IDS, HONGDAN_IDS, getCard, monthOf, newDeckIds } from '../../hwatu'
import type { Difficulty } from '../../lib/types'

// ---------- 점수 ----------

export const CARD_POINTS = { gwang: 20, yeol: 10, tti: 5, pi: 0 } as const

export function cardPoints(id: number): number {
  return CARD_POINTS[getCard(id).kind]
}

export interface Yak {
  key: string
  name: string
  ids: number[]
  bonus: number
}

const monthIds = (m: number) => [0, 1, 2, 3].map((s) => (m - 1) * 4 + s)

/** 민화투 약 (이 게임의 규칙) */
export const YAKS: Yak[] = [
  { key: 'hong', name: '홍단', ids: [...HONGDAN_IDS], bonus: 30 },
  { key: 'cheong', name: '청단', ids: [...CHEONGDAN_IDS], bonus: 30 },
  { key: 'cho', name: '초단', ids: [...CHODAN_IDS], bonus: 30 },
  { key: 'cho4', name: '초약(흑싸리)', ids: monthIds(4), bonus: 20 },
  { key: 'cho5', name: '초약(난초)', ids: monthIds(5), bonus: 20 },
  { key: 'cho7', name: '초약(홍싸리)', ids: monthIds(7), bonus: 20 },
  { key: 'pung', name: '풍약', ids: monthIds(10), bonus: 20 },
  { key: 'bi', name: '비약', ids: monthIds(12), bonus: 20 },
]

export function yaksOf(captured: number[]): Yak[] {
  const set = new Set(captured)
  return YAKS.filter((y) => y.ids.every((id) => set.has(id)))
}

export interface Score {
  base: number
  yaks: Yak[]
  total: number
}

export function scoreOf(captured: number[]): Score {
  const base = captured.reduce((a, id) => a + cardPoints(id), 0)
  const yaks = yaksOf(captured)
  return { base, yaks, total: base + yaks.reduce((a, y) => a + y.bonus, 0) }
}

// ---------- 상태 ----------

export interface MPlayer {
  name: string
  isAI: boolean
  hand: number[]
  captured: number[]
}

export type Phase =
  | { kind: 'play' }
  | { kind: 'chooseHand'; card: number; options: number[] }
  | { kind: 'flip' }
  | { kind: 'chooseFlip'; card: number; options: number[] }
  | { kind: 'over' }

export interface MState {
  players: MPlayer[]
  floor: number[]
  deck: number[]
  turn: number
  phase: Phase
  /** 마지막 사건 설명 (화면 표시용) */
  message: string
  /** 이번 차례에 뒤집은 카드 */
  flipped: number | null
  /** 이번 차례에 낸 카드 */
  played: number | null
}

export const DEAL: Record<number, { hand: number; floor: number }> = {
  2: { hand: 10, floor: 8 },
  3: { hand: 7, floor: 6 },
}

function hasFourOnFloor(floor: number[]): boolean {
  const c = new Map<number, number>()
  for (const id of floor) c.set(monthOf(id), (c.get(monthOf(id)) ?? 0) + 1)
  return [...c.values()].some((n) => n >= 4)
}

export function deal(players: { name: string; isAI: boolean }[], rng: () => number = Math.random, first = 0): MState {
  const { hand, floor } = DEAL[players.length]
  for (;;) {
    const deck = newDeckIds(rng)
    const ps = players.map((p) => ({ ...p, hand: deck.splice(0, hand).sort((a, b) => a - b), captured: [] as number[] }))
    const fl = deck.splice(0, floor)
    if (hasFourOnFloor(fl)) continue // 바닥에 같은 달 4장이면 다시 섞기
    return { players: ps, floor: fl, deck, turn: first, phase: { kind: 'play' }, message: '', flipped: null, played: null }
  }
}

export function matchesOnFloor(floor: number[], card: number): number[] {
  return floor.filter((f) => monthOf(f) === monthOf(card))
}

function clone(s: MState): MState {
  return { ...s, players: s.players.map((p) => ({ ...p, hand: p.hand.slice(), captured: p.captured.slice() })), floor: s.floor.slice(), deck: s.deck.slice() }
}

const nameOf = (id: number) => getCard(id).label

function batchim(word: string): number {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code >= 0 && code <= 11171 ? code % 28 : 0
}
/** 받침에 맞는 조사: 을/를 */
export const eulReul = (w: string) => w + (batchim(w) ? '을' : '를')
/** 받침에 맞는 조사: 으로/로 (ㄹ 받침은 '로') */
export const euroRo = (w: string) => w + (batchim(w) && batchim(w) !== 8 ? '으로' : '로')

/** 카드 한 장을 바닥과 맞춤. 고를 게 있으면 options 반환 */
function resolve(s: MState, card: number, choice?: number): { done: boolean; options?: number[] } {
  const p = s.players[s.turn]
  const m = matchesOnFloor(s.floor, card)
  if (m.length === 0) {
    s.floor.push(card)
    return { done: true }
  }
  let take: number[]
  if (m.length === 2) {
    if (choice == null || !m.includes(choice)) return { done: false, options: m }
    take = [choice]
  } else take = m // 1장 또는 3장(싹쓸이)
  s.floor = s.floor.filter((f) => !take.includes(f))
  p.captured.push(card, ...take)
  s.message += `${p.name}: ${euroRo(nameOf(card))} ${take.map(nameOf).join(', ')} 먹음. `
  return { done: true }
}

function endTurn(s: MState): MState {
  if (s.players.every((p) => p.hand.length === 0)) {
    s.phase = { kind: 'over' }
    return s
  }
  s.turn = (s.turn + 1) % s.players.length
  s.phase = { kind: 'play' }
  return s
}

/** 손패에서 한 장 내기 */
export function playCard(s0: MState, card: number, choice?: number): MState {
  if (s0.phase.kind !== 'play') return s0
  const s = clone(s0)
  const p = s.players[s.turn]
  if (!p.hand.includes(card)) return s0
  p.hand = p.hand.filter((c) => c !== card)
  s.message = ''
  s.played = card
  s.flipped = null
  const r = resolve(s, card, choice)
  if (!r.done) {
    s.phase = { kind: 'chooseHand', card, options: r.options! }
    return s
  }
  if (!s.message) s.message = `${p.name}: ${eulReul(nameOf(card))} 바닥에 냄. `
  s.phase = { kind: 'flip' }
  return s
}

export function chooseHand(s0: MState, target: number): MState {
  if (s0.phase.kind !== 'chooseHand') return s0
  const s = clone(s0)
  const r = resolve(s, s0.phase.card, target)
  if (!r.done) return s0
  s.phase = { kind: 'flip' }
  return s
}

/** 더미에서 한 장 뒤집기 */
export function flip(s0: MState): MState {
  if (s0.phase.kind !== 'flip') return s0
  const s = clone(s0)
  const card = s.deck.shift()
  if (card == null) return endTurn(s)
  s.flipped = card
  const r = resolve(s, card)
  if (!r.done) {
    s.phase = { kind: 'chooseFlip', card, options: r.options! }
    return s
  }
  return endTurn(s)
}

export function chooseFlip(s0: MState, target: number): MState {
  if (s0.phase.kind !== 'chooseFlip') return s0
  const s = clone(s0)
  const r = resolve(s, s0.phase.card, target)
  if (!r.done) return s0
  return endTurn(s)
}

export function ranking(s: MState): { i: number; score: Score }[] {
  return s.players.map((p, i) => ({ i, score: scoreOf(p.captured) })).sort((a, b) => b.score.total - a.score.total)
}

// ---------- AI ----------

/** 이 카드를 얻었을 때의 가치(점수 + 약 진행 보너스) */
export function captureValue(id: number, mine: number[], others: number[][], diff: Difficulty): number {
  let v = cardPoints(id)
  if (diff === 'easy') return v
  const set = new Set(mine)
  for (const y of YAKS) {
    if (!y.ids.includes(id)) continue
    // 다른 사람이 이미 하나라도 가졌으면 이 약은 불가능
    if (others.some((o) => o.some((c) => y.ids.includes(c)))) {
      if (diff === 'hard') {
        // 상대가 거의 다 모은 약이면 막는 가치
        const best = Math.max(...others.map((o) => o.filter((c) => y.ids.includes(c)).length))
        if (best >= y.ids.length - 1) v += y.bonus * 0.8
      }
      continue
    }
    const have = y.ids.filter((c) => set.has(c)).length
    v += (y.bonus * (have + 1)) / y.ids.length / (diff === 'hard' ? 1 : 2)
  }
  return v
}

function bestOption(options: number[], s: MState, diff: Difficulty, rng: () => number): number {
  if (diff === 'easy' && rng() < 0.5) return options[Math.floor(rng() * options.length)]
  const me = s.players[s.turn]
  const others = s.players.filter((_, i) => i !== s.turn).map((p) => p.captured)
  return options.slice().sort((a, b) => captureValue(b, me.captured, others, diff) - captureValue(a, me.captured, others, diff))[0]
}

export function aiChoose(s: MState, diff: Difficulty, rng: () => number = Math.random): number {
  if (s.phase.kind === 'chooseHand' || s.phase.kind === 'chooseFlip') return bestOption(s.phase.options, s, diff, rng)
  throw new Error('no choice pending')
}

/** 낼 카드 고르기 */
export function aiPlay(s: MState, diff: Difficulty, rng: () => number = Math.random): number {
  const me = s.players[s.turn]
  const others = s.players.filter((_, i) => i !== s.turn).map((p) => p.captured)
  const val = (id: number) => captureValue(id, me.captured, others, diff)
  if (diff === 'easy') {
    const matching = me.hand.filter((c) => matchesOnFloor(s.floor, c).length > 0)
    const pool = matching.length && rng() < 0.75 ? matching : me.hand
    return pool[Math.floor(rng() * pool.length)]
  }
  // 이미 공개된 카드(바닥·먹은 패·내 손)로 같은 달 남은 장수를 셈
  const seen = new Map<number, number>()
  const see = (id: number) => seen.set(monthOf(id), (seen.get(monthOf(id)) ?? 0) + 1)
  s.floor.forEach(see)
  s.players.forEach((p) => p.captured.forEach(see))
  me.hand.forEach(see)

  let best = me.hand[0]
  let bestV = -Infinity
  for (const c of me.hand) {
    const m = matchesOnFloor(s.floor, c)
    let v: number
    if (m.length === 0) {
      // 버리는 카드: 상대가 가져갈 위험(같은 달이 아직 숨어 있으면)만큼 손해
      const hidden = 4 - (seen.get(monthOf(c)) ?? 0)
      const myPair = me.hand.filter((h) => h !== c && monthOf(h) === monthOf(c)).length
      v = -val(c) * (hidden > 0 ? 0.6 : 0.1) - 2
      if (myPair > 0) v += diff === 'hard' ? 4 + val(c) * 0.3 : 2 // 나중에 내가 먹을 수 있음
    } else if (m.length === 3) {
      v = val(c) + m.reduce((a, x) => a + val(x), 0) + 5
    } else {
      const tgt = m.length === 2 ? m.reduce((a, b) => (val(a) >= val(b) ? a : b)) : m[0]
      v = val(c) + val(tgt)
      // 2장 중 하나만 먹으면 나머지 한 장이 남아 상대가 먹을 수 있음
      if (m.length === 2 && diff === 'hard') v -= Math.min(val(m[0]), val(m[1])) * 0.3
    }
    v += rng() * (diff === 'hard' ? 0.5 : 3)
    if (v > bestV) {
      bestV = v
      best = c
    }
  }
  return best
}
