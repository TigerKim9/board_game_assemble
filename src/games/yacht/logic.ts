
export const CATEGORIES = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'choice',
  'fourKind',
  'fullHouse',
  'smallStraight',
  'largeStraight',
  'yacht',
] as const
export type Category = (typeof CATEGORIES)[number]

export const LABELS: Record<Category, string> = {
  ones: '1 (에이스)',
  twos: '2 (듀스)',
  threes: '3 (트레이)',
  fours: '4 (포)',
  fives: '5 (파이브)',
  sixes: '6 (식스)',
  choice: '초이스',
  fourKind: '포 카드',
  fullHouse: '풀 하우스',
  smallStraight: '스몰 스트레이트',
  largeStraight: '라지 스트레이트',
  yacht: '요트',
}

export const UPPER: Category[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes']
export const BONUS_THRESHOLD = 63
export const BONUS = 35

export type Scores = Partial<Record<Category, number>>

function counts(dice: number[]): number[] {
  const c = [0, 0, 0, 0, 0, 0, 0]
  for (const d of dice) c[d]++
  return c
}

const sum = (dice: number[]) => dice.reduce((a, b) => a + b, 0)

export function scoreFor(cat: Category, dice: number[]): number {
  const c = counts(dice)
  const upperIdx = UPPER.indexOf(cat)
  if (upperIdx >= 0) return c[upperIdx + 1] * (upperIdx + 1)
  switch (cat) {
    case 'choice':
      return sum(dice)
    case 'fourKind':
      return c.some((n) => n >= 4) ? sum(dice) : 0
    case 'fullHouse': {
      const nz = c.filter((n) => n > 0).sort()
      return (nz.length === 2 && nz[0] === 2 && nz[1] === 3) || nz.length === 1 ? sum(dice) : 0
    }
    case 'smallStraight': {
      const has = (n: number) => c[n] > 0
      const ok =
        (has(1) && has(2) && has(3) && has(4)) ||
        (has(2) && has(3) && has(4) && has(5)) ||
        (has(3) && has(4) && has(5) && has(6))
      return ok ? 15 : 0
    }
    case 'largeStraight': {
      const s = [...dice].sort().join('')
      return s === '12345' || s === '23456' ? 30 : 0
    }
    case 'yacht':
      return c.some((n) => n === 5) ? 50 : 0
  }
  return 0
}

export function upperTotal(scores: Scores): number {
  return UPPER.reduce((a, k) => a + (scores[k] ?? 0), 0)
}

export function bonusFor(scores: Scores): number {
  return upperTotal(scores) >= BONUS_THRESHOLD ? BONUS : 0
}

export function total(scores: Scores): number {
  return CATEGORIES.reduce((a, k) => a + (scores[k] ?? 0), 0) + bonusFor(scores)
}

export function isComplete(scores: Scores): boolean {
  return CATEGORIES.every((k) => scores[k] !== undefined)
}

export function roll(dice: number[], held: boolean[], rng: () => number = Math.random): number[] {
  return dice.map((d, i) => (held[i] ? d : Math.floor(rng() * 6) + 1))
}

// ---------- AI ----------

/** Rough expected value of each category for an average game; used to avoid wasting strong boxes. */
const BASELINE: Record<Category, number> = {
  ones: 2,
  twos: 5,
  threes: 8,
  fours: 11,
  fives: 14,
  sixes: 17,
  choice: 22,
  fourKind: 13,
  fullHouse: 15,
  smallStraight: 11,
  largeStraight: 12,
  yacht: 10,
}

function upperBonusAdjust(cat: Category, value: number, scores: Scores): number {
  const idx = UPPER.indexOf(cat)
  if (idx < 0 || bonusFor(scores) > 0) return 0
  // Reward hitting at least three of a face in the upper section (keeps bonus on track).
  const par = (idx + 1) * 3
  return (value - par) * 0.6
}

export function categoryValue(cat: Category, dice: number[], scores: Scores): number {
  const s = scoreFor(cat, dice)
  return s - BASELINE[cat] + upperBonusAdjust(cat, s, scores)
}

export function bestCategory(dice: number[], scores: Scores): Category {
  let best: Category = CATEGORIES.find((k) => scores[k] === undefined)!
  let bestV = -Infinity
  for (const k of CATEGORIES) {
    if (scores[k] !== undefined) continue
    const v = categoryValue(k, dice, scores)
    if (v > bestV) {
      bestV = v
      best = k
    }
  }
  return best
}

function finalValue(dice: number[], scores: Scores): number {
  const k = bestCategory(dice, scores)
  return categoryValue(k, dice, scores)
}

/** Choose which dice to hold by Monte Carlo over all 32 hold masks. */
export function chooseHolds(
  dice: number[],
  scores: Scores,
  rollsLeft: number,
  samples = 120,
  rng: () => number = Math.random,
): boolean[] {
  let bestMask: boolean[] = [false, false, false, false, false]
  let bestV = -Infinity
  for (let m = 0; m < 32; m++) {
    const held = [0, 1, 2, 3, 4].map((i) => ((m >> i) & 1) === 1)
    let v: number
    if (m === 31) {
      v = finalValue(dice, scores)
    } else {
      let acc = 0
      for (let s = 0; s < samples; s++) {
        let d = roll(dice, held, rng)
        if (rollsLeft > 1) {
          // Greedy second step: keep the most common face (cheap approximation).
          const c = counts(d)
          const face = c.indexOf(Math.max(...c))
          d = roll(d, d.map((x) => x === face), rng)
          const alt = finalValue(roll(dice, held, rng), scores)
          acc += Math.max(finalValue(d, scores), alt)
        } else {
          acc += finalValue(d, scores)
        }
      }
      v = acc / samples
    }
    if (v > bestV + 1e-9) {
      bestV = v
      bestMask = held
    }
  }
  return bestMask
}
