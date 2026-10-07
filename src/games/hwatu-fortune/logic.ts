import { monthOf, newDeckIds } from '../../hwatu'

export const COLS = 4
export const ROWS = 4
export const SLOTS = COLS * ROWS

export interface FortuneState {
  /** 자리별 카드 (빈 자리는 null) */
  board: (number | null)[]
  deck: number[]
  /** 떼어 낸 카드 (뗀 순서) */
  removed: number[]
}

export function newFortune(rng: () => number = Math.random): FortuneState {
  const deck = newDeckIds(rng)
  return { board: deck.splice(0, SLOTS), deck, removed: [] }
}

/** 가로·세로·대각선으로 붙어 있는지 */
export function adjacent(a: number, b: number): boolean {
  if (a === b) return false
  const ra = Math.floor(a / COLS)
  const ca = a % COLS
  const rb = Math.floor(b / COLS)
  const cb = b % COLS
  return Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1
}

export function canRemove(s: FortuneState, a: number, b: number): boolean {
  const x = s.board[a]
  const y = s.board[b]
  return x != null && y != null && adjacent(a, b) && monthOf(x) === monthOf(y)
}

/** 짝을 떼고, 남은 카드를 앞으로 당겨 빈칸을 메운 뒤, 더미에서 채움 */
export function removePair(s: FortuneState, a: number, b: number): FortuneState {
  if (!canRemove(s, a, b)) return s
  const removed = [...s.removed, s.board[a]!, s.board[b]!]
  const rest = s.board.filter((c, i) => c != null && i !== a && i !== b) as number[]
  const deck = s.deck.slice()
  while (rest.length < SLOTS && deck.length) rest.push(deck.shift()!)
  const board: (number | null)[] = [...rest, ...Array(SLOTS - rest.length).fill(null)]
  return { board, deck, removed }
}

export function allPairs(s: FortuneState): [number, number][] {
  const out: [number, number][] = []
  for (let a = 0; a < SLOTS; a++)
    for (let b = a + 1; b < SLOTS; b++) if (canRemove(s, a, b)) out.push([a, b])
  return out
}

export const hasMoves = (s: FortuneState) => allPairs(s).length > 0
export const cleared = (s: FortuneState) => s.removed.length === 48

/** 네 장을 모두 떼어 낸 달 (뗀 순서대로) */
export function completedMonths(removed: number[]): number[] {
  const count = new Map<number, number>()
  const done: number[] = []
  for (const id of removed) {
    const m = monthOf(id)
    count.set(m, (count.get(m) ?? 0) + 1)
    if (count.get(m) === 4) done.push(m)
  }
  return done
}

/**
 * 힌트·자동 떼기용: 다음 수를 조금 내다보고 가장 많이 이어 뗄 수 있는 짝을 고름.
 * (같은 달 네 장이 이웃해 있으면 순서가 중요해서 간단한 탐색을 함)
 */
export function bestPair(s: FortuneState, depth = 2): [number, number] | null {
  const pairs = allPairs(s)
  if (!pairs.length) return null
  let best = pairs[0]
  let bestV = -1
  for (const p of pairs) {
    const v = lookahead(removePair(s, p[0], p[1]), depth - 1)
    if (v > bestV) {
      bestV = v
      best = p
    }
  }
  return best
}

function lookahead(s: FortuneState, depth: number): number {
  const pairs = allPairs(s)
  if (depth <= 0 || !pairs.length) return pairs.length
  let m = 0
  for (const p of pairs) m = Math.max(m, 1 + lookahead(removePair(s, p[0], p[1]), depth - 1))
  return m
}

// ---------- 풀이 ----------

export interface Meaning {
  month: number
  word: string
  emoji: string
  text: string
}

export const MEANINGS: Meaning[] = [
  { month: 1, word: '소식', emoji: '✉️', text: '기다리던 반가운 소식이 찾아와요. 연락을 미뤘던 사람에게 먼저 안부를 전해 보세요.' },
  { month: 2, word: '님', emoji: '💕', text: '마음에 둔 사람, 그리운 님과 가까워지는 날. 작은 표현이 큰 기쁨이 돼요.' },
  { month: 3, word: '외출·만남', emoji: '🌸', text: '나들이나 즐거운 만남이 있어요. 오늘은 밖으로 나가 보는 게 좋아요.' },
  { month: 4, word: '싸움·궂은일', emoji: '⚡', text: '사소한 말다툼을 조심하세요. 한 박자 쉬고 말하면 궂은일이 비껴가요.' },
  { month: 5, word: '국수(잔치)', emoji: '🍜', text: '잔치 국수 먹을 일이 생겨요! 경사나 맛있는 자리에 초대받을지도 몰라요.' },
  { month: 6, word: '기쁨', emoji: '😊', text: '웃을 일이 생기는 기쁜 날이에요. 좋은 기분을 주변에도 나눠 주세요.' },
  { month: 7, word: '행운', emoji: '🍀', text: '뜻밖의 행운이 굴러들어 와요. 망설이던 일에 한 번 도전해 보세요.' },
  { month: 8, word: '달밤·어두움', emoji: '🌕', text: '조금 어두운 기운이 있어요. 밤길과 늦은 약속은 조심하고 일찍 쉬세요.' },
  { month: 9, word: '술', emoji: '🍶', text: '술 한잔 기울일 자리가 생겨요. 즐겁게, 하지만 과음은 금물!' },
  { month: 10, word: '근심·풍파', emoji: '🍁', text: '작은 근심이 바람처럼 지나가요. 걱정은 적어 두고 하나씩 풀면 괜찮아요.' },
  { month: 11, word: '돈', emoji: '💰', text: '재물운이 들어와요. 들어온 돈은 차곡차곡 잘 모아 두세요.' },
  { month: 12, word: '손님', emoji: '🙋', text: '반가운 손님이 찾아와요. 집 안을 정리하고 따뜻하게 맞이해 보세요.' },
]

export function meaningOf(month: number): Meaning {
  return MEANINGS[month - 1]
}

/** 전체 운세 한 줄 요약 */
export function summary(doneMonths: number, allCleared: boolean): { title: string; text: string } {
  if (allCleared) return { title: '🎊 운수대통!', text: '48장을 모두 떼어 냈어요! 오늘은 무엇을 해도 술술 풀리는 날이에요.' }
  if (doneMonths >= 6) return { title: '🌟 대길', text: '좋은 기운이 가득해요. 미뤄 둔 일을 시작하기 딱 좋은 날!' }
  if (doneMonths >= 3) return { title: '😊 길', text: '소소한 좋은 일들이 기다리고 있어요.' }
  if (doneMonths >= 1) return { title: '🙂 소길', text: '무난한 하루 속에 작은 재미가 있어요.' }
  return { title: '🍵 평온', text: '떼어진 달이 없네요. 큰일 없이 차분하게 흘러가는 하루예요. 한 번 더 떼어 봐도 좋아요!' }
}
