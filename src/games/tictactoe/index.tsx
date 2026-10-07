import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { DuelActions, DuelBar } from '../othello/duel'
import { turnText, useDuel } from '../othello/useDuel'
import { Mark, TttBoard } from './Board'
import { aiMove, applyMove, initialState, winner, type TttState } from './logic'
import './tictactoe.css'

interface Setup {
  players: PlayerConfig[]
  difficulty: Difficulty
}

export default function TicTacToe() {
  const [setup, setSetup] = useState<Setup | null>(null)
  // Series tally: wins of player 0, player 1, draws.
  const [tally, setTally] = useState<[number, number, number]>([0, 0, 0])
  const [round, setRound] = useState(0)
  if (!setup) {
    return (
      <PlayerSetup
        gameId="tictactoe"
        min={2}
        max={2}
        showDifficulty
        extra={<p className="tictactoe-note muted">판마다 먼저 두는 사람이 번갈아 바뀌어요.</p>}
        onStart={(players, difficulty) => {
          setTally([0, 0, 0])
          setRound(0)
          setSetup({ players, difficulty })
        }}
      />
    )
  }
  return (
    <Game
      key={round}
      setup={setup}
      first={(round % 2) as 0 | 1}
      tally={tally}
      onEnd={(w) => setTally((t) => t.map((v, i) => (i === (w < 0 ? 2 : w) ? v + 1 : v)) as [number, number, number])}
      onNext={() => setRound((r) => r + 1)}
      onSetup={() => setSetup(null)}
    />
  )
}

function Game({
  setup,
  first,
  tally,
  onEnd,
  onNext,
  onSetup,
}: {
  setup: Setup
  first: 0 | 1
  tally: [number, number, number]
  onEnd: (winner: number) => void
  onNext: () => void
  onSetup: () => void
}) {
  const { players, difficulty } = setup
  const counted = useRef(false)
  const duel = useDuel<TttState, number>({
    players,
    initial: () => initialState(first),
    turnOf: (s) => s.turn,
    isOver: (s) => s.over,
    apply: applyMove,
    think: (s) => aiMove(s, difficulty),
    aiDelay: 500,
  })
  const { state: s, humanTurn, thinking, over } = duel
  const w = winner(s)
  // Count each finished game once.
  useEffect(() => {
    if (over && w != null && !counted.current) {
      counted.current = true
      onEnd(w)
    }
  }, [over]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <DuelBar
        players={players}
        turn={s.turn}
        icons={[<Mark key="o" p={0} />, <Mark key="x" p={1} />]}
        scores={[tally[0], tally[1]]}
        thinking={thinking}
        over={over}
      />
      <div className="status">
        {over ? (w! >= 0 ? `${players[w!].name} 승리!` : '비겼어요!') : turnText(duel.current, thinking)}
      </div>
      <TttBoard state={s} live={humanTurn} onPlay={(i) => duel.play(i)} />
      <p className="tictactoe-tally muted">
        전적 — {players[0].name} {tally[0]}승 · {players[1].name} {tally[1]}승 · 무승부 {tally[2]}
      </p>
      {!over && (
        <DuelActions
          canUndo={duel.canUndo}
          onUndo={duel.undo}
          onRestart={duel.restart}
          onSetup={onSetup}
        />
      )}
      {over && (
        <Result
          title={w! >= 0 ? `🏆 ${players[w!].name} 승리!` : '🤝 무승부!'}
          onAgain={onNext}
          againLabel="다음 판"
        >
          <p className="muted">다음 판은 {players[1 - first].name}님이 먼저 둬요.</p>
          <button className="btn ghost" onClick={onSetup}>
            설정 바꾸기
          </button>
        </Result>
      )}
    </>
  )
}
