import { useId, type CSSProperties, type ReactNode } from 'react'
import { CardArt, H, W } from './art'
import { getCard, type HwatuCard as CardData } from './deck'
import { EasyFace, tierOf } from './easy'
import { useHwatuStyle } from './style'
import './hwatu.css'

export interface HwatuCardProps {
  /** 카드 id(0~47) 또는 카드 객체. faceDown이면 생략 가능. */
  card?: number | CardData
  /** 뒷면으로 표시 */
  faceDown?: boolean
  /** 너비(px). 높이는 자동(약 1.53배). 기본 48 */
  width?: number
  /** 모서리에 달 숫자 표시 (기본 true) */
  showMonth?: boolean
  selected?: boolean
  /** 선택 가능/짝 맞음 등 강조 테두리 */
  highlight?: boolean
  /** 흐리게 */
  dim?: boolean
  /** 바닥과 짝이 맞는 카드: 은은한 빛 테두리 */
  match?: boolean
  /** 카드 위 작은 표시 (예: '짝') */
  marker?: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  style?: CSSProperties
  title?: string
}

/** 화투 카드 한 장. onClick이 있으면 버튼으로 렌더링. CSS 클래스 접두사 `hw-`. */
export function HwatuCard({
  card,
  faceDown,
  width = 48,
  showMonth = true,
  selected,
  highlight,
  dim,
  match,
  marker,
  onClick,
  disabled,
  className = '',
  style,
  title,
}: HwatuCardProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [cardStyle] = useHwatuStyle()
  const easy = cardStyle === 'easy'
  const data = card == null ? null : typeof card === 'number' ? getCard(card) : card
  const down = faceDown || !data
  const height = Math.round((width * H) / W)
  const label = down ? '뒤집힌 화투 카드' : data!.label

  const svg = (
    <svg viewBox={`0 0 ${W} ${H}`} width={width} height={height} role="img" aria-label={label}>
      <defs>
        <clipPath id={`hwc${uid}`}>
          <rect x={2.6} y={2.6} width={W - 5.2} height={H - 5.2} rx={3.4} />
        </clipPath>
      </defs>
      {(down || !easy) && <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={5} className={down ? 'hw-back-frame' : 'hw-frame'} />}
      {down ? (
        <CardBack uid={uid} />
      ) : easy ? (
        <EasyFace card={data!} tier={tierOf(width)} uid={uid} />
      ) : (
        <>
          <g clipPath={`url(#hwc${uid})`}>
            <CardArt card={data!} />
          </g>
          {data!.kind === 'gwang' && (
            <g>
              <circle cx={12} cy={12} r={7.6} fill="#fff8e6" stroke="#c62828" strokeWidth={1.6} />
              <text x={12} y={15.6} fontSize={10} fontWeight={800} textAnchor="middle" fill="#c62828">
                光
              </text>
            </g>
          )}
          {data!.piValue === 2 && (
            <g>
              <rect x={W - 21} y={4.5} width={16} height={11} rx={3} fill="#e0a526" stroke="#7a5a10" strokeWidth={0.8} />
              <text x={W - 13} y={13} fontSize={8} fontWeight={800} textAnchor="middle" fill="#2a1e05">
                쌍
              </text>
            </g>
          )}
          {showMonth && (
            <g>
              <rect x={W - 17} y={H - 15.5} width={13} height={11} rx={3} fill="rgba(255,250,238,.9)" stroke="rgba(0,0,0,.35)" strokeWidth={0.6} />
              <text x={W - 10.5} y={H - 7} fontSize={data!.month >= 10 ? 7.4 : 8.4} fontWeight={800} textAnchor="middle" fill="#2a1e05">
                {data!.month}
              </text>
            </g>
          )}
        </>
      )}
    </svg>
  )

  const cls = [
    'hw-card',
    easy && !down && 'hw-easy',
    selected && 'hw-selected',
    highlight && 'hw-highlight',
    match && 'hw-match',
    dim && 'hw-dim',
    onClick && 'hw-clickable',
    marker != null && 'hw-has-marker',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const mk = marker != null ? <span className="hw-marker">{marker}</span> : null
  if (!onClick) {
    return (
      <span className={cls} style={style} title={title ?? label}>
        {svg}
        {mk}
      </span>
    )
  }
  return (
    <button type="button" className={cls} style={style} onClick={onClick} disabled={disabled} title={title ?? label} aria-pressed={selected}>
      {svg}
      {mk}
    </button>
  )
}

function CardBack({ uid }: { uid: string }) {
  return (
    <g>
      <defs>
        <pattern id={`hwp${uid}`} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={8} height={8} fill="#a8161f" />
          <rect width={4} height={4} fill="#951219" />
        </pattern>
      </defs>
      <rect x={2.6} y={2.6} width={W - 5.2} height={H - 5.2} rx={3.4} fill={`url(#hwp${uid})`} />
      <rect x={6} y={6} width={W - 12} height={H - 12} rx={2.5} fill="none" stroke="#e0a526" strokeWidth={1} opacity={0.75} />
      <circle cx={W / 2} cy={H / 2} r={13} fill="#7d0e15" stroke="#e0a526" strokeWidth={1.4} />
      <text x={W / 2} y={H / 2 + 5.5} fontSize={15} fontWeight={800} textAnchor="middle" fill="#f2bf3a">
        花
      </text>
    </g>
  )
}

/** 겹쳐 쌓인 덱 더미 (남은 장수 표시) */
export function HwatuPile({ count, width = 44 }: { count: number; width?: number }) {
  return (
    <span className="hw-pile" style={{ width: width + 6 }} aria-label={`남은 카드 ${count}장`}>
      {count > 2 && <HwatuCard faceDown width={width} className="hw-pile-under2" />}
      {count > 1 && <HwatuCard faceDown width={width} className="hw-pile-under" />}
      {count > 0 ? <HwatuCard faceDown width={width} className="hw-pile-top" /> : <span className="hw-pile-empty" style={{ width, height: Math.round((width * H) / W) }} />}
      <span className="hw-pile-count">{count}</span>
    </span>
  )
}
