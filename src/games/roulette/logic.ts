export const MIN_ITEMS = 2
export const MAX_ITEMS = 12

export const PRESETS: { name: string; emoji: string; items: string[] }[] = [
  { name: '점심 메뉴', emoji: '🍱', items: ['김치찌개', '돈까스', '짜장면', '비빔밥', '햄버거', '초밥', '쌀국수', '떡볶이'] },
  { name: '벌칙', emoji: '😈', items: ['노래 한 소절', '애교 3종', '꿀밤 맞기', '성대모사', '엉덩이로 이름 쓰기', '통과!'] },
  { name: '예 / 아니오', emoji: '🤔', items: ['예', '아니오'] },
  { name: '숫자 1~6', emoji: '🎲', items: ['1', '2', '3', '4', '5', '6'] },
  { name: '커피 내기', emoji: '☕', items: ['내가 쏜다', '반반', '면제', '면제', '두 잔 쏘기', '면제'] },
  { name: '청소 당번', emoji: '🧹', items: ['설거지', '빨래', '분리수거', '청소기', '화장실', '휴식'] },
]

export const COLORS = [
  '#e74c3c',
  '#f39c12',
  '#f1c40f',
  '#2ecc71',
  '#1abc9c',
  '#3498db',
  '#9b59b6',
  '#e84393',
  '#e67e22',
  '#27ae60',
  '#2980b9',
  '#8e44ad',
]

/** Colors for n segments, avoiding identical neighbours (including last ↔ first). */
export function segmentColors(n: number): string[] {
  const c = Array.from({ length: n }, (_, i) => COLORS[i % COLORS.length])
  if (n > 1 && c[n - 1] === c[0]) c[n - 1] = COLORS[(n + 2) % COLORS.length]
  return c
}

const mod = (a: number, m: number) => ((a % m) + m) % m

/**
 * Segment i covers wheel angles [i·a, (i+1)·a) measured clockwise from 12 o'clock.
 * The wheel is rotated clockwise by `rotation` degrees and the pointer is fixed at the top.
 */
export function indexAtRotation(rotation: number, n: number): number {
  const a = 360 / n
  return Math.floor(mod(-rotation, 360) / a) % n
}

/** Final rotation (always ≥ current + minTurns full turns) that lands on `target`. */
export function spinTo(current: number, target: number, n: number, rng: () => number = Math.random, minTurns = 5): number {
  const a = 360 / n
  const theta = target * a + a * (0.15 + 0.7 * rng())
  const delta = mod(-theta - current, 360)
  return current + minTurns * 360 + delta
}

export function pickIndex(n: number, rng: () => number = Math.random): number {
  return Math.floor(rng() * n)
}

/** Normalise a user-edited list: trimmed, empty entries replaced with a numbered label. */
export function cleanItems(items: string[]): string[] {
  return items.map((s, i) => s.trim() || `항목 ${i + 1}`)
}

/** Short label for the wheel face. */
export function shortLabel(s: string, n: number): string {
  const max = n <= 4 ? 8 : n <= 8 ? 6 : 4
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}
