import { useEffect, useState } from 'react'
import { Die } from '../../components/Die'
import { LABELS, total } from '../../games/yacht/logic'
import { YachtScoreboard } from '../../games/yacht/Scoreboard'
import '../../games/yacht/yacht.css'
import type { YachtAction, YachtView } from '../games/yacht'
import { SeatBar } from './SeatBar'
import type { OnlineGameProps } from './types'

/** True for a moment whenever `key` changes (short roll animation). */
function useFlash(key: unknown, ms = 450) {
  const [on, setOn] = useState(false)
  const [seen, setSeen] = useState(key)
  if (seen !== key) {
    setSeen(key)
    setOn(true)
  }
  useEffect(() => {
    if (!on) return
    const t = setTimeout(() => setOn(false), ms)
    return () => clearTimeout(t)
  }, [on, key, ms])
  return on
}

export default function OnlineYacht({ view: s, seat, toAct, seats, result, act }: OnlineGameProps<YachtView, YachtAction>) {
  const myTurn = seat != null && toAct.includes(seat)
  const hasRolled = s.rollsLeft < 3
  const rolling = useFlash(s.rollNo)
  // My own hold selection, reset to the server's whenever the dice change or the turn passes.
  const [held, setHeld] = useState(s.held)
  const [heldFor, setHeldFor] = useState(`${s.rollNo}-${s.turn}`)
  if (heldFor !== `${s.rollNo}-${s.turn}`) {
    setHeldFor(`${s.rollNo}-${s.turn}`)
    setHeld(s.held)
  }
  const shownHeld = myTurn ? held : s.held
  const turnName = seats[s.turn]?.name ?? ''
  const last = s.last

  return (
    <>
      <SeatBar
        seats={seats}
        active={result ? [] : [s.turn]}
        you={seat}
        extra={(i) => <small> · {total(s.scores[i])}</small>}
      />
      <div className="yacht-table felt">
        <div className="status">
          {result ? '게임 끝!' : myTurn ? '내 차례' : `${turnName} 차례${seat == null ? ' (구경 중)' : '…'}`}
        </div>
        {last && (
          <div className="hint">
            {seats[last.seat]?.name}: {LABELS[last.cat]} {last.value}점
          </div>
        )}
        <div className="dice-row">
          {s.dice.map((d, i) => (
            <Die
              key={i}
              value={d}
              held={shownHeld[i] && hasRolled}
              rolling={rolling && !s.held[i]}
              size={58}
              disabled={!myTurn || !hasRolled || s.rollsLeft === 0 || rolling}
              onClick={() => setHeld((h) => h.map((x, j) => (j === i ? !x : x)))}
            />
          ))}
        </div>
        {myTurn ? (
          <button
            className="btn accent big"
            disabled={s.rollsLeft === 0 || rolling || (hasRolled && held.every(Boolean))}
            onClick={() => act({ type: 'roll', held: hasRolled ? held : undefined })}
          >
            {s.rollsLeft === 0 ? '점수를 고르세요' : `굴리기 (${s.rollsLeft}회 남음)`}
          </button>
        ) : (
          !result && <p className="hint">남은 굴리기 {s.rollsLeft}회</p>
        )}
        {myTurn && hasRolled && s.rollsLeft > 0 && <p className="hint">주사위를 눌러 고정하거나, 아래 점수판에서 칸을 고르세요</p>}
      </div>
      <YachtScoreboard
        names={seats.map((p) => `${p.bot ? '🤖 ' : ''}${p.name}${p.seat === seat ? ' (나)' : ''}`)}
        scores={s.scores}
        turn={result ? null : s.turn}
        dice={s.dice}
        canPick={myTurn && hasRolled && !rolling}
        onPick={(cat) => act({ type: 'score', cat })}
      />
    </>
  )
}
