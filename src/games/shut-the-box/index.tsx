import { useEffect, useRef, useState } from 'react'
import { Die } from '../../components/Die'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { rollDie } from '../../lib/random'
import { useBestScore, useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  TILES,
  aiChooseTiles,
  aiDiceCount,
  confirmPick,
  finishTurn,
  newBox,
  oneDieAllowed,
  pickValid,
  resolveRoll,
  startRoll,
  sumOf,
  togglePick,
  type BoxState,
} from './logic'
import './shut-the-box.css'

interface Setup {
  players: PlayerConfig[]
  difficulty: Difficulty
  oneDie: boolean
}

export default function ShutTheBox() {
  const [setup, setSetup] = useState<Setup | null>(null)
  const [round, setRound] = useState(0)
  const [oneDie, setOneDie] = useStored('shut-the-box:oneDie', true)
  if (!setup) {
    return (
      <PlayerSetup
        gameId="shut-the-box"
        min={1}
        max={4}
        defaultCount={1}
        showDifficulty
        extra={
          <label className="setup-row stb-option">
            <span>7·8·9가 닫히면 주사위 1개 허용</span>
            <input type="checkbox" checked={oneDie} onChange={(e) => setOneDie(e.target.checked)} />
          </label>
        }
        onStart={(players, difficulty) => setSetup({ players, difficulty, oneDie })}
      />
    )
  }
  return <Board key={round} setup={setup} onAgain={() => setRound((r) => r + 1)} onReset={() => setSetup(null)} />
}

function Board({ setup, onAgain, onReset }: { setup: Setup; onAgain: () => void; onReset: () => void }) {
  const [s, setS] = useState<BoxState>(() => newBox(setup.players, setup.oneDie))
  const { best, submit } = useBestScore('shut-the-box', true)
  const [newRecord, setNewRecord] = useState(false)
  const recorded = useRef(false)
  const solo = s.players.length === 1
  const current = s.players[s.turn]
  const roll = sumOf(s.dice)

  useEffect(() => {
    if (s.phase === 'over') return
    let t: ReturnType<typeof setTimeout> | undefined
    const later = (ms: number, f: (p: BoxState) => BoxState) => {
      t = setTimeout(() => setS(f), ms)
    }
    if (s.phase === 'rolling') {
      const v = s.dice.map(() => rollDie())
      later(500, (p) => resolveRoll(p, v))
    } else if (s.phase === 'stuck' || s.phase === 'shut') {
      later(2200, finishTurn)
    } else if (current.isAI) {
      if (s.phase === 'roll') {
        const n = aiDiceCount(s.open, s.oneDieOption, setup.difficulty)
        later(700, (p) => startRoll(p, n))
      } else if (s.phase === 'pick') {
        if (!pickValid(s)) {
          const tiles = aiChooseTiles(s.open, roll, s.oneDieOption, setup.difficulty)
          later(800, (p) => ({ ...p, picked: tiles }))
        } else later(700, confirmPick)
      }
    }
    return () => clearTimeout(t)
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (s.phase !== 'over' || !solo || recorded.current) return
    recorded.current = true
    const sc = s.results[0] ?? 45
    setNewRecord(best == null || sc < best)
    submit(sc)
  }, [s.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  if (s.phase === 'over') {
    const scores = s.results.map((r) => r ?? 45)
    const low = Math.min(...scores)
    const winners = s.players.filter((_, i) => scores[i] === low)
    const ranking = s.players.map((p, i) => ({ p, i, sc: scores[i] })).sort((a, b) => a.sc - b.sc)
    const title = solo
      ? scores[0] === 0
        ? '📦 셧 더 박스! 0점!'
        : `남은 합계 ${scores[0]}점`
      : winners.length > 1
        ? `🤝 ${winners.map((p) => p.name).join(', ')} 공동 우승!`
        : `🏆 ${winners[0].name} 승리!`
    return (
      <Result title={title} onAgain={onAgain}>
        {solo ? (
          <p>{newRecord ? '🎉 새로운 최고 기록!' : best != null ? `최고 기록: ${best}점` : ''}</p>
        ) : (
          <ol className="ranking">
            {ranking.map(({ p, i, sc }) => (
              <li key={i}>
                {p.name} — <strong>{sc}점</strong>
                {sc === 0 && ' 📦'}
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
  const pickedSum = sumOf(s.picked)
  const canOne = oneDieAllowed(s.open, s.oneDieOption)

  let status = current.isAI ? `🤖 ${current.name} 차례…` : `${current.name} 차례`
  if (s.phase === 'stuck') status = `더 닫을 수 없어요! ${current.name}: ${sumOf(s.open)}점`
  if (s.phase === 'shut') status = `📦 셧 더 박스! ${current.name}: 0점`

  return (
    <>
      {!solo && (
        <div className="players-bar">
          {s.players.map((p, i) => (
            <span key={i} className={`player-chip ${i === s.turn ? 'active' : ''}`}>
              {p.isAI ? '🤖 ' : ''}
              {p.name} {s.results[i] != null ? `· ${s.results[i]}점` : i === s.turn ? '· 진행 중' : ''}
            </span>
          ))}
        </div>
      )}

      <div className="stb-table felt">
        <div className="status">
          {status}
          {solo && best != null && <div className="stb-sub">최고 기록 {best}점</div>}
        </div>

        <div className={`stb-box ${s.phase === 'shut' ? 'shut' : ''}`}>
          {TILES.map((t) => {
            const open = s.open.includes(t)
            const picked = s.picked.includes(t)
            return (
              <button
                key={t}
                className={`stb-tile ${open ? '' : 'closed'} ${picked ? 'picked' : ''}`}
                disabled={!open || !human || s.phase !== 'pick'}
                onClick={() => setS((p) => togglePick(p, t))}
                aria-label={`${t}번 ${open ? '열림' : '닫힘'}`}
              >
                <span>{t}</span>
              </button>
            )
          })}
        </div>

        <div className={`stb-dice ${s.phase === 'stuck' ? 'stuck' : ''}`}>
          {s.dice.map((d, i) => (
            <Die key={i} value={d} size={60} rolling={s.phase === 'rolling'} />
          ))}
          {s.phase !== 'roll' && s.phase !== 'rolling' && <span className="stb-sum">= {roll}</span>}
        </div>

        <div className="stb-info">
          남은 합계 <strong>{sumOf(s.open)}</strong>
          {s.phase === 'pick' && (
            <span>
              {' '}
              · 고른 합 <strong className={pickedSum === roll ? 'ok' : pickedSum > roll ? 'over' : ''}>{pickedSum}</strong> / {roll}
            </span>
          )}
        </div>

        <div className="stb-buttons">
          {s.phase === 'pick' ? (
            <>
              <button className="btn ghost" disabled={!human || s.picked.length === 0} onClick={() => setS((p) => ({ ...p, picked: [] }))}>
                다시 고르기
              </button>
              <button className="btn primary big" disabled={!human || !pickValid(s)} onClick={() => setS(confirmPick)}>
                🔒 닫기
              </button>
            </>
          ) : (
            <>
              <button className="btn accent big" disabled={!human || s.phase !== 'roll'} onClick={() => setS((p) => startRoll(p, 2))}>
                🎲🎲 굴리기
              </button>
              {canOne && (
                <button className="btn big" disabled={!human || s.phase !== 'roll'} onClick={() => setS((p) => startRoll(p, 1))}>
                  🎲 1개만
                </button>
              )}
            </>
          )}
        </div>
        {human && s.phase === 'pick' && <p className="stb-hint">합이 {roll}이 되도록 숫자판을 골라 닫으세요</p>}
      </div>
    </>
  )
}
