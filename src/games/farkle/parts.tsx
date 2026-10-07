import type { ReactNode } from 'react'
import { Die } from '../../components/Die'

/** Score list with the current player highlighted. */
export function FarklePlayers({
  names,
  scores,
  turn,
  finalFrom,
}: {
  names: ReactNode[]
  scores: number[]
  turn: number | null
  finalFrom: number | null
}) {
  return (
    <ul className="farkle-players">
      {names.map((name, i) => (
        <li
          key={i}
          className={`farkle-player ${i === turn ? 'active' : ''}`}
          style={{ '--c': `var(--p${(i % 6) + 1})` } as React.CSSProperties}
        >
          <span className="farkle-pname">
            {name}
            {finalFrom === i && ' 🏁'}
          </span>
          <strong>{scores[i].toLocaleString()}</strong>
        </li>
      ))}
    </ul>
  )
}

export function FarkleKept({ kept }: { kept: number[][] }) {
  if (kept.length === 0) return null
  return (
    <div className="farkle-kept">
      <span>따로 둔 주사위</span>
      <div className="farkle-kept-dice">
        {kept.flat().map((d, i) => (
          <Die key={i} value={d} size={26} />
        ))}
      </div>
    </div>
  )
}

export function FarkleRef() {
  return (
    <details className="farkle-ref card-panel">
      <summary>점수표 보기</summary>
      <ul>
        <li>1 하나 = 100 · 5 하나 = 50</li>
        <li>같은 눈 3개 = 눈×100 (1 세 개는 1,000)</li>
        <li>같은 눈 4개 = 1,000 · 5개 = 2,000 · 6개 = 3,000</li>
        <li>1-2-3-4-5-6 스트레이트 = 1,500</li>
        <li>세 쌍 = 1,500 · 4개+한 쌍 = 1,500 · 트리플 두 개 = 2,500</li>
      </ul>
    </details>
  )
}
