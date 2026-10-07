/**
 * 화투 게임 공용 화면 조각: 먹은 패 줄, 족보 진행 칩, 달별로 묶은 바닥.
 */
import type { CSSProperties, ReactNode } from 'react'
import { HwatuCard } from './HwatuCard'
import { KIND_NAMES, KIND_ORDER, monthOf, type CardKind } from './deck'
import { MONTH_COLORS } from './easy'

const W_RATIO = 92 / 60

/** 먹은 패를 종류별 줄로 (광 / 열끗 / 띠 / 피). 카드는 겹쳐서 작게. */
export function CaptureRows({
  groups,
  counts,
  width = 28,
  hideEmpty = false,
  extra,
}: {
  groups: Record<CardKind, number[]>
  /** 줄 옆 숫자 (기본: 장수). 피는 쌍피를 2로 센 값을 넘기면 좋아요. */
  counts?: Partial<Record<CardKind, number>>
  width?: number
  hideEmpty?: boolean
  /** 줄 오른쪽 끝에 붙일 내용 (종류별) */
  extra?: Partial<Record<CardKind, ReactNode>>
}) {
  const h = Math.round(width * W_RATIO)
  return (
    <div className="hw-caps" style={{ '--hw-cap-h': `${h}px`, '--hw-cap-w': `${width}px` } as CSSProperties}>
      {KIND_ORDER.map((k) => {
        const ids = groups[k]
        if (hideEmpty && !ids.length) return null
        const n = counts?.[k] ?? ids.length
        return (
          <div key={k} className={`hw-cap-row hw-k-${k}`}>
            <span className="hw-cap-label">
              {KIND_NAMES[k]}
              <b>{n}</b>
            </span>
            <span className="hw-cap-cards">
              {ids.length ? ids.map((id) => <HwatuCard key={id} card={id} width={width} showMonth={false} />) : <span className="hw-cap-empty">–</span>}
            </span>
            {extra?.[k]}
          </div>
        )
      })}
    </div>
  )
}

export interface Progress {
  key: string
  label: string
  have: number
  need: number
  /** 칩 색 (종류) */
  kind?: CardKind | 'hong' | 'cheong' | 'cho' | 'godori'
}

/** 족보 진행 칩: "홍단 2/3". 다 모으면 금색 + ✓ */
export function ProgressChips({ items, hideZero = false, className = '' }: { items: Progress[]; hideZero?: boolean; className?: string }) {
  const shown = hideZero ? items.filter((p) => p.have > 0) : items
  if (!shown.length) return null
  return (
    <div className={`hw-progress ${className}`}>
      {shown.map((p) => {
        const done = p.have >= p.need
        const near = !done && p.need - p.have === 1
        return (
          <span key={p.key} className={`hw-prog hw-prog-${p.kind ?? 'none'} ${done ? 'done' : ''} ${near ? 'near' : ''} ${p.have === 0 ? 'zero' : ''}`}>
            {done && <span aria-hidden>✓ </span>}
            {p.label}{' '}
            <b>
              {p.have}/{p.need}
            </b>
          </span>
        )
      })}
    </div>
  )
}

/** 바닥 카드를 달별로 묶어 보여줌. 같은 달 2~3장이면 겹쳐 쌓고 "N장" 표시. */
export function FloorGroups({
  floor,
  width = 44,
  highlight = [],
  clickable = [],
  fresh,
  onPick,
  ppeok,
  empty = '바닥이 비었어요',
}: {
  floor: readonly number[]
  width?: number
  highlight?: readonly number[]
  clickable?: readonly number[]
  fresh?: ReadonlySet<number>
  onPick?: (id: number) => void
  /** 뻑으로 쌓인 달 */
  ppeok?: Record<number, unknown>
  empty?: string
}) {
  const groups = new Map<number, number[]>()
  for (const id of floor.slice().sort((a, b) => a - b)) {
    const m = monthOf(id)
    groups.set(m, [...(groups.get(m) ?? []), id])
  }
  if (fresh) for (const [m, ids] of groups) groups.set(m, [...ids.filter((i) => !fresh.has(i)), ...ids.filter((i) => fresh.has(i))])
  if (!floor.length) return <div className="hw-floor hw-floor-empty">{empty}</div>
  return (
    <div className="hw-floor">
      {[...groups.entries()].map(([m, ids]) => {
        const spread = ids.length > 1 && ids.some((i) => clickable.includes(i))
        const hot = ids.some((i) => highlight.includes(i))
        const isPpeok = ppeok?.[m] != null
        return (
          <div
            key={m}
            className={`hw-fgroup ${spread ? 'spread' : ''} ${hot ? 'hot' : ''} ${ids.length > 1 ? 'multi' : ''}`}
            style={{ '--mc': MONTH_COLORS[m][0], '--hw-overlap': `${-Math.round(width * 0.4)}px` } as CSSProperties}
          >
            {(ids.length > 1 || isPpeok) && <span className={`hw-fcount ${isPpeok ? 'ppeok' : ''}`}>{isPpeok ? `뻑 ${ids.length}장` : `${ids.length}장`}</span>}
            {ids.map((id) => (
              <HwatuCard
                key={id}
                card={id}
                width={width}
                highlight={highlight.includes(id)}
                className={fresh?.has(id) ? 'hw-deal' : ''}
                onClick={onPick && clickable.includes(id) ? () => onPick(id) : undefined}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
