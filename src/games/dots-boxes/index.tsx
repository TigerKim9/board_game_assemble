import { useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { DuelActions } from '../othello/duel'
import { turnText, useDuel } from '../othello/useDuel'
import { DotsBar, DotsBoard } from './Board'
import { aiMove, applyMove, initialState, scores, type DbState } from './logic'
import './dots-boxes.css'

interface Setup {
  players: PlayerConfig[]
  difficulty: Difficulty
  size: number
}

const SIZES = [3, 4, 5, 6]

export default function DotsBoxes() {
  const [setup, setSetup] = useState<Setup | null>(null)
  const [size, setSize] = useStored('dots-boxes:size', 4)
  if (!setup) {
    return (
      <PlayerSetup
        gameId="dots-boxes"
        min={2}
        max={4}
        defaultCount={2}
        showDifficulty
        extra={
          <div className="setup-row">
            <span>판 크기</span>
            <div className="segmented">
              {SIZES.map((n) => (
                <button key={n} className={size === n ? 'active' : ''} onClick={() => setSize(n)}>
                  {n}×{n}
                </button>
              ))}
            </div>
          </div>
        }
        onStart={(players, difficulty) => setSetup({ players, difficulty, size })}
      />
    )
  }
  return <Game setup={setup} onSetup={() => setSetup(null)} />
}

function Game({ setup, onSetup }: { setup: Setup; onSetup: () => void }) {
  const { players, difficulty, size: n } = setup
  const duel = useDuel<DbState, number>({
    players,
    initial: () => initialState(n, players.length),
    turnOf: (s) => s.turn,
    isOver: (s) => s.over,
    apply: applyMove,
    think: (s) => aiMove(s, difficulty),
    // Quicker while an AI is cashing in boxes.
    aiDelay: (s) => (s.lastBoxes.length ? 260 : 600),
  })
  const { state: s, humanTurn, thinking, over } = duel
  const sc = scores(s)

  const ranking = players.map((p, i) => ({ p, i, v: sc[i] })).sort((a, b) => b.v - a.v)
  const top = ranking[0].v
  const winners = ranking.filter((r) => r.v === top)

  let status = turnText(duel.current, thinking, '차례 — 선을 하나 그으세요')
  if (!over && s.lastBoxes.length && s.last != null && s.edges[s.last] === s.turn) {
    status = `${players[s.turn].name} 상자 완성! 한 번 더 그어요`
  }

  return (
    <>
      <DotsBar players={players} state={s} thinking={thinking} />
      <div className="status dots-boxes-status">{over ? '게임 끝!' : status}</div>
      <DotsBoard state={s} live={humanTurn} onPlay={(e) => duel.play(e)} />
      <DuelActions canUndo={duel.canUndo} onUndo={duel.undo} onRestart={duel.restart} onSetup={onSetup} />
      {over && (
        <Result
          title={winners.length > 1 ? `🤝 ${winners.map((w) => w.p.name).join(', ')} 공동 1등!` : `🏆 ${winners[0].p.name} 승리!`}
          onAgain={duel.restart}
        >
          <ol className="dots-boxes-ranking">
            {ranking.map(({ p, i, v }) => (
              <li key={i}>
                <span className="dots-boxes-swatch" style={{ '--c': `var(--p${i + 1})` } as React.CSSProperties}>
                  {i + 1}
                </span>{' '}
                {p.name} — <strong>{v}칸</strong>
              </li>
            ))}
          </ol>
          <button className="btn ghost" onClick={onSetup}>
            설정 바꾸기
          </button>
        </Result>
      )}
    </>
  )
}
