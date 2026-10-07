export type FuseRange = 'short' | 'normal' | 'long'
export type Topic = 'none' | 'chain' | 'choseong' | 'category'

export const FUSE_RANGES: Record<FuseRange, { label: string; min: number; max: number }> = {
  short: { label: '짧게', min: 10, max: 20 },
  normal: { label: '보통', min: 20, max: 40 },
  long: { label: '길게', min: 40, max: 70 },
}

export const TOPICS: Record<Topic, string> = {
  none: '없음',
  chain: '끝말잇기',
  choseong: '초성 퀴즈',
  category: '주제 말하기',
}

export const CHAIN_WORDS = ['기차', '사과', '나무', '바다', '고양이', '자동차', '하늘', '우산', '토끼', '연필', '구름', '호랑이', '라면', '도서관', '피아노', '김밥']

export const CHOSEONG = ['ㄱㅂ', 'ㅅㄱ', 'ㄱㅊ', 'ㅂㄹ', 'ㅅㅈ', 'ㄷㄹ', 'ㅈㄷ', 'ㅎㄱ', 'ㅁㄹ', 'ㄱㄷ', 'ㅅㅁ', 'ㅇㅅ', 'ㅈㅅ', 'ㅂㅅ', 'ㄴㄹ', 'ㅊㄱ', 'ㄱㅅ', 'ㅎㅅ', 'ㄷㅅ', 'ㅍㄷ']

export const CATEGORIES = [
  '과일 이름',
  '동물 이름',
  '나라 이름',
  '우리나라 도시',
  '음식 이름',
  '직업',
  '운동 종목',
  '탈것',
  '색깔',
  '악기',
  '채소 이름',
  '학교에 있는 것',
  '부엌에 있는 것',
  '바다에 사는 것',
  '빨간색인 것',
  '세 글자 단어',
]

const pickFrom = <T,>(list: readonly T[], rng: () => number) => list[Math.floor(rng() * list.length)]

/** Hidden fuse length in ms, uniformly inside the selected range. */
export function randomFuse(range: FuseRange, rng: () => number = Math.random): number {
  const { min, max } = FUSE_RANGES[range]
  return Math.round((min + (max - min) * rng()) * 1000)
}

export function topicPrompt(topic: Topic, rng: () => number = Math.random): { title: string; value: string } | null {
  switch (topic) {
    case 'none':
      return null
    case 'chain':
      return { title: '끝말잇기 · 시작 단어', value: pickFrom(CHAIN_WORDS, rng) }
    case 'choseong':
      return { title: '초성 퀴즈 · 이 초성의 단어!', value: pickFrom(CHOSEONG, rng) }
    case 'category':
      return { title: '주제 말하기', value: pickFrom(CATEGORIES, rng) }
  }
}

/**
 * Seconds-based tension level 0..1. Based on elapsed time against the range's max
 * (not the secret fuse) so the visuals never give the real timer away.
 */
export function tension(elapsedMs: number, range: FuseRange): number {
  return Math.min(1, elapsedMs / (FUSE_RANGES[range].max * 1000))
}

/** Gap between ticks: slow at first, frantic later. */
export function tickGap(t: number): number {
  return Math.round(900 - 680 * Math.min(1, Math.max(0, t)))
}

export function nextHolder(holder: number, players: number): number {
  return (holder + 1) % players
}

export function firstHolder(players: number, rng: () => number = Math.random): number {
  return Math.floor(rng() * players)
}
