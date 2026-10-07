import { useEffect, useRef, useState } from 'react'
import { Die } from '../../components/Die'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { rollDie } from '../../lib/random'
import { useBestScore } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { TARGET, aiShouldRoll, applyRoll, endBust, hold, newGame, startRoll, type PigState } from './logic'
import './pig.css'

interface Setup {
  players: PlayerConfig[]
  difficulty: Difficulty
}

export default function Pig() {
  const [setup, setSetup] = useState<Setup | null>(null)
  const [round, setRound] = useState(0)
  if (!setup) {
    return (
      <PlayerSetup
        gameId="pig"
        min={1}
        max={6}
        defaultCount={2}
        showDifficulty
        onStart={(players, difficulty) => setSetup({ players, difficulty })}
      />
    )
  }
  return (
    <Board
      key={round}
      setup={setup}
      onAgain={() => setRound((r) => r + 1)}
      onReset={() => setSetup(null)}
    />
  )
}

function Board({ setup, onAgain, onReset }: { setup: Setup; onAgain: () => void; onReset: () => void }) {
  const [s, setS] = useState<PigState>(() => newGame(setup.players))
  const { best, submit } = useBestScore('pig', true)
  const [newRecord, setNewRecord] = useState(false)
  const recorded = useRef(false)
  const solo = s.players.length === 1
  const current = s.players[s.turn]

  // Timed steps: resolve rolls, end busted turns, drive AI.
  useEffect(() => {
    if (s.winner != null) return
    let t: ReturnType<typeof setTimeout> | undefined
    if (s.rolling) {
      const v = rollDie()
      t = setTimeout(() => setS((p) => applyRoll(p, v)), 450)
    } else if (s.bust) {
      t = setTimeout(() => setS((p) => endBust(p)), 1300)
    } else if (current.isAI) {
      const oppBest = Math.max(0, ...s.scores.filter((_, i) => i !== s.turn))
      const again = aiShouldRoll(s.turnTotal, s.scores[s.turn], oppBest, setup.difficulty)
      t = setTimeout(() => setS((p) => (again ? startRoll(p) : hold(p))), s.rolls === 0 ? 700 : 650)
    }
    return () => clearTimeout(t)
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (s.winner == null || !solo || recorded.current) return
    recorded.current = true
    setNewRecord(best == null || s.turns[0] < best)
    submit(s.turns[0])
  }, [s.winner]) // eslint-disable-line react-hooks/exhaustive-deps

  if (s.winner != null) {
    const ranking = s.players.map((p, i) => ({ p, i, sc: s.scores[i] })).sort((a, b) => b.sc - a.sc)
    return (
      <Result
        title={solo ? `${s.turns[0]}번 만에 100점!` : `🏆 ${s.players[s.winner].name} 승리!`}
        onAgain={onAgain}
      >
        {solo ? (
          <p>{newRecord ? '🎉 새로운 최고 기록!' : best != null ? `최고 기록: ${best}번` : ''}</p>
        ) : (
          <ol className="ranking">
            {ranking.map(({ p, i, sc }) => (
              <li key={i}>
                {p.name} — <strong>{sc}점</strong>
              </li>
            ))}
          </ol>
        )}
        <button className="btn ghost" onClick={onReset}>
          인원 바꾸기
        </button>
      </Result>
    )
  }

  const humanTurn = !current.isAI
  const busy = s.rolling || s.bust

  return (
    <>
      <ul className="pig-players">
        {s.players.map((p, i) => (
          <li key={i} className={`pig-player ${i === s.turn ? 'active' : ''}`} style={{ '--c': `var(--p${(i % 6) + 1})` } as React.CSSProperties}>
            <div className="pig-player-top">
              <span className="pig-name">
                {p.isAI ? '🤖 ' : ''}
                {p.name}
              </span>
              <strong>{s.scores[i]}</strong>
            </div>
            <div className="pig-bar">
              <div className="pig-bar-fill" style={{ width: `${Math.min(100, (s.scores[i] / TARGET) * 100)}%` }} />
              {i === s.turn && s.turnTotal > 0 && (
                <div
                  className="pig-bar-pending"
                  style={{
                    left: `${Math.min(100, (s.scores[i] / TARGET) * 100)}%`,
                    width: `${Math.min(100 - (s.scores[i] / TARGET) * 100, (s.turnTotal / TARGET) * 100)}%`,
                  }}
                />
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="pig-table felt">
        <div className="status">
          {s.bust
            ? `앗, 1이에요! ${current.name}의 이번 차례 점수가 날아갔어요 🐷`
            : current.isAI
              ? `🤖 ${current.name} 차례…`
              : `${current.name} 차례`}
          {solo && (
            <div className="pig-sub">
              {s.turns[0] + 1}번째 차례{best != null && ` · 최고 기록 ${best}번`}
            </div>
          )}
        </div>
        <div className={`pig-die ${s.bust ? 'bust' : ''}`}>
          <Die value={s.die} rolling={s.rolling} size={108} />
        </div>
        <div className="pig-turn-total">
          이번 차례 <strong>{s.turnTotal}</strong>점
          {s.turnTotal > 0 && <span className="pig-sub"> → 저장하면 {s.scores[s.turn] + s.turnTotal}점</span>}
        </div>
        <div className="pig-buttons">
          <button className="btn accent big" disabled={!humanTurn || busy} onClick={() => setS(startRoll)}>
            🎲 굴리기
          </button>
          <button className="btn primary big" disabled={!humanTurn || busy || s.turnTotal === 0} onClick={() => setS(hold)}>
            ✋ 멈추기
          </button>
        </div>
      </div>
    </>
  )
}
