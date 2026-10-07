import { useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { DuelActions, DuelBar } from '../othello/duel'
import { turnText, useDuel } from '../othello/useDuel'
import { GomokuBoard } from './Board'
import { aiMove, applyMove, initialState, winner, type GomokuState, type RuleSet } from './logic'
import './gomoku.css'

interface Setup {
  players: PlayerConfig[]
  difficulty: Difficulty
  rule: RuleSet
}

export default function Gomoku() {
  const [setup, setSetup] = useState<Setup | null>(null)
  const [rule, setRule] = useStored<RuleSet>('gomoku:rule', 'free')
  if (!setup) {
    return (
      <PlayerSetup
        gameId="gomoku"
        min={2}
        max={2}
        showDifficulty
        extra={
          <>
            <div className="setup-row">
              <span>규칙</span>
              <div className="segmented">
                <button className={rule === 'free' ? 'active' : ''} onClick={() => setRule('free')}>
                  자유룰
                </button>
                <button className={rule === 'renju' ? 'active' : ''} onClick={() => setRule('renju')}>
                  흑 33 금지
                </button>
              </div>
            </div>
            <p className="gomoku-note muted">첫 번째 자리가 ⚫ 흑(먼저 둠)이에요. 버튼으로 사람/컴퓨터를 바꿔 순서를 정하세요.</p>
          </>
        }
        onStart={(players, difficulty) => setSetup({ players, difficulty, rule })}
      />
    )
  }
  return <Game setup={setup} onSetup={() => setSetup(null)} />
}

const StoneIcon = ({ c, size = 18 }: { c: 1 | 2; size?: number }) => (
  <span className={`gomoku-mini ${c === 1 ? 'black' : 'white'}`} style={{ width: size, height: size }} />
)

function Game({ setup, onSetup }: { setup: Setup; onSetup: () => void }) {
  const { players, difficulty, rule } = setup
  const duel = useDuel<GomokuState, number>({
    players,
    initial: () => initialState(rule),
    turnOf: (s) => s.turn,
    isOver: (s) => s.over,
    apply: applyMove,
    think: (s) => aiMove(s, difficulty),
    aiDelay: 400,
  })
  const { state: s, humanTurn, thinking, over } = duel
  const w = winner(s)

  return (
    <>
      <DuelBar
        players={players}
        turn={s.turn}
        icons={[<StoneIcon key="b" c={1} />, <StoneIcon key="w" c={2} />]}
        thinking={thinking}
        over={over}
      />
      <GomokuBoard
        state={s}
        live={humanTurn}
        onPlay={duel.play}
        idleText={`${duel.current?.name} 차례 — 놓을 곳을 누르세요`}
        status={turnText(duel.current, thinking, '차례예요')}
      />
      <DuelActions canUndo={duel.canUndo} onUndo={duel.undo} onRestart={duel.restart} onSetup={onSetup}>
        <span className="gomoku-count muted">{s.moveNo}수</span>
      </DuelActions>
      {over && (
        <Result title={w != null && w >= 0 ? `🏆 ${players[w].name} 승리!` : '무승부! 판이 가득 찼어요'} onAgain={duel.restart}>
          {w != null && w >= 0 && <p className="muted">{s.moveNo}수 만에 다섯 개를 이었어요.</p>}
          <button className="btn ghost" onClick={onSetup}>
            설정 바꾸기
          </button>
        </Result>
      )}
    </>
  )
}
