/**
 * 화투 카드 그림 스타일 설정 (모든 화투 게임 공용).
 * - 'easy'  쉬운 보기: 달 색 띠 + 큰 숫자 + 종류 표시 (기본)
 * - 'classic' 클래식: 전통 화투 느낌의 그림
 * localStorage 키 `hwatu:style` (useStored와 같은 저장소)에 저장되고,
 * 화면의 모든 HwatuCard가 prop 없이 바로 따라 바뀝니다.
 */
import { useSyncExternalStore } from 'react'
import { load, save } from '../lib/storage'

export type HwatuStyle = 'easy' | 'classic'
const KEY = 'hwatu:style'

let current: HwatuStyle | null = null
const listeners = new Set<() => void>()

function read(): HwatuStyle {
  if (current == null) {
    const v = load<HwatuStyle>(KEY, 'easy')
    current = v === 'classic' ? 'classic' : 'easy'
  }
  return current
}

export function setHwatuStyle(v: HwatuStyle) {
  current = v
  save(KEY, v)
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => {
    if (e.key && e.key.endsWith(KEY)) {
      current = null
      l()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', onStorage)
  }
}

export function useHwatuStyle(): [HwatuStyle, (v: HwatuStyle) => void] {
  const v = useSyncExternalStore(subscribe, read, () => 'easy' as HwatuStyle)
  return [v, setHwatuStyle]
}

/** 설정 화면용: "카드 모양 [쉬운 보기|클래식]" */
export function HwatuStyleToggle() {
  const [style, setStyle] = useHwatuStyle()
  return (
    <div className="setup-row hw-style-row">
      <span>카드 모양</span>
      <div className="segmented">
        <button className={style === 'easy' ? 'active' : ''} onClick={() => setStyle('easy')}>
          쉬운 보기
        </button>
        <button className={style === 'classic' ? 'active' : ''} onClick={() => setStyle('classic')}>
          클래식
        </button>
      </div>
    </div>
  )
}

/** 게임 중 작은 버튼: 누를 때마다 쉬운 보기 ↔ 클래식 */
export function HwatuStyleButton({ className = '' }: { className?: string }) {
  const [style, setStyle] = useHwatuStyle()
  const next = style === 'easy' ? 'classic' : 'easy'
  return (
    <button
      type="button"
      className={`hw-style-btn ${className}`}
      onClick={() => setStyle(next)}
      title={`카드 모양 바꾸기 (지금: ${style === 'easy' ? '쉬운 보기' : '클래식'})`}
      aria-label={`카드 모양을 ${next === 'easy' ? '쉬운 보기' : '클래식'}로 바꾸기`}
    >
      <span aria-hidden>🎴</span>
      <small>{style === 'easy' ? '쉬운' : '클래식'}</small>
    </button>
  )
}
