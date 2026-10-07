/**
 * 빠른 포커 패 점수 (몬테카를로 AI용). src/cards의 bestHand와 같은 순서를 숫자 하나로 표현.
 *
 * 카드 코드: rank(2..14, A=14) * 4 + suit(0..3). `code(card)`로 변환.
 * 점수: category(0..8) << 20 | 타이브레이크 5개(4비트씩). 로열 스트레이트 플러시는 8(스트레이트 플러시 A 하이).
 * `handScore(bestHand(cards))`와 `score(codes)`는 항상 같은 값을 낸다(테스트로 확인).
 */
import { rankValue, type Card, type HandResult, type Suit } from '../../cards'

const SUIT_INDEX: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 }

export const code = (c: Card) => rankValue(c.rank, true) * 4 + SUIT_INDEX[c.suit]
export const codes = (cs: readonly Card[]) => cs.map(code)
export const codeRank = (x: number) => x >> 2
export const codeSuit = (x: number) => x & 3

/** 52장 전체 코드 */
export const ALL_CODES: readonly number[] = Array.from({ length: 52 }, (_, i) => (2 + (i >> 2)) * 4 + (i & 3))

function pack(cat: number, ranks: number[]): number {
  let v = cat
  for (let k = 0; k < 5; k++) v = v * 16 + (ranks[k] ?? 0)
  return v
}

/** src/cards HandResult → 숫자 점수 */
export function handScore(h: HandResult): number {
  return pack(h.category === 9 ? 8 : h.category, h.category === 9 ? [14] : h.ranks)
}

/** 점수의 족보 분류(0..8) */
export const scoreCategory = (s: number) => Math.floor(s / 16 ** 5)

function straightTop(mask: number): number {
  for (let top = 14; top >= 5; top--) {
    const need = 0b11111 << (top - 4)
    if ((mask & need) === need) return top
  }
  // 백 스트레이트 A-2-3-4-5
  const wheel = (1 << 14) | 0b111100
  return (mask & wheel) === wheel ? 5 : 0
}

const cnt = new Int8Array(15)
const suitCnt = new Int8Array(4)
const suitMask = new Int32Array(4)

/** 5~7장(이상) 카드 코드의 최고 5장 점수 */
export function score(cs: readonly number[]): number {
  cnt.fill(0)
  suitCnt.fill(0)
  suitMask.fill(0)
  let mask = 0
  for (const x of cs) {
    const r = x >> 2
    const s = x & 3
    cnt[r]++
    suitCnt[s]++
    suitMask[s] |= 1 << r
    mask |= 1 << r
  }
  for (let s = 0; s < 4; s++) {
    if (suitCnt[s] >= 5) {
      const sf = straightTop(suitMask[s])
      if (sf) return pack(8, [sf])
      const top: number[] = []
      for (let r = 14; r >= 2 && top.length < 5; r--) if (suitMask[s] & (1 << r)) top.push(r)
      // 플러시지만 포카드·풀하우스가 더 강할 수 있음 → 아래에서 비교
      const fl = pack(5, top)
      const other = scoreNoFlush(mask)
      return Math.max(fl, other)
    }
  }
  return scoreNoFlush(mask)
}

function scoreNoFlush(mask: number): number {
  let quad = 0
  const trips: number[] = []
  const pairs: number[] = []
  const singles: number[] = []
  for (let r = 14; r >= 2; r--) {
    const c = cnt[r]
    if (c === 4) quad = r
    else if (c === 3) trips.push(r)
    else if (c === 2) pairs.push(r)
    else if (c === 1) singles.push(r)
  }
  if (quad) {
    let k = 0
    for (let r = 14; r >= 2; r--) if (r !== quad && cnt[r] > 0) {
      k = r
      break
    }
    return pack(7, [quad, k])
  }
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const t = trips[0]
    const p = Math.max(trips[1] ?? 0, pairs[0] ?? 0)
    return pack(6, [t, p])
  }
  const st = straightTop(mask)
  if (st) return pack(4, [st])
  if (trips.length) {
    const ks = [...singles, ...pairs].sort((a, b) => b - a)
    return pack(3, [trips[0], ks[0], ks[1]])
  }
  if (pairs.length >= 2) {
    const k = Math.max(pairs[2] ?? 0, singles[0] ?? 0)
    return pack(2, [pairs[0], pairs[1], k])
  }
  if (pairs.length === 1) return pack(1, [pairs[0], singles[0], singles[1], singles[2]])
  return pack(0, singles.slice(0, 5))
}

/**
 * 5장 미만 카드의 부분 점수(세븐 포커 오픈 카드 비교 등). 페어·투페어·트리플·포카드·하이만 본다.
 */
export function partialScore(cs: readonly number[]): number {
  const c = new Map<number, number>()
  for (const x of cs) c.set(x >> 2, (c.get(x >> 2) ?? 0) + 1)
  const groups = [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const ranks = groups.map((g) => g[0])
  let cat = 0
  if (groups[0]?.[1] === 4) cat = 7
  else if (groups[0]?.[1] === 3) cat = 3
  else if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) cat = 2
  else if (groups[0]?.[1] === 2) cat = 1
  return pack(cat, ranks)
}

/** 남은 카드에서 무작위로 k장 뽑기(부분 Fisher–Yates, 배열을 제자리에서 섞음) */
export function drawRandom(pool: number[], k: number, rng: () => number): number[] {
  const out: number[] = []
  const n = pool.length
  for (let i = 0; i < k && i < n; i++) {
    const j = i + Math.floor(rng() * (n - i))
    const t = pool[i]
    pool[i] = pool[j]
    pool[j] = t
    out.push(pool[i])
  }
  return out
}
