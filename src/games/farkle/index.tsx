import { useEffect, useRef, useState } from 'react'
import { Die } from '../../components/Die'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useBestScore, useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  endTurn,
  keepAndBank,
  keepAndRoll,
  newFarkle,
  resolveRoll,
  selectionScore,
  setSelection,
  startRoll,
  toggle,
  type FarkleState,
} from './game'
import { aiChooseKeep, aiShouldBank, rollN, type AiContext } from './logic'
import { FarkleKept, FarklePlayers, FarkleRef } from './parts'
import './farkle.css'

interface Setup {
  players: PlayerConfig[]
  difficulty: Difficulty
  target: number
}

export default function Farkle() {
  const [setup, setSetup] = useState<Setup | null>(null)
  const [round, setRound] = useState(0)
  const [target, setTarget] = useStored<number>('farkle:target', 10000)
  if (!setup) {
    return (
      <PlayerSetup
        gameId="farkle"
        min={1}
        max={6}
        defaultCount={2}
        showDifficulty
        extra={
          <div className="setup-row">
            <span>목표 점수</span>
            <div className="segmented">
              {[5000, 10000].map((t) => (
                <button key={t} className={target === t ? 'active' : ''} onClick={() => setTarget(t)}>
                  {t.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
        }
        onStart={(players, difficulty) => setSetup({ players, difficulty, target })}
      />
    )
  }
  return <Board key={round} setup={setup} onAgain={() => setRound((r) => r + 1)} onReset={() => setSetup(null)} />
}

function Board({ setup, onAgain, onReset }: { setup: Setup; onAgain: () => void; onReset: () => void }) {
  const [s, setS] = useState<FarkleState>(() => newFarkle(setup.players, setup.target))
  const { best, submit } = useBestScore(`farkle-${setup.target}`, true)
  const [newRecord, setNewRecord] = useState(false)
  const recorded = useRef(false)
  const solo = s.players.length === 1
  const current = s.players[s.turn]

  useEffect(() => {
    if (s.phase === 'over') return
    let t: ReturnType<typeof setTimeout> | undefined
    const later = (ms: number, f: (p: FarkleState) => FarkleState) => {
      t = setTimeout(() => setS(f), ms)
    }
    if (s.phase === 'rolling') {
      const v = rollN(s.dice.length)
      later(550, (p) => resolveRoll(p, v))
    } else if (s.phase === 'farkle') {
      later(1700, (p) => endTurn(p, false))
    } else if (current.isAI) {
      const others = s.scores.filter((_, i) => i !== s.turn)
      const ctx: AiContext = {
        turnTotal: s.turnTotal,
        myScore: s.scores[s.turn],
        target: s.target,
        mustBeat: s.finalFrom != null ? Math.max(...others) : null,
        oppBest: Math.max(0, ...others),
        difficulty: setup.difficulty,
      }
      if (s.phase === 'start') later(700, startRoll)
      else if (s.phase === 'choose') {
        if (!s.selected.some(Boolean)) {
          const idx = aiChooseKeep(s.dice, ctx)
          later(900, (p) => setSelection(p, idx))
        } else {
          const sc = selectionScore(s) ?? 0
          const left = s.dice.length - s.selected.filter(Boolean).length
          const bank = aiShouldBank(s.turnTotal + sc, left, ctx)
          later(800, bank ? keepAndBank : keepAndRoll)
        }
      }
    }
    return () => clearTimeout(t)
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (s.phase !== 'over' || !solo || recorded.current) return
    recorded.current = true
    const turns = s.turnsTaken[0]
    setNewRecord(best == null || turns < best)
    submit(turns)
  }, [s.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  if (s.phase === 'over') {
    const ranking = s.players.map((p, i) => ({ p, i, sc: s.scores[i] })).sort((a, b) => b.sc - a.sc)
    const title = solo
      ? `${s.turnsTaken[0]}번 만에 ${s.target.toLocaleString()}점!`
      : s.winners.length > 1
        ? `🤝 ${s.winners.map((i) => s.players[i].name).join(', ')} 공동 우승!`
        : `🏆 ${s.players[s.winners[0]].name} 승리!`
    return (
      <Result title={title} onAgain={onAgain}>
        {solo ? (
          <p>{newRecord ? '🎉 새로운 최고 기록!' : best != null ? `최고 기록: ${best}번` : ''}</p>
        ) : (
          <ol className="ranking">
            {ranking.map(({ p, i, sc }) => (
              <li key={i}>
                {p.name} — <strong>{sc.toLocaleString()}점</strong>
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

  const human = !current.isAI
  const selScore = selectionScore(s)
  const anySel = s.selected.some(Boolean)
  const canAct = human && s.phase === 'choose' && selScore != null
  const left = s.dice.length - s.selected.filter(Boolean).length

  let hint = ''
  if (human && s.phase === 'choose') {
    if (!anySel) hint = '점수가 되는 주사위를 눌러 골라 주세요'
    else if (selScore == null) hint = '점수가 안 되는 주사위가 섞여 있어요'
    else hint = `+${selScore.toLocaleString()}점 · ${left === 0 ? '🔥 핫 다이스!' : `남은 주사위 ${left}개`}`
  }

  return (
    <>
      <FarklePlayers
        names={s.players.map((p) => `${p.isAI ? '🤖 ' : ''}${p.name}`)}
        scores={s.scores}
        turn={s.turn}
        finalFrom={s.finalFrom}
      />

      <div className="farkle-table felt">
        <div className="status">
          {current.isAI ? `🤖 ${current.name} 차례…` : `${current.name} 차례`}
          <div className="farkle-sub">
            목표 {s.target.toLocaleString()}점
            {solo && ` · ${s.turnsTaken[0] + 1}번째 차례`}
            {solo && best != null && ` · 최고 ${best}번`}
          </div>
        </div>

        <div className="farkle-turn">
          <span>이번 차례</span>
          <strong>{s.turnTotal.toLocaleString()}</strong>
          {anySel && selScore != null && <em>+{selScore.toLocaleString()}</em>}
        </div>

        <div className={`farkle-dice ${s.phase === 'farkle' ? 'bust' : ''}`}>
          {s.phase === 'start' ? (
            <div className="farkle-ready">🎲 × {s.toRoll}</div>
          ) : (
            s.dice.map((d, i) => (
              <Die
                key={i}
                value={d}
                size={52}
                held={s.selected[i]}
                rolling={s.phase === 'rolling'}
                disabled={!human || s.phase !== 'choose'}
                onClick={() => setS((p) => toggle(p, i))}
              />
            ))
          )}
        </div>

        {s.log && <div className="farkle-log">{s.log}</div>}
        {hint && <div className="farkle-hint">{hint}</div>}

        <FarkleKept kept={s.kept} />

        <div className="farkle-buttons">
          {s.phase === 'start' || s.phase === 'rolling' || s.phase === 'farkle' ? (
            <button className="btn accent big" disabled={!human || s.phase !== 'start'} onClick={() => setS(startRoll)}>
              🎲 굴리기
            </button>
          ) : (
            <>
              <button className="btn accent big" disabled={!canAct} onClick={() => setS(keepAndRoll)}>
                {left === 0 && anySel ? '🔥 6개 다시 굴리기' : `🎲 계속 굴리기${anySel && selScore != null ? ` (${left}개)` : ''}`}
              </button>
              <button className="btn primary big" disabled={!canAct} onClick={() => setS(keepAndBank)}>
                💰 {canAct ? `${(s.turnTotal + (selScore ?? 0)).toLocaleString()}점 ` : ''}저장
              </button>
            </>
          )}
        </div>
      </div>

      <FarkleRef />
    </>
  )
}
