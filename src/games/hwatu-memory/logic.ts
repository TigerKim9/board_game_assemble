import { monthOf } from '../../hwatu'
import { shuffle } from '../../lib/random'
import type { Difficulty } from '../../lib/types'

export type Size = 24 | 48

export interface MemState {
  /** 자리별 카드 id */
  cards: number[]
  gone: boolean[]
  /** 앞면으로 뒤집힌 자리 (최대 2) */
  up: number[]
  scores: number[]
  /** 사람별로 쓴 차례 수 */
  turns: number[]
  turn: number
  /** 자리별로 가져간 사람 */
  owner: (number | null)[]
}

/** size 24: 무작위 6개 달의 카드 4장씩, 48: 전체 */
export function newGame(players: number, size: Size, rng: () => number = Math.random): MemState {
  const months = shuffle(
    Array.from({ length: 12 }, (_, i) => i + 1),
    rng,
  ).slice(0, size / 4)
  const ids = months.flatMap((m) => [0, 1, 2, 3].map((s) => (m - 1) * 4 + s))
  const cards = shuffle(ids, rng)
  return {
    cards,
    gone: cards.map(() => false),
    up: [],
    scores: Array(players).fill(0),
    turns: Array(players).fill(0),
    turn: 0,
    owner: cards.map(() => null),
  }
}

export function canFlip(s: MemState, pos: number): boolean {
  return s.up.length < 2 && !s.gone[pos] && !s.up.includes(pos) && pos >= 0 && pos < s.cards.length
}

export function flipCard(s: MemState, pos: number): MemState {
  if (!canFlip(s, pos)) return s
  return { ...s, up: [...s.up, pos] }
}

export function isPair(s: MemState): boolean {
  return s.up.length === 2 && monthOf(s.cards[s.up[0]]) === monthOf(s.cards[s.up[1]])
}

/** 두 장이 뒤집힌 뒤 처리: 짝이면 가져가고 같은 사람이 계속, 아니면 덮고 다음 사람 */
export function settle(s: MemState): MemState {
  if (s.up.length < 2) return s
  const turns = s.turns.slice()
  turns[s.turn]++
  if (isPair(s)) {
    const gone = s.gone.slice()
    const owner = s.owner.slice()
    for (const p of s.up) {
      gone[p] = true
      owner[p] = s.turn
    }
    const scores = s.scores.slice()
    scores[s.turn]++
    return { ...s, gone, owner, scores, turns, up: [] }
  }
  return { ...s, turns, up: [], turn: (s.turn + 1) % s.scores.length }
}

export const isOver = (s: MemState) => s.gone.every(Boolean)

// ---------- AI 기억 ----------

/** 자리 → 달 */
export type Memory = Record<number, number>

export const MEMORY: Record<Difficulty, { remember: number; forget: number }> = {
  easy: { remember: 0.35, forget: 0.2 },
  normal: { remember: 0.65, forget: 0.08 },
  hard: { remember: 0.95, forget: 0.01 },
}

/** 누군가 카드를 뒤집는 걸 봄 → 확률적으로 기억 */
export function observe(mem: Memory, s: MemState, pos: number, diff: Difficulty, rng: () => number): Memory {
  if (rng() > MEMORY[diff].remember) return mem
  return { ...mem, [pos]: monthOf(s.cards[pos]) }
}

/** 차례마다 조금씩 잊어버림 + 사라진 카드 정리 */
export function decay(mem: Memory, s: MemState, diff: Difficulty, rng: () => number): Memory {
  const out: Memory = {}
  for (const [k, v] of Object.entries(mem)) {
    const pos = Number(k)
    if (s.gone[pos]) continue
    if (rng() < MEMORY[diff].forget) continue
    out[pos] = v
  }
  return out
}

/** AI가 다음에 뒤집을 자리 */
export function aiPick(s: MemState, mem: Memory, rng: () => number = Math.random): number {
  const open = s.cards.map((_, i) => i).filter((i) => canFlip(s, i))
  const known = (i: number) => mem[i] !== undefined
  if (s.up.length === 0) {
    // 기억 속에 짝이 있으면 그걸 뒤집음
    const byMonth = new Map<number, number[]>()
    for (const i of open) if (known(i)) byMonth.set(mem[i], [...(byMonth.get(mem[i]) ?? []), i])
    for (const ps of byMonth.values()) if (ps.length >= 2) return ps[0]
    const unknown = open.filter((i) => !known(i))
    const pool = unknown.length ? unknown : open
    return pool[Math.floor(rng() * pool.length)]
  }
  // 두 번째 장: 첫 장과 같은 달을 기억하면 그걸
  const first = monthOf(s.cards[s.up[0]])
  const match = open.find((i) => mem[i] === first)
  if (match !== undefined) return match
  // 모르는 카드 중에서 고름 (아는 카드는 틀린 걸 알기 때문)
  const unknown = open.filter((i) => !known(i))
  const pool = unknown.length ? unknown : open
  return pool[Math.floor(rng() * pool.length)]
}
