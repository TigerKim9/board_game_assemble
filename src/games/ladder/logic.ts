/** rungs[row][col] === true → a horizontal rung joins column col and col+1 at that row. */
export type Ladder = boolean[][]

export const MIN_PEOPLE = 2
export const MAX_PEOPLE = 10

export function rowsFor(cols: number): number {
  return Math.max(8, Math.min(14, cols + 5))
}

/**
 * Random ladder. Rungs never touch in the same row (no ambiguous junctions)
 * and every adjacent pair of columns gets at least one rung so everybody mixes.
 */
export function makeLadder(cols: number, rows = rowsFor(cols), rng: () => number = Math.random): Ladder {
  const rungs: Ladder = Array.from({ length: rows }, () => Array<boolean>(Math.max(0, cols - 1)).fill(false))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (c > 0 && rungs[r][c - 1]) continue
      rungs[r][c] = rng() < 0.42
    }
  }
  // Guarantee at least one rung per gap.
  for (let c = 0; c < cols - 1; c++) {
    if (rungs.some((row) => row[c])) continue
    const free = rungs
      .map((row, r) => ({ row, r }))
      .filter(({ row }) => !row[c - 1] && !row[c + 1])
    const pickRow = free.length ? free[Math.floor(rng() * free.length)].r : Math.floor(rng() * rows)
    rungs[pickRow][c] = true
    if (rungs[pickRow][c - 1]) rungs[pickRow][c - 1] = false
    if (rungs[pickRow][c + 1]) rungs[pickRow][c + 1] = false
  }
  return rungs
}

export interface PathPoint {
  col: number
  /** 0 = top, rows + 1 = bottom; rung r sits at level r + 1. */
  level: number
}

/** Walk down from a start column; returns every corner point and the end column. */
export function tracePath(ladder: Ladder, start: number): { points: PathPoint[]; end: number } {
  const rows = ladder.length
  let col = start
  const points: PathPoint[] = [{ col, level: 0 }]
  for (let r = 0; r < rows; r++) {
    const level = r + 1
    if (ladder[r][col]) {
      points.push({ col, level }, { col: col + 1, level })
      col += 1
    } else if (col > 0 && ladder[r][col - 1]) {
      points.push({ col, level }, { col: col - 1, level })
      col -= 1
    }
  }
  points.push({ col, level: rows + 1 })
  return { points, end: col }
}

/** mapping[start] = end column. Always a permutation. */
export function mapping(ladder: Ladder, cols: number): number[] {
  return Array.from({ length: cols }, (_, i) => tracePath(ladder, i).end)
}

export type Preset = 'one-win' | 'one-penalty' | 'order' | 'half'

export function presetResults(preset: Preset, n: number): string[] {
  switch (preset) {
    case 'one-win':
      return Array.from({ length: n }, (_, i) => (i === 0 ? '당첨' : '꽝'))
    case 'one-penalty':
      return Array.from({ length: n }, (_, i) => (i === 0 ? '벌칙' : '통과'))
    case 'order':
      return Array.from({ length: n }, (_, i) => `${i + 1}번`)
    case 'half':
      return Array.from({ length: n }, (_, i) => (i < Math.floor(n / 2) ? '청팀' : '백팀'))
  }
}

/** Resize a list to n entries, filling new slots from the fallback. */
export function fitList(list: string[], n: number, fallback: (i: number) => string): string[] {
  return Array.from({ length: n }, (_, i) => list[i] ?? fallback(i))
}
