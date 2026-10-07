import { runs, type NTState } from './logic'

/** Every player's chips, score and collected cards (runs grouped). */
export function Seats({
  players,
  s,
  sc,
  over,
}: {
  players: { name: string; isAI: boolean }[]
  s: Pick<NTState, 'hands' | 'chips' | 'turn' | 'removed'>
  sc: number[]
  over?: boolean
}) {
  return (
    <>
      <ul className="nt-seats">
        {players.map((p, i) => (
          <li key={i} className={`nt-seat ${!over && i === s.turn ? 'active' : ''}`} style={{ ['--pc' as string]: `var(--p${(i % 6) + 1})` }}>
            <div className="nt-seat-head">
              <span className="nt-name">
                {p.isAI ? '🤖 ' : ''}
                {p.name}
              </span>
              <span className="nt-chips">🪙 {s.chips[i]}</span>
              <span className="nt-score">{sc[i]}점</span>
            </div>
            <div className="nt-hand">
              {s.hands[i].length === 0 && <span className="muted nt-empty">아직 카드 없음</span>}
              {runs(s.hands[i]).map((r) => (
                <span key={r[0]} className="nt-run">
                  {r.map((c, j) => (
                    <NumberCard key={c} value={c} dim={j > 0} />
                  ))}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {over && (
        <p className="nt-removed muted">
          빠졌던 카드: {s.removed.join(', ')}
        </p>
      )}
    </>
  )
}

export function NumberCard({ value, big, dim }: { value: number; big?: boolean; dim?: boolean }) {
  const hue = Math.round(((value - 3) / 32) * 300)
  return (
    <span
      className={`nt-card ${big ? 'big' : ''} ${dim ? 'dim' : ''}`}
      style={{ ['--hue' as string]: hue }}
    >
      {value}
    </span>
  )
}

export function ChipStack({ n }: { n: number }) {
  const shown = Math.min(n, 12)
  return (
    <span className="nt-chipstack">
      {Array.from({ length: shown }, (_, i) => (
        <i key={i} className="nt-chip" style={{ bottom: i * 4, left: (i % 2) * 3 }} />
      ))}
    </span>
  )
}
