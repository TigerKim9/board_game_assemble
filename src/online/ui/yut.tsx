import { useEffect, useState } from 'react'
import { COLORS, TOKENS, YutBoard, YutSticks, useYutPick } from '../../games/yut/Board'
import { DONE, OFF, THROW_LABEL, type Move } from '../../games/yut/logic'
import '../../games/yut/yut.css'
import type { YutAction, YutView } from '../games/yut'
import { SeatBar } from './SeatBar'
import type { OnlineGameProps } from './types'

export default function OnlineYut({ view: s, seat, toAct, seats, act }: OnlineGameProps<YutView, YutAction>) {
  const g = s.g
  const myTurn = seat != null && toAct.includes(seat)
  const send = (m: Move) => act({ type: 'move', throwIndex: m.throwIndex, piece: m.piece })
  const pick = useYutPick(g, myTurn, send)
  const { selThrow, setSelThrow, setSelPiece, offMove, selectedMove } = pick

  // Selections only apply to the position they were made in.
  const [pickFor, setPickFor] = useState(s)
  if (pickFor !== s) {
    setPickFor(s)
    setSelPiece(null)
    setSelThrow(0)
  }

  // Short toss animation whenever a new throw arrives.
  const [tossing, setTossing] = useState(false)
  const [seenThrow, setSeenThrow] = useState(s.throwNo)
  if (seenThrow !== s.throwNo) {
    setSeenThrow(s.throwNo)
    if (s.throwNo > 0) setTossing(true)
  }
  useEffect(() => {
    if (!tossing) return
    const t = setTimeout(() => setTossing(false), 450)
    return () => clearTimeout(t)
  }, [tossing])

  const turnName = seats[g.turn]?.name ?? ''
  const status =
    g.winner != null
      ? `${TOKENS[g.winner]} ${seats[g.winner]?.name ?? ''} 승리!`
      : myTurn
        ? `${TOKENS[g.turn]} 내 차례${g.canThrow ? ' — 윷을 던지세요' : ''}`
        : seat == null
          ? `${TOKENS[g.turn]} ${turnName} 차례 (구경 중)`
          : `${TOKENS[g.turn]} ${turnName} 차례…`
  const waiting = seat != null ? g.pieces.filter((p) => p.owner === seat && p.pos === OFF).length : 0

  return (
    <div className="yut">
      <SeatBar
        seats={seats}
        active={g.winner != null ? [] : [g.turn]}
        you={seat}
        icons={TOKENS}
        extra={(i) => {
          const mine = g.pieces.filter((q) => q.owner === i)
          return (
            <small>
              {' '}
              {mine.filter((q) => q.pos === DONE).length}/{mine.length}
            </small>
          )
        }}
      />

      <YutBoard state={g} pick={pick} onMove={send} />

      <div className="yut-panel card-panel">
        <div className="status" style={{ color: COLORS[g.turn] }}>
          {status}
        </div>
        <YutSticks sticks={s.sticks} throwing={tossing} />
        <div className="yut-result">{tossing ? '휘익~' : s.lastThrow ? `${THROW_LABEL[s.lastThrow.t]}!` : ' '}</div>

        {g.pending.length > 0 && (
          <div className="yut-pending">
            {g.pending.map((t, i) => (
              <button
                key={i}
                className={`btn small ${i === selThrow ? 'primary' : ''}`}
                disabled={!myTurn}
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

        {myTurn && (
          <div className="btn-row">
            {g.canThrow && (
              <button className="btn accent big" disabled={tossing} onClick={() => act({ type: 'throw' })}>
                윷 던지기
              </button>
            )}
            {!g.canThrow && offMove && (
              <button className="btn primary" onClick={() => send(offMove)}>
                새 말 놓기 ({TOKENS[g.turn]} 대기 {waiting})
              </button>
            )}
          </div>
        )}
        {myTurn && !g.canThrow && g.pending.length > 0 && (
          <p className="muted yut-hint">
            {selectedMove ? '빛나는 칸을 누르거나 말을 한 번 더 누르면 이동해요' : '움직일 말을 고르세요'}
          </p>
        )}
        {myTurn && g.canThrow && g.pending.length > 0 && <p className="muted yut-hint">한 번 더 던지세요!</p>}

        {s.events.length > 0 && (
          <ul className="yut-log">
            {s.events
              .slice(-3)
              .reverse()
              .map((e, i) => (
                <li key={s.events.length - i} className={i === 0 ? '' : 'muted'}>
                  {TOKENS[e.seat]} {seats[e.seat]?.name ?? ''}: {e.text}
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  )
}
