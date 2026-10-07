import { shuffle } from '../../lib/random'
import type { Difficulty } from '../../lib/types'

export interface GridSize {
  id: string
  cols: number
  rows: number
}

export const SIZES: GridSize[] = [
  { id: '4x3', cols: 4, rows: 3 },
  { id: '4x4', cols: 4, rows: 4 },
  { id: '5x4', cols: 5, rows: 4 },
  { id: '6x5', cols: 6, rows: 5 },
  { id: '6x6', cols: 6, rows: 6 },
]

export const FACES = [
  '🍎', '🍌', '🍇', '🍓', '🍉', '🍑', '🥝', '🍍', '🥕', '🌽',
  '🐶', '🐱', '🐼', '🦊', '🐸', '🐧', '🦁', '🐙', '🦄', '🐝',
  '⚽', '🎈', '🚀', '🌈', '⭐', '🎸', '🍩', '🧁',
]

export interface Card {
  face: string
  matched: boolean
  /** Index of the player who found this pair. */
  owner: number | null
}

export function pairsFor(size: GridSize): number {
  return (size.cols * size.rows) / 2
}

export function makeDeck(pairs: number, rng: () => number = Math.random): Card[] {
  const faces = shuffle(FACES, rng).slice(0, pairs)
  return shuffle([...faces, ...faces], rng).map((face) => ({ face, matched: false, owner: null }))
}

export function isMatch(cards: Card[], a: number, b: number): boolean {
  return a !== b && cards[a].face === cards[b].face
}

export function allMatched(cards: Card[]): boolean {
  return cards.every((c) => c.matched)
}

/** What an AI remembers: card index → face. */
export type Memory = Record<number, string>

const REMEMBER: Record<Difficulty, number> = { easy: 0.45, normal: 0.75, hard: 1 }
const FORGET: Record<Difficulty, number> = { easy: 0.2, normal: 0.07, hard: 0 }

/** The AI sees a card flipped face up; it may or may not stick. */
export function observe(mem: Memory, idx: number, face: string, diff: Difficulty, rng = Math.random): Memory {
  if (rng() >= REMEMBER[diff]) return mem
  return { ...mem, [idx]: face }
}

/** Memories fade a little every turn; matched cards are dropped. */
export function fade(mem: Memory, cards: Card[], diff: Difficulty, rng = Math.random): Memory {
  const out: Memory = {}
  for (const [k, face] of Object.entries(mem)) {
    const i = Number(k)
    if (cards[i]?.matched) continue
    if (rng() < FORGET[diff]) continue
    out[i] = face
  }
  return out
}

function knownPair(mem: Memory, cards: Card[]): [number, number] | null {
  const seen: Record<string, number> = {}
  for (const [k, face] of Object.entries(mem)) {
    const i = Number(k)
    if (cards[i].matched) continue
    if (seen[face] !== undefined) return [seen[face], i]
    seen[face] = i
  }
  return null
}

function pickRandom(list: number[], rng: () => number): number {
  return list[Math.floor(rng() * list.length)]
}

/** AI picks the first card of its turn. */
export function aiFirst(cards: Card[], mem: Memory, rng = Math.random): number {
  const pair = knownPair(mem, cards)
  if (pair) return pair[0]
  const open = cards.map((c, i) => (c.matched ? -1 : i)).filter((i) => i >= 0)
  const unknown = open.filter((i) => mem[i] === undefined)
  return pickRandom(unknown.length ? unknown : open, rng)
}

/** AI picks the second card after seeing the first one. */
export function aiSecond(cards: Card[], mem: Memory, first: number, rng = Math.random): number {
  const face = cards[first].face
  for (const [k, f] of Object.entries(mem)) {
    const i = Number(k)
    if (i !== first && f === face && !cards[i].matched) return i
  }
  const open = cards.map((c, i) => (c.matched || i === first ? -1 : i)).filter((i) => i >= 0)
  const unknown = open.filter((i) => mem[i] === undefined)
  return pickRandom(unknown.length ? unknown : open, rng)
}

export function pairCounts(cards: Card[], players: number): number[] {
  const counts = Array.from({ length: players }, () => 0)
  for (const c of cards) if (c.matched && c.owner != null) counts[c.owner]++
  return counts.map((n) => n / 2)
}
