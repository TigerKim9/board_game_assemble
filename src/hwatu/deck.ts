/**
 * 화투 48장 덱 데이터 (공용 모듈).
 *
 * ## 카드 ID
 * - `id`는 0~47 정수. `id = (month - 1) * 4 + slot`.
 * - 같은 달 안에서 slot 0이 가장 높은 패(광 또는 열끗), slot 1은 띠(또는 8월 기러기 / 11월 쌍피 / 12월 열끗),
 *   slot 2·3은 보통 피(12월은 slot 2 = 비띠, slot 3 = 쌍피).
 * - `monthOf(id)`는 `Math.floor(id / 4) + 1`.
 *
 * ## 종류(kind)
 * - 'gwang' 광 5장: 1·3·8·11·12월. 12월 광은 `isBiGwang`(비광).
 * - 'yeol' 열끗(동물·물건) 9장: 2·4·5·6·7·8·9·10·12월. 2·4·8월은 `isGodori`(고도리 새).
 *   9월 열끗(국진)은 `isGukjin` — 맞고 등에서 쌍피로 쓸 수 있음(`piCount`의 옵션 참고).
 * - 'tti' 띠 10장: `ribbon`이 'hong'(홍단 1·2·3월), 'cheong'(청단 6·9·10월), 'cho'(초단 4·5·7월), 'plain'(12월 비띠).
 * - 'pi' 피 24장: `piValue`가 1 또는 2(쌍피 = 11월 오동 쌍피, 12월 비 쌍피).
 *
 * ## 예시
 * ```ts
 * import { newDeck, getCard, isDoublePi, piCount } from '../../hwatu'
 * const deck = newDeck()          // 섞인 HwatuCard[] 48장
 * getCard(0)                      // 1월 송학 광
 * isDoublePi(getCard(43))         // true (11월 쌍피)
 * piCount([getCard(32)], { gukjinAsPi: true }) // 2 (국진을 쌍피로)
 * ```
 */
import { shuffle } from '../lib/random'

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
export type CardKind = 'gwang' | 'yeol' | 'tti' | 'pi'
export type RibbonType = 'hong' | 'cheong' | 'cho' | 'plain'
export type Slot = 0 | 1 | 2 | 3

export interface HwatuCard {
  /** 0~47, (month-1)*4 + slot */
  id: number
  month: Month
  slot: Slot
  kind: CardKind
  /** 피 장수: 일반 피 1, 쌍피 2, 피가 아니면 0 */
  piValue: 0 | 1 | 2
  /** 띠 카드일 때만 */
  ribbon?: RibbonType
  /** 12월 비광 */
  isBiGwang: boolean
  /** 고도리 새(2·4·8월 열끗) */
  isGodori: boolean
  /** 9월 국진(술잔) 열끗 — 쌍피로 쓸 수도 있음 */
  isGukjin: boolean
  /** 짧은 이름, 예: '송학 광', '매조 홍단', '오동 쌍피' */
  name: string
  /** 전체 이름, 예: '1월 송학 광' */
  label: string
}

/** 달 이름 (index = month) */
export const MONTH_NAMES: readonly string[] = [
  '',
  '송학',
  '매조',
  '벚꽃',
  '흑싸리',
  '난초',
  '모란',
  '홍싸리',
  '공산',
  '국화',
  '단풍',
  '오동',
  '비',
]

export const KIND_NAMES: Record<CardKind, string> = { gwang: '광', yeol: '열끗', tti: '띠', pi: '피' }
export const RIBBON_NAMES: Record<RibbonType, string> = { hong: '홍단', cheong: '청단', cho: '초단', plain: '띠' }

/** 열끗 카드의 그림 이름 */
const YEOL_NAMES: Partial<Record<Month, string>> = {
  2: '꾀꼬리',
  4: '두견새',
  5: '다리',
  6: '나비',
  7: '멧돼지',
  8: '기러기',
  9: '국진',
  10: '사슴',
  12: '제비',
}

interface SlotSpec {
  kind: CardKind
  ribbon?: RibbonType
  piValue?: 1 | 2
}

const G: SlotSpec = { kind: 'gwang' }
const Y: SlotSpec = { kind: 'yeol' }
const P: SlotSpec = { kind: 'pi', piValue: 1 }
const PP: SlotSpec = { kind: 'pi', piValue: 2 }
const T = (ribbon: RibbonType): SlotSpec => ({ kind: 'tti', ribbon })

const LAYOUT: Record<Month, [SlotSpec, SlotSpec, SlotSpec, SlotSpec]> = {
  1: [G, T('hong'), P, P],
  2: [Y, T('hong'), P, P],
  3: [G, T('hong'), P, P],
  4: [Y, T('cho'), P, P],
  5: [Y, T('cho'), P, P],
  6: [Y, T('cheong'), P, P],
  7: [Y, T('cho'), P, P],
  8: [G, Y, P, P],
  9: [Y, T('cheong'), P, P],
  10: [Y, T('cheong'), P, P],
  11: [G, PP, P, P],
  12: [G, Y, T('plain'), PP],
}

function shortName(month: Month, s: SlotSpec): string {
  const m = MONTH_NAMES[month]
  switch (s.kind) {
    case 'gwang':
      return month === 12 ? '비광' : `${m} 광`
    case 'yeol':
      return `${m} ${YEOL_NAMES[month]}`
    case 'tti':
      return `${m} ${RIBBON_NAMES[s.ribbon!]}`
    case 'pi':
      return s.piValue === 2 ? `${m} 쌍피` : `${m} 피`
  }
}

/** 48장 전체 (id 순서, 섞이지 않음). 불변 데이터로 취급하세요. */
export const CARDS: readonly HwatuCard[] = (() => {
  const out: HwatuCard[] = []
  for (let m = 1; m <= 12; m++) {
    const month = m as Month
    LAYOUT[month].forEach((s, slot) => {
      const name = shortName(month, s)
      out.push({
        id: (m - 1) * 4 + slot,
        month,
        slot: slot as Slot,
        kind: s.kind,
        piValue: s.kind === 'pi' ? (s.piValue ?? 1) : 0,
        ribbon: s.ribbon,
        isBiGwang: s.kind === 'gwang' && m === 12,
        isGodori: s.kind === 'yeol' && (m === 2 || m === 4 || m === 8),
        isGukjin: s.kind === 'yeol' && m === 9,
        name,
        label: `${m}월 ${name}`,
      })
    })
  }
  return Object.freeze(out)
})()

export function getCard(id: number): HwatuCard {
  const c = CARDS[id]
  if (!c) throw new Error(`잘못된 화투 카드 id: ${id}`)
  return c
}

export function monthOf(id: number): Month {
  return (Math.floor(id / 4) + 1) as Month
}

export function sameMonth(a: number | HwatuCard, b: number | HwatuCard): boolean {
  const ma = typeof a === 'number' ? monthOf(a) : a.month
  const mb = typeof b === 'number' ? monthOf(b) : b.month
  return ma === mb
}

export function cardsOfMonth(month: Month): HwatuCard[] {
  return CARDS.filter((c) => c.month === month)
}

/** 섞인 48장 덱 (카드 객체). rng를 넘기면 결정적으로 섞임. */
export function newDeck(rng: () => number = Math.random): HwatuCard[] {
  return shuffle(CARDS, rng)
}

/** 섞인 48장 id 배열 */
export function newDeckIds(rng: () => number = Math.random): number[] {
  return shuffle(
    CARDS.map((c) => c.id),
    rng,
  )
}

export function isDoublePi(card: HwatuCard | number): boolean {
  const c = typeof card === 'number' ? getCard(card) : card
  return c.kind === 'pi' && c.piValue === 2
}

/**
 * 피 장수 합계. 쌍피는 2장으로 계산.
 * `gukjinAsPi`가 true면 9월 국진(열끗)을 쌍피(2)로 셈.
 */
export function piCount(cards: readonly (HwatuCard | number)[], opts: { gukjinAsPi?: boolean } = {}): number {
  let n = 0
  for (const x of cards) {
    const c = typeof x === 'number' ? getCard(x) : x
    if (c.kind === 'pi') n += c.piValue
    else if (opts.gukjinAsPi && c.isGukjin) n += 2
  }
  return n
}

export const GWANG_IDS: readonly number[] = CARDS.filter((c) => c.kind === 'gwang').map((c) => c.id)
export const GODORI_IDS: readonly number[] = CARDS.filter((c) => c.isGodori).map((c) => c.id)
export const HONGDAN_IDS: readonly number[] = CARDS.filter((c) => c.ribbon === 'hong').map((c) => c.id)
export const CHEONGDAN_IDS: readonly number[] = CARDS.filter((c) => c.ribbon === 'cheong').map((c) => c.id)
export const CHODAN_IDS: readonly number[] = CARDS.filter((c) => c.ribbon === 'cho').map((c) => c.id)

/** 같은 kind끼리 묶을 때 쓰기 좋은 정렬: 달 → slot */
export function sortCards<T extends HwatuCard | number>(cards: readonly T[]): T[] {
  const idOf = (x: T) => (typeof x === 'number' ? x : (x as HwatuCard).id)
  return cards.slice().sort((a, b) => idOf(a) - idOf(b))
}

/** 종류별 정렬 순서 (광 → 열끗 → 띠 → 피) */
export const KIND_ORDER: readonly CardKind[] = ['gwang', 'yeol', 'tti', 'pi']

/** 카드 묶음을 종류별로 나눔 */
export function groupByKind<T extends HwatuCard>(cards: readonly T[]): Record<CardKind, T[]> {
  const g: Record<CardKind, T[]> = { gwang: [], yeol: [], tti: [], pi: [] }
  for (const c of cards) g[c.kind].push(c)
  return g
}
