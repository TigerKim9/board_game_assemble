import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { sleep } from '../../lib/random'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { COLORS, TOKENS, YutBoard, YutSticks, useYutPick } from './Board'
import {
  DONE,
  OFF,
  THROW_LABEL,
  addThrow,
  applyMove,
  chooseMove,
  newGame,
  throwSticks,
  type GameState,
  type Move,
  type ThrowName,
} from './logic'
import './yut.css'

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
  const human = !current.isAI
  const pick = useYutPick(state, human, (m) => doMove(m))
  const { selThrow, setSelThrow, setSelPiece, offMove, selectedMove } = pick
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

      <YutBoard state={state} pick={pick} onMove={doMove} />

      <div className="yut-panel card-panel">
        <div className="status" style={{ color: COLORS[state.turn] }}>
          {current.isAI ? `🤖 ${current.name} 차례…` : `${TOKENS[state.turn]} ${current.name} 차례`}
        </div>
        <YutSticks sticks={sticks} throwing={throwing} />
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
