import { useMemo, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { DuelActions, DuelBar } from './duel'
import { turnText, useDuel } from './useDuel'
import { aiMove, applyMove, colorOf, counts, initialState, legalMoves, winner, type OthelloState } from './logic'
import './othello.css'

interface Setup {
  players: PlayerConfig[]
  difficulty: Difficulty
}

export default function Othello() {
  const [setup, setSetup] = useState<Setup | null>(null)
  if (!setup) {
    return (
      <PlayerSetup
        gameId="othello"
        min={2}
        max={2}
        showDifficulty
        extra={<p className="othello-note muted">첫 번째 자리가 ⚫ 흑(먼저 둠)이에요. 버튼으로 사람/컴퓨터를 바꿔 순서를 정하세요.</p>}
        onStart={(players, difficulty) => setSetup({ players, difficulty })}
      />
    )
  }
  return <Game setup={setup} onSetup={() => setSetup(null)} />
}

const Disc = ({ c, size = 18 }: { c: 1 | 2; size?: number }) => (
  <span className={`othello-mini ${c === 1 ? 'black' : 'white'}`} style={{ width: size, height: size }} />
)

function Game({ setup, onSetup }: { setup: Setup; onSetup: () => void }) {
  const { players, difficulty } = setup
  const [hints, setHints] = useStored('othello:hints', true)
  const duel = useDuel<OthelloState, number>({
    players,
    initial: initialState,
    turnOf: (s) => s.turn,
    isOver: (s) => s.over,
    apply: applyMove,
    think: (s) => aiMove(s, difficulty),
    aiDelay: (s) => (s.passed != null ? 1100 : 500),
  })
  const { state: s, humanTurn, thinking, over } = duel
  const legal = useMemo(() => (over ? [] : legalMoves(s.board, colorOf(s.turn))), [s, over])
  const legalSet = useMemo(() => new Set(legal), [legal])
  const flippedSet = useMemo(() => new Set(s.flipped), [s])
  const [b, w] = counts(s.board)
  const win = over ? winner(s) : -1

  let status = turnText(duel.current, thinking, '차례예요 — 놓을 곳을 고르세요')
  if (s.passed != null && !over) {
    status = `${s.passed === 0 ? '흑' : '백'}은 둘 곳이 없어 쉬어요 — ${players[s.turn].name} 한 번 더!`
  }

  return (
    <>
      <DuelBar
        players={players}
        turn={s.turn}
        icons={[<Disc key="b" c={1} />, <Disc key="w" c={2} />]}
        scores={[b, w]}
        thinking={thinking}
        over={over}
      />
      <div className={`status othello-status ${s.passed != null && !over ? 'pass' : ''}`}>{over ? '게임 끝!' : status}</div>
      <div className="othello-board" role="grid" aria-label="오델로 판">
        {s.board.map((c, i) => {
          const can = humanTurn && legalSet.has(i)
          return (
            <button
              key={i}
              className={`othello-cell ${can ? 'can' : ''}`}
              disabled={!can}
              aria-label={`${(i >> 3) + 1}행 ${(i & 7) + 1}열`}
              onClick={() => can && duel.play(i)}
            >
              {c !== 0 && (
                <span
                  key={`${i}-${s.moveNo}-${c}`}
                  className={`othello-disc ${c === 1 ? 'black' : 'white'} ${flippedSet.has(i) ? 'flip' : ''} ${
                    s.last === i ? 'placed' : ''
                  }`}
                />
              )}
              {s.last === i && <span className="othello-last" />}
              {c === 0 && can && hints && <span className="othello-hint" />}
            </button>
          )
        })}
      </div>
      <DuelActions canUndo={duel.canUndo} onUndo={duel.undo} onRestart={duel.restart} onSetup={onSetup}>
        <button className={`btn small ${hints ? '' : 'ghost'}`} onClick={() => setHints(!hints)}>
          💡 힌트 {hints ? '켬' : '끔'}
        </button>
      </DuelActions>
      {over && (
        <Result
          title={win < 0 ? '무승부!' : `🏆 ${players[win].name} 승리!`}
          onAgain={duel.restart}
        >
          <p className="othello-final">
            <Disc c={1} size={22} /> {b} : {w} <Disc c={2} size={22} />
          </p>
          <button className="btn ghost" onClick={onSetup}>
            설정 바꾸기
          </button>
        </Result>
      )}
    </>
  )
}
