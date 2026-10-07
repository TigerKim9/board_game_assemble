import { useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { DuelActions, DuelBar } from '../othello/duel'
import { turnText, useDuel } from '../othello/useDuel'
import { COLS, aiMove, applyMove, dropRow, initialState, winner, type C4State } from './logic'
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

const Chip = ({ p, size = 18 }: { p: number; size?: number }) => (
  <span className={`connect4-mini p${p}`} style={{ width: size, height: size }} />
)

function Game({ setup, onSetup }: { setup: Setup; onSetup: () => void }) {
  const { players, difficulty } = setup
  const [hover, setHover] = useState<number | null>(null)
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
  const winSet = new Set(s.winLine ?? [])
  const lastRow = s.last != null ? Math.floor(s.last / COLS) : 0

  const drop = (col: number) => {
    if (!humanTurn || dropRow(s.board, col) < 0) return
    duel.play(col)
  }

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
      <div className="connect4-wrap" onPointerLeave={() => setHover(null)}>
        <div className="connect4-preview" aria-hidden>
          {Array.from({ length: COLS }, (_, c) => (
            <span key={c} className="connect4-slot">
              {humanTurn && hover === c && dropRow(s.board, c) >= 0 && <Chip p={s.turn} size={0} />}
            </span>
          ))}
        </div>
        <div className="connect4-board" role="grid" aria-label="사목 판">
          {s.board.map((cell, i) => {
            const col = i % COLS
            const isLast = s.last === i
            return (
              <button
                key={i}
                className={`connect4-cell ${humanTurn && dropRow(s.board, col) >= 0 ? 'can' : ''} ${
                  hover === col && humanTurn ? 'hover' : ''
                }`}
                aria-label={`${col + 1}번째 줄`}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(col)}
                onClick={() => drop(col)}
              >
                {cell !== 0 && (
                  <span
                    key={isLast ? `d${s.moveNo}` : 'd'}
                    className={`connect4-disc p${cell - 1} ${isLast ? 'drop' : ''} ${winSet.has(i) ? 'win' : ''}`}
                    style={isLast ? ({ '--r': lastRow + 1 } as React.CSSProperties) : undefined}
                  />
                )}
                {isLast && !over && <span className="connect4-lastmark" />}
              </button>
            )
          })}
        </div>
      </div>
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
