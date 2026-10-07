import { useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { DuelActions, DuelBar } from '../othello/duel'
import { turnText, useDuel } from '../othello/useDuel'
import { CheckersBoard, Token, useCheckersPick } from './Board'
import { DRAW_PLIES, aiMove, applyMove, initialState, pieceCounts, type CheckersState, type Move } from './logic'
import './checkers.css'

interface Setup {
  players: PlayerConfig[]
  difficulty: Difficulty
}

export default function Checkers() {
  const [setup, setSetup] = useState<Setup | null>(null)
  if (!setup) {
    return (
      <PlayerSetup
        gameId="checkers"
        min={2}
        max={2}
        showDifficulty
        extra={<p className="checkers-note muted">첫 번째 자리가 검은 말(먼저 둠)이에요. 버튼으로 사람/컴퓨터를 바꿔 순서를 정하세요.</p>}
        onStart={(players, difficulty) => setSetup({ players, difficulty })}
      />
    )
  }
  return <Game setup={setup} onSetup={() => setSetup(null)} />
}

function Game({ setup, onSetup }: { setup: Setup; onSetup: () => void }) {
  const { players, difficulty } = setup
  // Seen from the human's side when only player 2 is human.
  const flip = players[0].isAI && !players[1].isAI
  const duel = useDuel<CheckersState, Move>({
    players,
    initial: initialState,
    turnOf: (s) => s.turn,
    isOver: (s) => s.over,
    apply: applyMove,
    think: (s) => aiMove(s, difficulty),
    aiDelay: 600,
  })
  const { state: s, humanTurn, thinking, over } = duel
  const pick = useCheckersPick(s, humanTurn, (m) => duel.play(m))
  const { path, mustCapture } = pick

  const [a, b] = pieceCounts(s.board)
  let status = turnText(duel.current, thinking, '차례예요')
  if (humanTurn) {
    if (path.length > 1) status = '계속 뛰어넘어야 해요! 다음 칸을 고르세요'
    else if (mustCapture) status = `${duel.current!.name}: 잡을 수 있는 말은 꼭 잡아야 해요!`
    else if (!path.length) status = `${duel.current!.name} 차례 — 움직일 말을 고르세요`
  }
  if (!over && s.quiet >= DRAW_PLIES - 20) status += ` (무승부까지 ${DRAW_PLIES - s.quiet}수)`

  return (
    <>
      <DuelBar
        players={players}
        turn={s.turn}
        icons={[<Token key="0" p={0} />, <Token key="1" p={1} />]}
        scores={[a, b]}
        thinking={thinking}
        over={over}
      />
      <div className={`status checkers-status ${mustCapture && humanTurn ? 'must' : ''}`}>{over ? '게임 끝!' : status}</div>
      <CheckersBoard state={s} live={humanTurn} flip={flip} pick={pick} />
      <DuelActions canUndo={duel.canUndo} onUndo={duel.undo} onRestart={duel.restart} onSetup={onSetup} />
      {over && (
        <Result
          title={s.winner === -1 ? '무승부!' : `🏆 ${players[s.winner!].name} 승리!`}
          onAgain={duel.restart}
        >
          <p className="muted">
            {s.winner === -1
              ? `서로 ${DRAW_PLIES / 2}수씩 잡기도 전진도 없어서 비겼어요.`
              : `${players[1 - s.winner!].name}에게 움직일 수 있는 말이 남지 않았어요.`}
          </p>
          <button className="btn ghost" onClick={onSetup}>
            설정 바꾸기
          </button>
        </Result>
      )}
    </>
  )
}
