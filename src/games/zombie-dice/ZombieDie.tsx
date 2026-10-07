import type { Color, Face } from './logic'

const FILL: Record<Color, string> = { green: '#3f9d4a', yellow: '#e6b521', red: '#c63a2e' }
const EDGE: Record<Color, string> = { green: '#276b31', yellow: '#a77f0e', red: '#87231a' }
const NAME: Record<Color, string> = { green: '초록', yellow: '노랑', red: '빨강' }
const FACE_NAME: Record<Face, string> = { brain: '뇌', shot: '총알', feet: '발자국' }

function Brain() {
  return (
    <g>
      <path
        d="M50 24c-6-6-18-5-21 3-8 0-13 8-10 15-6 5-4 15 4 17 1 8 10 12 17 8 3 5 7 6 10 6s7-1 10-6c7 4 16 0 17-8 8-2 10-12 4-17 3-7-2-15-10-15-3-8-15-9-21-3z"
        fill="#f6a5b8"
        stroke="#7a2b3d"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M50 25v48M37 34c4 3 4 8 0 11M30 52c5-2 9 1 10 5M63 34c-4 3-4 8 0 11M70 52c-5-2-9 1-10 5"
        fill="none"
        stroke="#7a2b3d"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </g>
  )
}

function Blast() {
  const pts: string[] = []
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 34 : 16
    const a = (Math.PI * 2 * i) / 16 - Math.PI / 2
    pts.push(`${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`)
  }
  return (
    <g>
      <polygon points={pts.join(' ')} fill="#ffcf3f" stroke="#3a1a0a" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="10" fill="#ff7a1a" stroke="#3a1a0a" strokeWidth="2.5" />
    </g>
  )
}

function Feet() {
  const foot = (x: number, y: number, flip: boolean) => (
    <g transform={`translate(${x} ${y}) rotate(${flip ? 18 : -8}) scale(${flip ? -1 : 1} 1)`}>
      <path d="M1-10c7 0 9 9 7 17-2 9-4 15-9 15s-7-5-6-11c1-5-1-8-1-12 0-6 4-9 9-9z" fill="#2b2118" />
      <circle cx="-4" cy="-16" r="3.4" fill="#2b2118" />
      <circle cx="2" cy="-18" r="3" fill="#2b2118" />
      <circle cx="7" cy="-16" r="2.6" fill="#2b2118" />
      <circle cx="10.5" cy="-12" r="2.2" fill="#2b2118" />
    </g>
  )
  return (
    <g>
      {foot(37, 60, true)}
      {foot(63, 42, false)}
    </g>
  )
}

export function ZombieDie({
  color,
  face,
  size = 64,
  rolling,
  dim,
}: {
  color: Color
  face: Face | null
  size?: number
  rolling?: boolean
  dim?: boolean
}) {
  return (
    <span className={`zd-die ${rolling ? 'rolling' : ''} ${dim ? 'dim' : ''}`}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-label={`${NAME[color]} 주사위${face ? ` ${FACE_NAME[face]}` : ''}`}
      >
        <rect x="4" y="4" width="92" height="92" rx="20" fill={FILL[color]} stroke={EDGE[color]} strokeWidth="4" />
        <rect x="12" y="10" width="76" height="20" rx="10" fill="#fff" opacity="0.14" />
        {face == null ? (
          <text x="50" y="66" textAnchor="middle" fontSize="44" fontWeight="800" fill="#fff" opacity="0.85">
            ?
          </text>
        ) : (
          <>
            <circle cx="50" cy="50" r="38" fill="#fdf8ec" opacity="0.92" />
            {face === 'brain' ? <Brain /> : face === 'shot' ? <Blast /> : <Feet />}
          </>
        )}
      </svg>
    </span>
  )
}

export function ColorDot({ color }: { color: Color }) {
  return <span className="zd-dot" style={{ background: FILL[color] }} />
}
