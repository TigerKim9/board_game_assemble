import { useEffect, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  BUST_SHOTS,
  GOAL,
  aiShouldContinue,
  drawDice,
  endTurn,
  newZombie,
  resolveRoll,
  rollFaces,
  type Color,
  type ZState,
} from './logic'
import { ColorDot, ZombieDie } from './ZombieDie'
import './zombie-dice.css'

interface Setup {
  players: PlayerConfig[]
  difficulty: Difficulty
}

export default function ZombieHunt() {
  const [setup, setSetup] = useState<Setup | null>(null)
  const [round, setRound] = useState(0)
  if (!setup) {
    return (
      <PlayerSetup
        gameId="zombie-dice"
        min={2}
        max={8}
        defaultCount={3}
        showDifficulty
        onStart={(players, difficulty) => setSetup({ players, difficulty })}
      />
    )
  }
  return <Board key={round} setup={setup} onAgain={() => setRound((r) => r + 1)} onReset={() => setSetup(null)} />
}

const countColor = (xs: Color[], c: Color) => xs.filter((x) => x === c).length

function Board({ setup, onAgain, onReset }: { setup: Setup; onAgain: () => void; onReset: () => void }) {
  const [s, setS] = useState<ZState>(() => newZombie(setup.players))
  const current = s.players[s.turn]

  useEffect(() => {
    if (s.phase === 'over') return
    let t: ReturnType<typeof setTimeout> | undefined
    const later = (ms: number, next: ZState | ((p: ZState) => ZState)) => {
      t = setTimeout(() => setS(next), ms)
    }
    if (s.phase === 'rolling') {
      const faces = rollFaces(s.hand)
      later(650, (p) => resolveRoll(p, faces))
    } else if (s.phase === 'bust') {
      later(1900, (p) => endTurn(p, false))
    } else if (current.isAI) {
      const go = aiShouldContinue(s, setup.difficulty)
      later(s.phase === 'start' ? 800 : 1100, go ? drawDice(s) : endTurn(s, true))
    }
    return () => clearTimeout(t)
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps

  if (s.phase === 'over') {
    const ranking = s.players.map((p, i) => ({ p, i, sc: s.scores[i] })).sort((a, b) => b.sc - a.sc)
    const title =
      s.winners.length > 1
        ? `🤝 ${s.winners.map((i) => s.players[i].name).join(', ')} 공동 우승!`
        : `🧟 ${s.players[s.winners[0]].name} 승리!`
    return (
      <Result title={title} onAgain={onAgain}>
        <ol className="ranking">
          {ranking.map(({ p, i, sc }) => (
            <li key={i}>
              {p.name} — <strong>🧠 {sc}</strong>
            </li>
          ))}
        </ol>
        <button className="btn ghost" onClick={onReset}>
          인원 바꾸기
        </button>
      </Result>
    )
  }

  const human = !current.isAI
  const feet = s.hand.filter((d) => d.face === 'feet').length
  const canRoll = human && (s.phase === 'start' || s.phase === 'decide')

  return (
    <>
      <ul className="zd-players">
        {s.players.map((p, i) => (
          <li
            key={i}
            className={`zd-player ${i === s.turn ? 'active' : ''}`}
            style={{ '--c': `var(--p${(i % 6) + 1})` } as React.CSSProperties}
          >
            <span className="zd-pname">
              {p.isAI ? '🤖 ' : ''}
              {p.name}
            </span>
            <strong>🧠 {s.scores[i]}</strong>
          </li>
        ))}
      </ul>

      <div className="zd-table felt">
        <div className="status">
          {current.isAI ? `🤖 ${current.name} 사냥 중…` : `${current.name} 차례`}
          <div className="zd-sub">
            뇌 {GOAL}개를 먼저 모으면 승리{s.finalRound && ' · 🏁 마지막 바퀴!'}
          </div>
        </div>

        <div className={`zd-hand ${s.phase === 'bust' ? 'bust' : ''}`}>
          {s.hand.length === 0 ? (
            <div className="zd-cup" aria-label="주사위 통">
              <span>🥫</span>
              <small>통에서 3개를 뽑아 굴려요</small>
            </div>
          ) : (
            s.hand.map((d, i) => (
              <ZombieDie key={i} color={d.color} face={d.face} size={76} rolling={s.phase === 'rolling'} />
            ))
          )}
        </div>

        {s.log && <div className="zd-log">{s.log}</div>}

        <div className="zd-tally">
          <div className="zd-tally-box brains">
            <span className="zd-tally-label">이번 차례 뇌</span>
            <strong>🧠 {s.brains}</strong>
          </div>
          <div className={`zd-tally-box shots ${s.shots.length >= 2 ? 'danger' : ''}`}>
            <span className="zd-tally-label">총알</span>
            <div className="zd-shots">
              {Array.from({ length: BUST_SHOTS }, (_, i) => (
                <span key={i} className={`zd-shot ${i < s.shots.length ? 'hit' : ''}`}>
                  💥
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="zd-cupinfo">
          통 속 남은 주사위:
          {(['green', 'yellow', 'red'] as Color[]).map((c) => (
            <span key={c} className="zd-cupcount">
              <ColorDot color={c} /> {countColor(s.cup, c)}
            </span>
          ))}
        </div>

        <div className="zd-buttons">
          <button className="btn accent big" disabled={!canRoll} onClick={() => setS(drawDice(s))}>
            🎲 {s.phase === 'decide' && feet > 0 ? `굴리기 (발자국 ${feet}개 + 새로 ${3 - feet}개)` : '굴리기'}
          </button>
          <button
            className="btn primary big"
            disabled={!human || s.phase !== 'decide' || s.brains === 0}
            onClick={() => setS(endTurn(s, true))}
          >
            ✋ 멈추고 뇌 {s.brains}개 저장
          </button>
        </div>
      </div>

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
    </>
  )
}
