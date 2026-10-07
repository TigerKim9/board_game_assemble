import { useMemo, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { DuelActions, DuelBar } from '../othello/duel'
import { turnText, useDuel } from '../othello/useDuel'
import { SIZE, aiMove, applyMove, candidates, coord, initialState, isForbidden, stoneOf, winner, type GomokuState, type RuleSet } from './logic'
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

const STARS = [
  [3, 3],
  [3, 11],
  [7, 7],
  [11, 3],
  [11, 11],
]

function Game({ setup, onSetup }: { setup: Setup; onSetup: () => void }) {
  const { players, difficulty, rule } = setup
  const [preview, setPreview] = useState<number | null>(null)
  const [mouse, setMouse] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
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
  const color = stoneOf(s.turn)

  // Drop the preview whenever the position changes.
  const [previewFor, setPreviewFor] = useState(s)
  if (previewFor !== s) {
    setPreviewFor(s)
    setPreview(null)
  }

  const forbidden = useMemo(() => {
    if (rule !== 'renju' || !humanTurn || color !== 1) return []
    return candidates(s.board).filter((i) => isForbidden(s, i, 1))
  }, [s, rule, humanTurn, color])
  const forbiddenSet = new Set(forbidden)
  const winSet = new Set(s.winLine ?? [])

  const pointAt = (clientX: number, clientY: number): number | null => {
    const el = svgRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const c = Math.floor(((clientX - rect.left) / rect.width) * SIZE)
    const r = Math.floor(((clientY - rect.top) / rect.height) * SIZE)
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null
    return r * SIZE + c
  }
  const canPlace = (i: number) => humanTurn && s.board[i] === 0 && !forbiddenSet.has(i)

  const onTap = (e: React.MouseEvent) => {
    if (!humanTurn) return
    const i = pointAt(e.clientX, e.clientY)
    if (i == null || s.board[i] !== 0) return
    if (forbiddenSet.has(i)) {
      setPreview(i)
      return
    }
    // Mouse: one click places. Touch: first tap previews, second tap on the same point places.
    if (mouse || preview === i) duel.play(i)
    else setPreview(i)
  }

  let status = turnText(duel.current, thinking, '차례예요')
  if (humanTurn) {
    if (preview != null && forbiddenSet.has(preview)) status = '흑은 33(열린 삼 두 개)을 만들 수 없어요!'
    else if (preview != null) status = `${coord(preview)} — 한 번 더 누르면 놓여요`
    else status = `${duel.current!.name} 차례 — 놓을 곳을 누르세요`
  }

  const p = (i: number) => ({ x: (i % SIZE) + 0.5, y: Math.floor(i / SIZE) + 0.5 })

  return (
    <>
      <DuelBar
        players={players}
        turn={s.turn}
        icons={[<StoneIcon key="b" c={1} />, <StoneIcon key="w" c={2} />]}
        thinking={thinking}
        over={over}
      />
      <div className="status gomoku-status">{over ? '게임 끝!' : status}</div>
      <div className="gomoku-wrap">
        <svg
          ref={svgRef}
          className={`gomoku-board ${humanTurn ? 'live' : ''}`}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          onPointerDown={(e) => setMouse(e.pointerType === 'mouse')}
          onPointerMove={(e) => {
            if (e.pointerType !== 'mouse' || !humanTurn) return
            const i = pointAt(e.clientX, e.clientY)
            setPreview(i != null && s.board[i] === 0 ? i : null)
          }}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setPreview(null)}
          onClick={onTap}
          role="grid"
          aria-label="오목판"
        >
          <defs>
            <radialGradient id="gomoku-black" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#666" />
              <stop offset="60%" stopColor="#111" />
            </radialGradient>
            <radialGradient id="gomoku-white" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#fff" />
              <stop offset="75%" stopColor="#d6d2c6" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width={SIZE} height={SIZE} className="gomoku-wood" />
          {Array.from({ length: SIZE }, (_, k) => (
            <g key={k} className="gomoku-line">
              <line x1={0.5} y1={k + 0.5} x2={SIZE - 0.5} y2={k + 0.5} />
              <line x1={k + 0.5} y1={0.5} x2={k + 0.5} y2={SIZE - 0.5} />
            </g>
          ))}
          {STARS.map(([r, c]) => (
            <circle key={`${r}-${c}`} cx={c + 0.5} cy={r + 0.5} r={0.11} className="gomoku-star" />
          ))}
          {preview != null && canPlace(preview) && (
            <g className="gomoku-cross">
              <line x1={0.5} y1={p(preview).y} x2={SIZE - 0.5} y2={p(preview).y} />
              <line x1={p(preview).x} y1={0.5} x2={p(preview).x} y2={SIZE - 0.5} />
            </g>
          )}
          {s.board.map((c, i) =>
            c ? (
              <circle
                key={i}
                cx={p(i).x}
                cy={p(i).y}
                r={0.45}
                fill={c === 1 ? 'url(#gomoku-black)' : 'url(#gomoku-white)'}
                className={`gomoku-stone ${c === 1 ? 'black' : 'white'} ${s.last === i ? 'placed' : ''} ${
                  winSet.has(i) ? 'win' : ''
                }`}
              />
            ) : null,
          )}
          {forbidden.map((i) => (
            <text key={i} x={p(i).x} y={p(i).y + 0.17} className="gomoku-forbid">
              ✕
            </text>
          ))}
          {preview != null && canPlace(preview) && (
            <circle cx={p(preview).x} cy={p(preview).y} r={0.45} fill={color === 1 ? 'url(#gomoku-black)' : 'url(#gomoku-white)'} className="gomoku-ghost" />
          )}
          {s.last != null && !over && <circle cx={p(s.last).x} cy={p(s.last).y} r={0.13} className="gomoku-lastdot" />}
        </svg>
      </div>
      {humanTurn && preview != null && canPlace(preview) && !mouse && (
        <button className="btn primary gomoku-place" onClick={() => duel.play(preview)}>
          {coord(preview)}에 두기
        </button>
      )}
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
