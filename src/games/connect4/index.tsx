import { useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { DuelActions, DuelBar } from '../othello/duel'
import { turnText, useDuel } from '../othello/useDuel'
import { Chip, Connect4Board } from './Board'
import { aiMove, applyMove, initialState, winner, type C4State } from './logic'
import './connect4.css'

interface Setup {
  players: PlayerConfig[]
  difficulty: Difficulty
}

export default function Connect4() {
  const [setup, setSetup] = useState<Setup | null>(null)
  if (!setup) {
    return (
      <PlayerSetup
        gameId="connect4"
        min={2}
        max={2}
        showDifficulty
        extra={<p className="connect4-note muted">첫 번째 자리가 🔴 빨강(먼저 둠)이에요. 버튼으로 사람/컴퓨터를 바꿔 순서를 정하세요.</p>}
        onStart={(players, difficulty) => setSetup({ players, difficulty })}
      />
    )
  }
  return <Game setup={setup} onSetup={() => setSetup(null)} />
}

function Game({ setup, onSetup }: { setup: Setup; onSetup: () => void }) {
  const { players, difficulty } = setup
  const duel = useDuel<C4State, number>({
    players,
    initial: initialState,
    turnOf: (s) => s.turn,
    isOver: (s) => s.over,
    apply: applyMove,
    think: (s) => aiMove(s, difficulty),
    aiDelay: 550,
  })
  const { state: s, humanTurn, thinking, over } = duel
  const win = winner(s)

  return (
    <>
      <DuelBar
        players={players}
        turn={s.turn}
        icons={[<Chip key="0" p={0} />, <Chip key="1" p={1} />]}
        thinking={thinking}
        over={over}
      />
      <div className="status">{over ? '게임 끝!' : turnText(duel.current, thinking, '차례 — 떨어뜨릴 줄을 누르세요')}</div>
      <Connect4Board state={s} live={humanTurn} onDrop={(col) => duel.play(col)} />
      <DuelActions canUndo={duel.canUndo} onUndo={duel.undo} onRestart={duel.restart} onSetup={onSetup} />
      {over && (
        <Result title={win != null && win >= 0 ? `🏆 ${players[win].name} 승리!` : '무승부! 판이 가득 찼어요'} onAgain={duel.restart}>
          {win != null && win >= 0 && <p className="muted">네 개를 한 줄로 이었어요!</p>}
          <button className="btn ghost" onClick={onSetup}>
            설정 바꾸기
          </button>
        </Result>
      )}
    </>
  )
}
