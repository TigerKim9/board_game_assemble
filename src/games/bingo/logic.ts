import { shuffle } from '../../lib/random'

export type BingoMode = '75' | '25'
export const FREE = 0
export const LETTERS = ['B', 'I', 'N', 'G', 'O']

/** All 12 lines on a 5×5 card as lists of cell indices (rows, columns, two diagonals). */
export const LINES: number[][] = [
  ...Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => r * 5 + c)),
  ...Array.from({ length: 5 }, (_, c) => Array.from({ length: 5 }, (_, r) => r * 5 + c)),
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
]

export function maxNumber(mode: BingoMode): number {
  return mode === '75' ? 75 : 25
}

/**
 * 75-ball card: column c holds 5 distinct numbers from 15c+1..15c+15, center is FREE.
 * 25 card: a shuffle of 1..25.
 */
export function makeCard(mode: BingoMode, rng: () => number = Math.random): number[] {
  if (mode === '25') return shuffle(Array.from({ length: 25 }, (_, i) => i + 1), rng)
  const cols = Array.from({ length: 5 }, (_, c) =>
    shuffle(
      Array.from({ length: 15 }, (_, i) => c * 15 + i + 1),
      rng,
    ).slice(0, 5),
  )
  const card: number[] = []
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) card.push(r === 2 && c === 2 ? FREE : cols[c][r])
  return card
}

export function initialMarks(card: number[]): boolean[] {
  return card.map((n) => n === FREE)
}

export function callOrder(mode: BingoMode, rng: () => number = Math.random): number[] {
  return shuffle(
    Array.from({ length: maxNumber(mode) }, (_, i) => i + 1),
    rng,
  )
}

export function completedLines(marked: boolean[]): number[] {
  return LINES.map((line, i) => (line.every((c) => marked[c]) ? i : -1)).filter((i) => i >= 0)
}

export function countLines(marked: boolean[]): number {
  return completedLines(marked).length
}

/** Mark every called number on the card (what the computer players do). */
export function autoMark(card: number[], marked: boolean[], called: Iterable<number>): boolean[] {
  const set = new Set(called)
  return card.map((n, i) => marked[i] || n === FREE || set.has(n))
}

/** Can a human mark this cell? Only numbers that have already been called. */
export function canMark(card: number[], cell: number, called: Iterable<number>): boolean {
  const n = card[cell]
  if (n === FREE) return false
  for (const c of called) if (c === n) return true
  return false
}

export function label(n: number, mode: BingoMode): string {
  return mode === '75' ? `${LETTERS[Math.floor((n - 1) / 15)]}-${n}` : String(n)
}

/** Cells still missing for the closest line (for "리치!" hints). */
export function closestLineMissing(marked: boolean[]): number {
  return Math.min(...LINES.map((l) => l.filter((c) => !marked[c]).length))
}

/** Indices of players whose card has at least `target` lines. */
export function winnersFor(marks: boolean[][], target: number): number[] {
  return marks.map((m, i) => (countLines(m) >= target ? i : -1)).filter((i) => i >= 0)
}
