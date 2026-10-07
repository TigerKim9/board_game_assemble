import type { ReactNode } from 'react'
import { BUST_SHOTS, type Color } from './logic'
import { ColorDot, ZombieDie } from './ZombieDie'

const countColor = (xs: Color[], c: Color) => xs.filter((x) => x === c).length

/** Brain score per player, current player highlighted. */
export function ZdPlayers({ names, scores, turn }: { names: ReactNode[]; scores: number[]; turn: number | null }) {
  return (
    <ul className="zd-players">
      {names.map((name, i) => (
        <li
          key={i}
          className={`zd-player ${i === turn ? 'active' : ''}`}
          style={{ '--c': `var(--p${(i % 6) + 1})` } as React.CSSProperties}
        >
          <span className="zd-pname">{name}</span>
          <strong>🧠 {scores[i]}</strong>
        </li>
      ))}
    </ul>
  )
}

/** This turn's brains and shots. */
export function ZdTally({ brains, shots }: { brains: number; shots: number }) {
  return (
    <div className="zd-tally">
      <div className="zd-tally-box brains">
        <span className="zd-tally-label">이번 차례 뇌</span>
        <strong>🧠 {brains}</strong>
      </div>
      <div className={`zd-tally-box shots ${shots >= 2 ? 'danger' : ''}`}>
        <span className="zd-tally-label">총알</span>
        <div className="zd-shots">
          {Array.from({ length: BUST_SHOTS }, (_, i) => (
            <span key={i} className={`zd-shot ${i < shots ? 'hit' : ''}`}>
              💥
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ZdCupInfo({ cup }: { cup: Color[] }) {
  return (
    <div className="zd-cupinfo">
      통 속 남은 주사위:
      {(['green', 'yellow', 'red'] as Color[]).map((c) => (
        <span key={c} className="zd-cupcount">
          <ColorDot color={c} /> {countColor(cup, c)}
        </span>
      ))}
    </div>
  )
}

export function ZdLegend() {
  return (
    <div className="zd-legend card-panel">
      <div>
        <ZombieDie color="green" face="brain" size={30} /> 뇌 = 점수
      </div>
      <div>
        <ZombieDie color="red" face="shot" size={30} /> 총알 3개면 꽝
      </div>
      <div>
        <ZombieDie color="yellow" face="feet" size={30} /> 발자국은 다시 굴림
      </div>
      <div className="zd-legend-colors">
        <ColorDot color="green" /> 안전 <ColorDot color="yellow" /> 보통 <ColorDot color="red" /> 위험
      </div>
    </div>
  )
}
