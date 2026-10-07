/**
 * <PlayingCard> — original SVG playing card (face and back), readable down to ~30px wide.
 *
 * Layout (viewBox 100×140): a big rank top-left and a big suit top-right, so a card is
 * identifiable even when only its top strip is visible in an overlapping pile. The body shows
 * pips (2–10), a large suit (A, or any card when narrow) or a simple original portrait (J/Q/K).
 *
 *   <PlayingCard card={c} width={56} selected onClick={...} />
 *   <PlayingCard faceDown width={56} />            // back
 *   <CardSlot width={56} label="A" />              // empty pile placeholder
 *
 * Any extra div props (pointer handlers, data-*, style) are passed to the root element.
 * Styling lives in cards.css (class prefix `pc-`).
 */
import { memo, useId, type HTMLAttributes, type ReactNode } from 'react'
import { cardNameKo, isRedSuit, rankLabel, type Card, type Rank, type Suit } from './deck'
import './cards.css'

export type CardBack = 'blue' | 'red' | 'green'

export interface PlayingCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The card to show. Omit (or set faceDown) to render the back. */
  card?: Card | null
  faceDown?: boolean
  /** Width in px (height = width × 1.4). Default 64. */
  width?: number
  selected?: boolean
  disabled?: boolean
  /** Soft pulsing glow — for hints / legal targets. */
  highlight?: boolean
  back?: CardBack
  /** 'full' = pips & portraits, 'simple' = big centre suit. 'auto' picks simple below 52px. */
  variant?: 'auto' | 'full' | 'simple'
}

export function PlayingCard({
  card,
  faceDown,
  width = 64,
  selected,
  disabled,
  highlight,
  back = 'blue',
  variant = 'auto',
  className,
  style,
  onClick,
  ...rest
}: PlayingCardProps) {
  const showBack = faceDown || !card
  const simple = variant === 'simple' || (variant === 'auto' && width < 52)
  const cls = [
    'pc',
    showBack ? 'pc-down' : card && isRedSuit(card.suit) ? 'pc-red' : 'pc-black',
    selected ? 'pc-selected' : '',
    disabled ? 'pc-disabled' : '',
    highlight ? 'pc-highlight' : '',
    onClick && !disabled ? 'pc-clickable' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div
      className={cls}
      style={{ width, ...style }}
      role={onClick ? 'button' : 'img'}
      tabIndex={onClick && !disabled ? 0 : undefined}
      aria-label={showBack ? '뒤집힌 카드' : cardNameKo(card!)}
      aria-pressed={onClick ? !!selected : undefined}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      onKeyDown={
        onClick && !disabled
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                ;(e.currentTarget as HTMLDivElement).click()
              }
            }
          : undefined
      }
      {...rest}
    >
      {showBack ? <CardBackSvg back={back} /> : <CardFaceSvg suit={card!.suit} rank={card!.rank} simple={simple} />}
    </div>
  )
}

/** Empty pile placeholder (dashed outline) with an optional label or suit hint. */
export function CardSlot({
  width = 64,
  label,
  suit,
  className,
  style,
  ...rest
}: {
  width?: number
  label?: ReactNode
  suit?: Suit
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`pc-slot ${className ?? ''}`} style={{ width, fontSize: width * 0.36, ...style }} {...rest}>
      {suit ? (
        <svg viewBox="0 0 100 100" width="56%" aria-hidden>
          <SuitShape suit={suit} x={0} y={0} size={100} />
        </svg>
      ) : (
        label
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Suit shapes (drawn as paths so they never turn into emoji on iOS).  */
/* ------------------------------------------------------------------ */

const HEART =
  'M50 92 C34 78 4 58 4 32 C4 14 18 4 31 4 C41 4 47 10 50 18 C53 10 59 4 69 4 C82 4 96 14 96 32 C96 58 66 78 50 92 Z'
const DIAMOND = 'M50 2 L88 50 L50 98 L12 50 Z'
const SPADE =
  'M50 2 C62 20 96 38 94 62 C93 76 82 84 70 82 C62 81 57 76 54 71 C55 82 59 90 68 97 L32 97 C41 90 45 82 46 71 C43 76 38 81 30 82 C18 84 7 76 6 62 C4 38 38 20 50 2 Z'

/** Suit symbol drawn inside a size×size box whose top-left is (x, y). */
export function SuitShape({
  suit,
  x,
  y,
  size,
  flip,
}: {
  suit: Suit
  x: number
  y: number
  size: number
  flip?: boolean
}) {
  const s = size / 100
  const t = flip ? `translate(${x + size} ${y + size}) scale(${-s})` : `translate(${x} ${y}) scale(${s})`
  return (
    <g transform={t} className="pc-ink">
      {suit === 'H' && <path d={HEART} />}
      {suit === 'D' && <path d={DIAMOND} />}
      {suit === 'S' && <path d={SPADE} />}
      {suit === 'C' && (
        <>
          <circle cx="50" cy="27" r="23" />
          <circle cx="26" cy="60" r="23" />
          <circle cx="74" cy="60" r="23" />
          <circle cx="50" cy="56" r="12" />
          <path d="M44 50 L56 50 C56 72 60 88 70 97 L30 97 C40 88 44 72 44 50 Z" />
        </>
      )}
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* Face                                                                */
/* ------------------------------------------------------------------ */

const L = 29
const M = 50
const R = 71
// [x, rowFraction] for 2..10 — rows map to y between PIP_TOP and PIP_BOTTOM.
const PIP_LAYOUT: Record<number, [number, number][]> = {
  2: [
    [M, 0],
    [M, 1],
  ],
  3: [
    [M, 0],
    [M, 0.5],
    [M, 1],
  ],
  4: [
    [L, 0],
    [R, 0],
    [L, 1],
    [R, 1],
  ],
  5: [
    [L, 0],
    [R, 0],
    [M, 0.5],
    [L, 1],
    [R, 1],
  ],
  6: [
    [L, 0],
    [R, 0],
    [L, 0.5],
    [R, 0.5],
    [L, 1],
    [R, 1],
  ],
  7: [
    [L, 0],
    [R, 0],
    [M, 0.25],
    [L, 0.5],
    [R, 0.5],
    [L, 1],
    [R, 1],
  ],
  8: [
    [L, 0],
    [R, 0],
    [M, 0.25],
    [L, 0.5],
    [R, 0.5],
    [M, 0.75],
    [L, 1],
    [R, 1],
  ],
  9: [
    [L, 0],
    [R, 0],
    [L, 1 / 3],
    [R, 1 / 3],
    [M, 0.5],
    [L, 2 / 3],
    [R, 2 / 3],
    [L, 1],
    [R, 1],
  ],
  10: [
    [L, 0],
    [R, 0],
    [M, 1 / 6],
    [L, 1 / 3],
    [R, 1 / 3],
    [L, 2 / 3],
    [R, 2 / 3],
    [M, 5 / 6],
    [L, 1],
    [R, 1],
  ],
}
const PIP_TOP = 52
const PIP_BOTTOM = 124
const PIP = 19

const CardFaceSvg = memo(function CardFaceSvg({ suit, rank, simple }: { suit: Suit; rank: Rank; simple: boolean }) {
  const label = rankLabel(rank)
  let body: ReactNode
  if (rank === 0) body = <JokerArt />
  else if (rank >= 11 && !simple) body = <Portrait suit={suit} rank={rank} />
  else if (rank === 1 || simple || rank >= 11) {
    const big = rank === 1 && !simple ? 54 : rank >= 11 ? 50 : 58
    body = (
      <>
        <SuitShape suit={suit} x={50 - big / 2} y={rank >= 11 ? 70 : 88 - big / 2} size={big} />
        {rank >= 11 && (
          <text x="50" y="64" textAnchor="middle" className="pc-ink pc-face-letter">
            {label}
          </text>
        )}
      </>
    )
  } else {
    body = PIP_LAYOUT[rank].map(([x, f], i) => {
      const y = PIP_TOP + f * (PIP_BOTTOM - PIP_TOP)
      return <SuitShape key={i} suit={suit} x={x - PIP / 2} y={y - PIP / 2} size={PIP} flip={f > 0.5} />
    })
  }
  return (
    <svg viewBox="0 0 100 140" className="pc-svg" aria-hidden>
      <rect x="1.5" y="1.5" width="97" height="137" rx="9" className="pc-bg" />
      {rank === 0 ? (
        <text x="8" y="30" className="pc-ink pc-rank" style={{ fontSize: 24 }}>
          JK
        </text>
      ) : (
        <text
          x={label === '10' ? 4 : 7}
          y="36"
          className="pc-ink pc-rank"
          textLength={label === '10' ? 46 : undefined}
          lengthAdjust="spacingAndGlyphs"
        >
          {label}
        </text>
      )}
      {rank !== 0 && <SuitShape suit={suit} x={62} y={6} size={31} />}
      {body}
    </svg>
  )
})

const SKIN = '#f6d3ad'

/** Simple original court-card portrait: K = crown & beard, Q = tiara & long hair, J = feathered cap. */
function Portrait({ suit, rank }: { suit: Suit; rank: Rank }) {
  const red = isRedSuit(suit)
  const robe = red ? '#c62828' : '#2b3f6b'
  const tint = rank === 13 ? '#f7e3a1' : rank === 12 ? '#f9d6dc' : '#d3e3f6'
  const hair = rank === 13 ? '#8a8f99' : rank === 12 ? '#c98a2c' : '#5b3a1e'
  return (
    <g>
      <rect x="11" y="42" width="78" height="91" rx="6" fill={tint} className="pc-frame" />
      {/* long hair behind (queen) */}
      {rank === 12 && <path d="M33 78 C30 100 34 112 40 118 L60 118 C66 112 70 100 67 78 Z" fill={hair} />}
      {/* robe */}
      <path d="M18 133 C20 112 32 102 50 100 C68 102 80 112 82 133 Z" fill={robe} />
      <path d="M40 101 L50 118 L60 101 Z" fill="#fff" opacity="0.9" />
      <path d="M30 110 L36 133 M70 110 L64 133" stroke="#f0c040" strokeWidth="3" />
      {/* head */}
      <circle cx="50" cy="82" r="14" fill={SKIN} stroke="#5a4636" strokeWidth="1.5" />
      <circle cx="45" cy="81" r="1.8" fill="#2a2a2a" />
      <circle cx="55" cy="81" r="1.8" fill="#2a2a2a" />
      {rank !== 13 && <path d="M45 88 Q50 92 55 88" stroke="#a0453a" strokeWidth="1.8" fill="none" />}
      {rank === 12 && <circle cx="42" cy="86" r="2.4" fill="#f2a0a8" opacity="0.8" />}
      {rank === 12 && <circle cx="58" cy="86" r="2.4" fill="#f2a0a8" opacity="0.8" />}
      {/* beard (king) */}
      {rank === 13 && <path d="M37 84 C38 100 46 104 50 104 C54 104 62 100 63 84 C58 90 42 90 37 84 Z" fill={hair} />}
      {rank === 13 && <path d="M44 88 Q50 85 56 88" stroke="#5c5f66" strokeWidth="2" fill="none" />}
      {/* headgear */}
      {rank === 13 && (
        <>
          <path
            d="M34 72 L34 54 L42 62 L50 48 L58 62 L66 54 L66 72 Z"
            fill="#f0c040"
            stroke="#9a7413"
            strokeWidth="1.5"
          />
          <circle cx="50" cy="64" r="3" fill={robe} />
        </>
      )}
      {rank === 12 && (
        <>
          <path d="M36 72 C36 60 64 60 64 72 C58 67 42 67 36 72 Z" fill={hair} />
          <path
            d="M39 66 L42 56 L46 63 L50 53 L54 63 L58 56 L61 66 Z"
            fill="#f0c040"
            stroke="#9a7413"
            strokeWidth="1.2"
          />
          <circle cx="50" cy="59" r="2.2" fill={robe} />
        </>
      )}
      {rank === 11 && (
        <>
          <path d="M35 75 C33 60 67 60 65 75 Z" fill={robe} stroke="#1c1c1c" strokeWidth="1" />
          <path d="M34 74 L66 74" stroke="#f0c040" strokeWidth="3" />
          <path d="M62 66 C72 56 80 50 86 46 C80 56 74 64 64 70 Z" fill="#f0c040" stroke="#9a7413" strokeWidth="1" />
        </>
      )}
      <SuitShape suit={suit} x={43} y={119} size={13} />
    </g>
  )
}

function JokerArt() {
  return (
    <g>
      <path d="M50 46 L60 74 L90 76 L66 94 L76 124 L50 106 L24 124 L34 94 L10 76 L40 74 Z" className="pc-ink" />
      <circle cx="50" cy="88" r="9" fill="#fff" />
      <text
        x="50"
        y="136"
        textAnchor="middle"
        className="pc-ink"
        style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2 }}
      >
        JOKER
      </text>
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* Back                                                                */
/* ------------------------------------------------------------------ */

const CardBackSvg = memo(function CardBackSvg({ back }: { back: CardBack }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 100 140" className={`pc-svg pc-back-${back}`} aria-hidden>
      <defs>
        <pattern id={`pcb${id}`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="12" height="12" className="pc-back-a" />
          <rect width="6" height="6" className="pc-back-b" />
          <rect x="6" y="6" width="6" height="6" className="pc-back-b" />
        </pattern>
      </defs>
      <rect x="1.5" y="1.5" width="97" height="137" rx="9" className="pc-back-edge" />
      <rect x="8" y="8" width="84" height="124" rx="5" fill={`url(#pcb${id})`} />
      <rect x="8" y="8" width="84" height="124" rx="5" className="pc-back-line" />
      <circle cx="50" cy="70" r="15" className="pc-back-a pc-back-line" />
      <path d="M50 59 L58 70 L50 81 L42 70 Z" className="pc-back-emblem" />
    </svg>
  )
})
