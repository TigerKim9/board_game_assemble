import { useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { DuelActions } from '../othello/duel'
import { turnText, useDuel } from '../othello/useDuel'
import { aiMove, applyMove, edgeCoords, geo, initialState, scores, type DbState } from './logic'
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

const PAD = 0.35

function Game({ setup, onSetup }: { setup: Setup; onSetup: () => void }) {
  const { players, difficulty, size: n } = setup
  const [hover, setHover] = useState<number | null>(null)
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
  const { E, H } = geo(n)
  const view = n + PAD * 2

  const ranking = players.map((p, i) => ({ p, i, v: sc[i] })).sort((a, b) => b.v - a.v)
  const top = ranking[0].v
  const winners = ranking.filter((r) => r.v === top)

  let status = turnText(duel.current, thinking, '차례 — 선을 하나 그으세요')
  if (!over && s.lastBoxes.length && s.last != null && s.edges[s.last] === s.turn) {
    status = `${players[s.turn].name} 상자 완성! 한 번 더 그어요`
  }

  // Diamond hit areas tile the board so every tap maps to the nearest edge.
  const hitShape = (e: number) => {
    const [x1, y1, x2, y2] = edgeCoords(n, e)
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    const pts =
      e < H
        ? [[x1, y1], [mx, my - 0.5], [x2, y2], [mx, my + 0.5]]
        : [[x1, y1], [mx + 0.5, my], [x2, y2], [mx - 0.5, my]]
    return pts.map(([x, y]) => `${x + PAD},${y + PAD}`).join(' ')
  }

  return (
    <>
      <div className="dots-boxes-bar">
        {players.map((p, i) => (
          <div key={i} className={`dots-boxes-chip ${i === s.turn && !over ? 'active' : ''}`} style={{ '--c': `var(--p${i + 1})` } as React.CSSProperties}>
            <span className="dots-boxes-swatch">{i + 1}</span>
            <span className="dots-boxes-name">
              {p.isAI ? '🤖 ' : ''}
              {p.name}
            </span>
            <strong>{sc[i]}</strong>
            {p.isAI && <span className={`othello-duel-dots ${i === s.turn && thinking ? 'on' : ''}`} aria-hidden />}
          </div>
        ))}
      </div>
      <div className="status dots-boxes-status">{over ? '게임 끝!' : status}</div>
      <div className="dots-boxes-wrap">
        <svg
          className={`dots-boxes-board ${humanTurn ? 'live' : ''}`}
          viewBox={`0 0 ${view} ${view}`}
          onPointerLeave={() => setHover(null)}
          role="grid"
          aria-label="도트 앤 박스 판"
        >
          {s.boxes.map((o, b) => {
            const r = Math.floor(b / n)
            const c = b % n
            if (o < 0) return null
            return (
              <g key={b} className={`dots-boxes-box ${s.lastBoxes.includes(b) ? 'new' : ''}`}>
                <rect x={c + PAD + 0.04} y={r + PAD + 0.04} width={0.92} height={0.92} rx={0.08} style={{ fill: `var(--p${o + 1})` }} />
                <text x={c + PAD + 0.5} y={r + PAD + 0.62}>
                  {o + 1}
                </text>
              </g>
            )
          })}
          {Array.from({ length: E }, (_, e) => {
            const [x1, y1, x2, y2] = edgeCoords(n, e)
            const owner = s.edges[e]
            const drawn = owner >= 0
            return (
              <line
                key={e}
                x1={x1 + PAD}
                y1={y1 + PAD}
                x2={x2 + PAD}
                y2={y2 + PAD}
                className={`dots-boxes-edge ${drawn ? 'drawn' : ''} ${s.last === e ? 'last' : ''} ${
                  !drawn && hover === e && humanTurn ? 'hover' : ''
                }`}
                style={drawn ? { stroke: `var(--p${owner + 1})` } : undefined}
              />
            )
          })}
          {Array.from({ length: (n + 1) * (n + 1) }, (_, k) => (
            <circle key={k} cx={(k % (n + 1)) + PAD} cy={Math.floor(k / (n + 1)) + PAD} r={0.09} className="dots-boxes-dot" />
          ))}
          {humanTurn &&
            Array.from({ length: E }, (_, e) =>
              s.edges[e] < 0 ? (
                <polygon
                  key={e}
                  points={hitShape(e)}
                  className="dots-boxes-hit"
                  onPointerEnter={(ev) => ev.pointerType === 'mouse' && setHover(e)}
                  onClick={() => duel.play(e)}
                />
              ) : null,
            )}
        </svg>
      </div>
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
