import { useEffect, useState } from 'react'
import { Die } from '../../components/Die'
import { scoreSelection } from '../../games/farkle/logic'
import { FarkleKept, FarklePlayers, FarkleRef } from '../../games/farkle/parts'
import '../../games/farkle/farkle.css'
import type { FarkleAction, FarkleEvent, FarkleView } from '../games/farkle'
import type { OnlineGameProps } from './types'

function useFlash(key: unknown, ms = 500) {
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

function EventLine({ e, names, target }: { e: FarkleEvent; names: string[]; target: number }) {
  const who = names[e.seat] ?? ''
  switch (e.kind) {
    case 'farkle':
      return (
        <div className="farkle-log">
          {who}: 파클! {e.lost > 0 ? `${e.lost.toLocaleString()}점을 잃었어요` : '점수가 되는 주사위가 없어요'}
          <div className="farkle-kept-dice">
            {e.dice.map((d, i) => (
              <Die key={i} value={d} size={24} />
            ))}
          </div>
        </div>
      )
    case 'bank':
      return <div className="farkle-log">{who}: {e.gained.toLocaleString()}점 저장!</div>
    case 'final':
      return <div className="farkle-log">🏁 {who}님이 {target.toLocaleString()}점 달성! 나머지는 마지막 차례예요</div>
    case 'hot':
      return <div className="farkle-log">🔥 핫 다이스! 주사위 6개를 다시 굴려요</div>
  }
}

export default function OnlineFarkle({ view: s, seat, toAct, seats, result, act }: OnlineGameProps<FarkleView, FarkleAction>) {
  const myTurn = seat != null && toAct.includes(seat)
  const names = seats.map((p) => p.name)
  const rolling = useFlash(s.rollNo)
  const [sel, setSel] = useState<boolean[]>([])
  const [selFor, setSelFor] = useState(s.rollNo)
  if (selFor !== s.rollNo) {
    setSelFor(s.rollNo)
    setSel([])
  }
  const idx = s.dice.flatMap((_, i) => (sel[i] ? [i] : []))
  const selScore = idx.length ? scoreSelection(idx.map((i) => s.dice[i])) : null
  const anySel = idx.length > 0
  const canAct = myTurn && s.phase === 'choose' && selScore != null && !rolling
  const left = s.dice.length - idx.length
  const turnName = names[s.turn] ?? ''

  let hint = ''
  if (myTurn && s.phase === 'choose') {
    if (!anySel) hint = '점수가 되는 주사위를 눌러 골라 주세요'
    else if (selScore == null) hint = '점수가 안 되는 주사위가 섞여 있어요'
    else hint = `+${selScore.toLocaleString()}점 · ${left === 0 ? '🔥 핫 다이스!' : `남은 주사위 ${left}개`}`
  }

  return (
    <>
      <FarklePlayers
        names={seats.map((p) => `${p.bot ? '🤖 ' : ''}${p.name}${p.seat === seat ? ' (나)' : ''}${p.connected === false ? ' 📴' : ''}`)}
        scores={s.scores}
        turn={result ? null : s.turn}
        finalFrom={s.finalFrom}
      />

      <div className="farkle-table felt">
        <div className="status">
          {result ? '게임 끝!' : myTurn ? '내 차례' : `${seats[s.turn]?.bot ? '🤖 ' : ''}${turnName} 차례…`}
          <div className="farkle-sub">
            목표 {s.target.toLocaleString()}점{seat == null && ' · 구경 중'}
          </div>
        </div>

        <div className="farkle-turn">
          <span>이번 차례</span>
          <strong>{s.turnTotal.toLocaleString()}</strong>
          {anySel && selScore != null && <em>+{selScore.toLocaleString()}</em>}
        </div>

        <div className="farkle-dice">
          {s.phase !== 'choose' ? (
            <div className="farkle-ready">🎲 × {s.toRoll}</div>
          ) : (
            s.dice.map((d, i) => (
              <Die
                key={i}
                value={d}
                size={52}
                held={!!sel[i]}
                rolling={rolling}
                disabled={!myTurn || rolling}
                onClick={() => setSel((p) => s.dice.map((_, j) => (j === i ? !p[j] : !!p[j])))}
              />
            ))
          )}
        </div>

        {s.event && <EventLine e={s.event} names={names} target={s.target} />}
        {hint && <div className="farkle-hint">{hint}</div>}

        <FarkleKept kept={s.kept} />

        {myTurn && (
          <div className="farkle-buttons">
            {s.phase === 'start' ? (
              <button className="btn accent big" onClick={() => act({ type: 'roll' })}>
                🎲 굴리기
              </button>
            ) : (
              <>
                <button className="btn accent big" disabled={!canAct} onClick={() => act({ type: 'keep', idx, bank: false })}>
                  {left === 0 && anySel ? '🔥 6개 다시 굴리기' : `🎲 계속 굴리기${anySel && selScore != null ? ` (${left}개)` : ''}`}
                </button>
                <button className="btn primary big" disabled={!canAct} onClick={() => act({ type: 'keep', idx, bank: true })}>
                  💰 {canAct ? `${(s.turnTotal + (selScore ?? 0)).toLocaleString()}점 ` : ''}저장
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <FarkleRef />
    </>
  )
}
