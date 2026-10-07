import { useEffect, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  GOAL,
  aiShouldContinue,
  drawDice,
  endTurn,
  newZombie,
  resolveRoll,
  rollFaces,
  type ZState,
} from './logic'
import { ZdCupInfo, ZdLegend, ZdPlayers, ZdTally } from './parts'
import { ZombieDie } from './ZombieDie'
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
      <ZdPlayers names={s.players.map((p) => `${p.isAI ? '🤖 ' : ''}${p.name}`)} scores={s.scores} turn={s.turn} />

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

        <ZdTally brains={s.brains} shots={s.shots.length} />

        <ZdCupInfo cup={s.cup} />

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

      <ZdLegend />
    </>
  )
}
