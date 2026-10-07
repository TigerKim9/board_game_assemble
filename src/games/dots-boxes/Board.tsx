import { useState } from 'react'
import { edgeCoords, geo, scores, type DbState } from './logic'

const PAD = 0.35

/** Score chips in player colours (shared by the local and online games). */
export function DotsBar({
  players,
  state: s,
  thinking,
  you,
}: {
  players: { name: string; isAI?: boolean; away?: boolean }[]
  state: DbState
  thinking?: boolean
  you?: number | null
}) {
  const sc = scores(s)
  return (
    <div className="dots-boxes-bar">
      {players.map((p, i) => (
        <div
          key={i}
          className={`dots-boxes-chip ${i === s.turn && !s.over ? 'active' : ''} ${p.away ? 'online-away' : ''}`}
          style={{ '--c': `var(--p${i + 1})` } as React.CSSProperties}
        >
          <span className="dots-boxes-swatch">{i + 1}</span>
          <span className="dots-boxes-name">
            {p.isAI ? '🤖 ' : ''}
            {p.name}
            {you === i && ' (나)'}
            {p.away && ' 📴'}
          </span>
          <strong>{sc[i]}</strong>
          {p.isAI && <span className={`othello-duel-dots ${i === s.turn && thinking ? 'on' : ''}`} aria-hidden />}
        </div>
      ))}
    </div>
  )
}

/** Dots-and-boxes board (shared by the local and online games). `live` = the viewer may draw a line now. */
export function DotsBoard({ state: s, live, onPlay }: { state: DbState; live: boolean; onPlay: (edge: number) => void }) {
  const [hover, setHover] = useState<number | null>(null)
  const { n } = s
  const { E, H } = geo(n)
  const view = n + PAD * 2

  // Diamond hit areas tile the board so every tap maps to the nearest edge.
  const hitShape = (e: number) => {
    const [x1, y1, x2, y2] = edgeCoords(n, e)
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    const pts =
      e < H
        ? [[x1, y1], [mx, my - 0.5], [x2, y2], [mx, my + 0.5]]
        : [[x1, y1], [mx + 0.5, my], [x2, y2], [mx - 0.5, my]]
    return pts.map(([x, y]) => `${x + PAD},${y + PAD}`).join(' ')
  }

  return (
    <div className="dots-boxes-wrap">
      <svg
        className={`dots-boxes-board ${live ? 'live' : ''}`}
        viewBox={`0 0 ${view} ${view}`}
        onPointerLeave={() => setHover(null)}
        role="grid"
        aria-label="도트 앤 박스 판"
      >
        {s.boxes.map((o, b) => {
          const r = Math.floor(b / n)
          const c = b % n
          if (o < 0) return null
          return (
            <g key={b} className={`dots-boxes-box ${s.lastBoxes.includes(b) ? 'new' : ''}`}>
              <rect x={c + PAD + 0.04} y={r + PAD + 0.04} width={0.92} height={0.92} rx={0.08} style={{ fill: `var(--p${o + 1})` }} />
              <text x={c + PAD + 0.5} y={r + PAD + 0.62}>
                {o + 1}
              </text>
            </g>
          )
        })}
        {Array.from({ length: E }, (_, e) => {
          const [x1, y1, x2, y2] = edgeCoords(n, e)
          const owner = s.edges[e]
          const drawn = owner >= 0
          return (
            <line
              key={e}
              x1={x1 + PAD}
              y1={y1 + PAD}
              x2={x2 + PAD}
              y2={y2 + PAD}
              className={`dots-boxes-edge ${drawn ? 'drawn' : ''} ${s.last === e ? 'last' : ''} ${
                !drawn && hover === e && live ? 'hover' : ''
              }`}
              style={drawn ? { stroke: `var(--p${owner + 1})` } : undefined}
            />
          )
        })}
        {Array.from({ length: (n + 1) * (n + 1) }, (_, k) => (
          <circle key={k} cx={(k % (n + 1)) + PAD} cy={Math.floor(k / (n + 1)) + PAD} r={0.09} className="dots-boxes-dot" />
        ))}
        {live &&
          Array.from({ length: E }, (_, e) =>
            s.edges[e] < 0 ? (
              <polygon
                key={e}
                points={hitShape(e)}
                className="dots-boxes-hit"
                onPointerEnter={(ev) => ev.pointerType === 'mouse' && setHover(e)}
                onClick={() => onPlay(e)}
              />
            ) : null,
          )}
      </svg>
    </div>
  )
}
