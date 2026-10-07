import { useEffect, useRef, useState } from 'react'
import { Die } from '../../components/Die'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { sleep } from '../../lib/random'
import { useBestScore } from '../../lib/storage'
import type { PlayerConfig } from '../../lib/types'
import {
  BONUS,
  BONUS_THRESHOLD,
  CATEGORIES,
  LABELS,
  bestCategory,
  bonusFor,
  chooseHolds,
  isComplete,
  roll,
  scoreFor,
  total,
  upperTotal,
  type Category,
  type Scores,
} from './logic'
import './yacht.css'

interface State {
  players: PlayerConfig[]
  scores: Scores[]
  turn: number
  dice: number[]
  held: boolean[]
  rollsLeft: number
}

const fresh = (players: PlayerConfig[]): State => ({
  players,
  scores: players.map(() => ({})),
  turn: 0,
  dice: [1, 2, 3, 4, 5],
  held: [false, false, false, false, false],
  rollsLeft: 3,
})

export default function Yacht() {
  const [state, setState] = useState<State | null>(null)
  if (!state) {
    return <PlayerSetup gameId="yacht" min={1} max={4} defaultCount={1} onStart={(p) => setState(fresh(p))} />
  }
  return <Board state={state} setState={setState} onReset={() => setState(null)} />
}

function Board({
  state,
  setState,
  onReset,
}: {
  state: State
  setState: React.Dispatch<React.SetStateAction<State | null>>
  onReset: () => void
}) {
  const [rolling, setRolling] = useState(false)
  const { best, submit } = useBestScore('yacht')
  const [newRecord, setNewRecord] = useState(false)
  const { players, scores, turn, dice, held, rollsLeft } = state
  const gameOver = scores.every(isComplete)
  const current = players[turn]
  const hasRolled = rollsLeft < 3
  const aiRunning = useRef(false)

  const doRoll = async (holdMask: boolean[]) => {
    setRolling(true)
    await sleep(450)
    setState((s) => s && { ...s, dice: roll(s.dice, holdMask), held: holdMask, rollsLeft: s.rollsLeft - 1 })
    setRolling(false)
  }

  const choose = (cat: Category) => {
    setState((s) => {
      if (!s) return s
      const scores = s.scores.map((sc, i) => (i === s.turn ? { ...sc, [cat]: scoreFor(cat, s.dice) } : sc))
      return {
        ...s,
        scores,
        turn: (s.turn + 1) % s.players.length,
        held: [false, false, false, false, false],
        rollsLeft: 3,
      }
    })
  }

  // Solo record tracking
  useEffect(() => {
    if (gameOver && players.length === 1 && !players[0].isAI) setNewRecord(submit(total(scores[0])))
  }, [gameOver]) // eslint-disable-line react-hooks/exhaustive-deps

  // AI turns
  useEffect(() => {
    if (gameOver || !current.isAI || aiRunning.current) return
    aiRunning.current = true
    ;(async () => {
      const sc = scores[turn]
      let d = dice
      let h = [false, false, false, false, false]
      let left = 3
      await sleep(500)
      setRolling(true)
      await sleep(450)
      d = roll(d, h)
      left--
      setState((s) => s && { ...s, dice: d, held: h, rollsLeft: left })
      setRolling(false)
      while (left > 0) {
        await sleep(700)
        h = chooseHolds(d, sc, left)
        if (h.every(Boolean)) break
        setState((s) => s && { ...s, held: h })
        await sleep(500)
        setRolling(true)
        await sleep(450)
        d = roll(d, h)
        left--
        setState((s) => s && { ...s, dice: d, held: h, rollsLeft: left })
        setRolling(false)
      }
      await sleep(800)
      const cat = bestCategory(d, sc)
      aiRunning.current = false
      choose(cat)
    })()
  }, [turn, gameOver]) // eslint-disable-line react-hooks/exhaustive-deps

  const humanTurn = !current.isAI && !gameOver
  const ranking = players
    .map((p, i) => ({ p, i, t: total(scores[i]) }))
    .sort((a, b) => b.t - a.t)

  return (
    <>
      {gameOver ? (
        <Result
          title={players.length === 1 ? `${total(scores[0])}점!` : `🏆 ${ranking[0].p.name} 승리!`}
          onAgain={() => setState(fresh(players))}
        >
          {players.length === 1 ? (
            <p>{newRecord ? '🎉 새로운 최고 기록!' : best != null ? `최고 기록: ${best}점` : ''}</p>
          ) : (
            <ol className="ranking">
              {ranking.map(({ p, i, t }) => (
                <li key={i}>
                  {p.name} — <strong>{t}점</strong>
                </li>
              ))}
            </ol>
          )}
          <button className="btn ghost" onClick={onReset}>
            인원 바꾸기
          </button>
        </Result>
      ) : (
        <div className="yacht-table felt">
          <div className="status">
            {current.isAI ? `🤖 ${current.name} 차례…` : `${current.name} 차례`}
            {players.length === 1 && best != null && <span className="best"> · 최고 {best}점</span>}
          </div>
          <div className="dice-row">
            {dice.map((d, i) => (
              <Die
                key={i}
                value={d}
                held={held[i] && hasRolled}
                rolling={rolling && !held[i]}
                size={58}
                disabled={!humanTurn || !hasRolled || rollsLeft === 0 || rolling}
                onClick={() => setState((s) => s && { ...s, held: s.held.map((h, j) => (j === i ? !h : h)) })}
              />
            ))}
          </div>
          <button
            className="btn accent big"
            disabled={!humanTurn || rollsLeft === 0 || rolling}
            onClick={() => doRoll(hasRolled ? held : [false, false, false, false, false])}
          >
            {rollsLeft === 0 ? '점수를 고르세요' : `굴리기 (${rollsLeft}회 남음)`}
          </button>
          {humanTurn && hasRolled && rollsLeft > 0 && <p className="hint">주사위를 눌러 고정할 수 있어요</p>}
        </div>
      )}

      <div className="scoreboard-wrap">
        <table className="scoreboard">
          <thead>
            <tr>
              <th></th>
              {players.map((p, i) => (
                <th key={i} className={i === turn && !gameOver ? 'active' : ''}>
                  {p.isAI ? '🤖 ' : ''}
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => (
              <ScoreRow
                key={cat}
                cat={cat}
                state={state}
                canPick={humanTurn && hasRolled && !rolling}
                onPick={choose}
                after={cat === 'sixes'}
              />
            ))}
            <tr className="total-row">
              <th>합계</th>
              {scores.map((s, i) => (
                <td key={i}>{total(s)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

function ScoreRow({
  cat,
  state,
  canPick,
  onPick,
  after,
}: {
  cat: Category
  state: State
  canPick: boolean
  onPick: (c: Category) => void
  after: boolean
}) {
  const { scores, turn, dice } = state
  return (
    <>
      <tr>
        <th>{LABELS[cat]}</th>
        {scores.map((s, i) => {
          const v = s[cat]
          if (v !== undefined) return <td key={i}>{v}</td>
          if (i === turn && canPick) {
            const preview = scoreFor(cat, dice)
            return (
              <td key={i}>
                <button className={`pick ${preview > 0 ? 'good' : ''}`} onClick={() => onPick(cat)}>
                  {preview}
                </button>
              </td>
            )
          }
          return <td key={i} className="empty"></td>
        })}
      </tr>
      {after && (
        <tr className="bonus-row">
          <th>
            보너스 <small>({BONUS_THRESHOLD}↑ +{BONUS})</small>
          </th>
          {scores.map((s, i) => (
            <td key={i}>
              {bonusFor(s) ? `+${BONUS}` : <small className="muted">{upperTotal(s)}/{BONUS_THRESHOLD}</small>}
            </td>
          ))}
        </tr>
      )}
    </>
  )
}
