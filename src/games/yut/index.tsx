import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { sleep } from '../../lib/random'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  DONE,
  OFF,
  THROW_LABEL,
  addThrow,
  applyMove,
  chooseMove,
  legalMoves,
  newGame,
  stackOf,
  throwSticks,
  type GameState,
  type Move,
  type ThrowName,
} from './logic'
import './yut.css'

const COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)']
const TOKENS = ['🐯', '🐰', '🐻', '🐶']

// Node coordinates on a 100×100 board.
const NODE_XY: Record<number, [number, number]> = (() => {
  const xy: Record<number, [number, number]> = {}
  const step = 16
  xy[0] = [90, 90]
  for (let k = 1; k <= 4; k++) xy[k] = [90, 90 - step * k]
  xy[5] = [90, 10]
  for (let k = 1; k <= 4; k++) xy[5 + k] = [90 - step * k, 10]
  xy[10] = [10, 10]
  for (let k = 1; k <= 4; k++) xy[10 + k] = [10, 10 + step * k]
  xy[15] = [10, 90]
  for (let k = 1; k <= 4; k++) xy[15 + k] = [10 + step * k, 90]
  const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ]
  xy[20] = lerp([90, 10], [50, 50], 1 / 3)
  xy[21] = lerp([90, 10], [50, 50], 2 / 3)
  xy[22] = [50, 50]
  xy[23] = lerp([50, 50], [10, 90], 1 / 3)
  xy[24] = lerp([50, 50], [10, 90], 2 / 3)
  xy[25] = lerp([10, 10], [50, 50], 1 / 3)
  xy[26] = lerp([10, 10], [50, 50], 2 / 3)
  xy[27] = lerp([50, 50], [90, 90], 1 / 3)
  xy[28] = lerp([50, 50], [90, 90], 2 / 3)
  return xy
})()
const BIG_NODES = new Set([0, 5, 10, 15, 22])

interface Session {
  players: PlayerConfig[]
  difficulty: Difficulty
  pieces: number
  backdo: boolean
}

export default function Yut() {
  const [session, setSession] = useState<Session | null>(null)
  const [pieces, setPieces] = useStored('yut:pieces', 4)
  const [backdo, setBackdo] = useStored('yut:backdo', true)
  if (!session) {
    return (
      <PlayerSetup
        gameId="yut"
        min={2}
        max={4}
        showDifficulty
        extra={
          <>
            <div className="setup-row">
              <span>말 개수</span>
              <div className="segmented">
                {[2, 3, 4].map((n) => (
                  <button key={n} className={pieces === n ? 'active' : ''} onClick={() => setPieces(n)}>
                    {n}개
                  </button>
                ))}
              </div>
            </div>
            <label className="setup-row">
              <span>빽도 사용</span>
              <input type="checkbox" checked={backdo} onChange={(e) => setBackdo(e.target.checked)} />
            </label>
          </>
        }
        onStart={(players, difficulty) => setSession({ players, difficulty, pieces, backdo })}
      />
    )
  }
  return <Game key={JSON.stringify(session)} session={session} onReset={() => setSession(null)} />
}

function Game({ session, onReset }: { session: Session; onReset: () => void }) {
  const { players, difficulty } = session
  const [state, setState] = useState<GameState>(() =>
    newGame(players.length, { piecesPerPlayer: session.pieces, backdo: session.backdo }),
  )
  const [sticks, setSticks] = useState<boolean[]>([true, false, true, false])
  const [throwing, setThrowing] = useState(false)
  const [lastThrow, setLastThrow] = useState<{ t: ThrowName; who: number } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selThrow, setSelThrow] = useState(0)
  const [selPiece, setSelPiece] = useState<number | null>(null)
  const [round, setRound] = useState(0)
  const stateRef = useRef(state)
  stateRef.current = state
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const current = players[state.turn]
  const moves = legalMoves(state)
  const busy = throwing

  const doThrow = async () => {
    setThrowing(true)
    setSelPiece(null)
    await sleep(600)
    if (!alive.current) return
    const { result, sticks: s } = throwSticks(Math.random, session.backdo)
    setSticks(s)
    const before = stateRef.current
    const next = addThrow(before, result)
    setLastThrow({ t: result, who: before.turn })
    setNotice(next.turn !== before.turn ? `${players[before.turn].name}: ${THROW_LABEL[result]} — 움직일 말이 없어 차례가 넘어갔어요` : null)
    setThrowing(false)
    setState(next)
    setSelThrow(0)
  }

  const doMove = (m: Move) => {
    setState((st) => applyMove(st, m).state)
    setSelPiece(null)
    setSelThrow(0)
  }

  // Track turn changes to restart the AI loop.
  const prevTurn = useRef(state.turn)
  useEffect(() => {
    if (prevTurn.current !== state.turn) {
      prevTurn.current = state.turn
      setRound((r) => r + 1)
    }
  }, [state.turn])

  // AI loop: one action per effect run.
  useEffect(() => {
    if (state.winner != null || !current.isAI || throwing) return
    let cancelled = false
    ;(async () => {
      await sleep(700)
      if (cancelled || !alive.current) return
      const st = stateRef.current
      if (st.canThrow) {
        await doThrow()
      } else {
        const m = chooseMove(st, difficulty)
        if (m) {
          setSelPiece(m.piece)
          await sleep(350)
          if (cancelled || !alive.current) return
          doMove(m)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [state, round, throwing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (state.winner != null) {
    return (
      <Result title={`🏆 ${players[state.winner].name} 승리!`} onAgain={() => onReset()} againLabel="새 게임">
        <p>
          {TOKENS[state.winner]} 말을 모두 내보냈어요!
        </p>
      </Result>
    )
  }

  const human = !current.isAI
  const activeThrow = state.pending[selThrow] ?? state.pending[0]
  const movesForThrow = moves.filter((m) => state.pending[m.throwIndex] === activeThrow)
  const movableIdx = new Set(
    human ? movesForThrow.flatMap((m) => stackOf(state, m.piece)) : [],
  )
  const offMove = movesForThrow.find((m) => state.pieces[m.piece].pos === OFF)
  const selectedMove =
    selPiece != null ? movesForThrow.find((m) => stackOf(state, m.piece).includes(selPiece)) : undefined

  const clickPiece = (i: number) => {
    if (!human || !movableIdx.has(i)) return
    const m = movesForThrow.find((mm) => stackOf(state, mm.piece).includes(i))
    if (!m) return
    if (selPiece != null && stackOf(state, m.piece).includes(selPiece)) doMove(m)
    else setSelPiece(i)
  }

  // Group pieces by node for rendering.
  const byNode = new Map<number, number[]>()
  state.pieces.forEach((p, i) => {
    if (p.pos === OFF || p.pos === DONE) return
    byNode.set(p.pos, [...(byNode.get(p.pos) ?? []), i])
  })

  return (
    <div className="yut">
      <div className="players-bar">
        {players.map((p, i) => {
          const mine = state.pieces.filter((q) => q.owner === i)
          return (
            <span
              key={i}
              className={`player-chip ${i === state.turn ? 'active' : ''}`}
              style={{ borderColor: i === state.turn ? COLORS[i] : undefined }}
            >
              {TOKENS[i]} {p.name} <small>{mine.filter((q) => q.pos === DONE).length}/{mine.length}</small>
            </span>
          )
        })}
      </div>

      <svg className="yut-board" viewBox="0 0 100 100">
        <rect x="2" y="2" width="96" height="96" rx="6" className="yut-bg" />
        <path d="M10 10 H90 V90 H10 Z M10 10 L90 90 M90 10 L10 90" className="yut-lines" />
        {Object.entries(NODE_XY).map(([id, [x, y]]) => {
          const n = Number(id)
          const target = selectedMove?.to === n
          return (
            <g key={id}>
              <circle
                cx={x}
                cy={y}
                r={BIG_NODES.has(n) ? 5.2 : 3.6}
                className={`yut-node ${BIG_NODES.has(n) ? 'big' : ''} ${target ? 'target' : ''}`}
                onClick={() => target && selectedMove && doMove(selectedMove)}
              />
              {n === 0 && (
                <text x={x - 9} y={y + 1} className="yut-label">
                  출발
                </text>
              )}
            </g>
          )
        })}
        {selectedMove?.to === DONE && (
          <g onClick={() => doMove(selectedMove)} className="yut-finish">
            <rect x="72" y="93" width="26" height="6" rx="3" />
            <text x="85" y="97.4">
              나가기 ▶
            </text>
          </g>
        )}
        {[...byNode.entries()].map(([node, idxs]) => {
          const [x, y] = NODE_XY[node]
          const owner = state.pieces[idxs[0]].owner
          const can = idxs.some((i) => movableIdx.has(i))
          const sel = selPiece != null && idxs.includes(selPiece)
          return (
            <g
              key={node}
              className={`yut-piece ${can ? 'movable' : ''} ${sel ? 'selected' : ''}`}
              onClick={() => clickPiece(idxs[0])}
              transform={`translate(${x} ${y})`}
            >
              <circle r="4.6" fill={COLORS[owner]} />
              <text y="1.6" className="yut-token">
                {TOKENS[owner]}
              </text>
              {idxs.length > 1 && (
                <g transform="translate(3.6 -3.6)">
                  <circle r="2.4" className="yut-badge" />
                  <text y="0.9" className="yut-badge-text">
                    {idxs.length}
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </svg>

      <div className="yut-panel card-panel">
        <div className="status" style={{ color: COLORS[state.turn] }}>
          {current.isAI ? `🤖 ${current.name} 차례…` : `${TOKENS[state.turn]} ${current.name} 차례`}
        </div>
        <div className={`yut-sticks ${throwing ? 'throwing' : ''}`}>
          {sticks.map((flat, i) => (
            <span key={i} className={`yut-stick ${flat ? 'flat' : 'round'} ${i === 0 ? 'marked' : ''}`} />
          ))}
        </div>
        {notice && !throwing && <p className="muted yut-hint">{notice}</p>}
        <div className="yut-result">{throwing ? '휘익~' : lastThrow ? `${THROW_LABEL[lastThrow.t]}!` : ' '}</div>

        {state.pending.length > 0 && (
          <div className="yut-pending">
            {state.pending.map((t, i) => (
              <button
                key={i}
                className={`btn small ${i === selThrow ? 'primary' : ''}`}
                disabled={!human}
                onClick={() => {
                  setSelThrow(i)
                  setSelPiece(null)
                }}
              >
                {THROW_LABEL[t]}
              </button>
            ))}
          </div>
        )}

        {human && (
          <div className="btn-row">
            {state.canThrow && (
              <button className="btn accent big" disabled={busy} onClick={doThrow}>
                윷 던지기
              </button>
            )}
            {!state.canThrow && offMove && (
              <button className="btn primary" onClick={() => doMove(offMove)}>
                새 말 놓기 ({TOKENS[state.turn]} 대기 {state.pieces.filter((p) => p.owner === state.turn && p.pos === OFF).length})
              </button>
            )}
          </div>
        )}
        {human && !state.canThrow && state.pending.length > 0 && (
          <p className="muted yut-hint">
            {selectedMove ? '빛나는 칸을 누르거나 말을 한 번 더 누르면 이동해요' : '움직일 말을 고르세요'}
          </p>
        )}
        {human && state.canThrow && state.pending.length > 0 && <p className="muted yut-hint">한 번 더 던지세요!</p>}
      </div>
    </div>
  )
}
