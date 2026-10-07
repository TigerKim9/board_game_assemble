import { useEffect, useState } from 'react'
import { GOAL } from '../../games/zombie-dice/logic'
import { ZdCupInfo, ZdLegend, ZdPlayers, ZdTally } from '../../games/zombie-dice/parts'
import { ZombieDie } from '../../games/zombie-dice/ZombieDie'
import '../../games/zombie-dice/zombie-dice.css'
import type { ZombieAction, ZombieEvent, ZombieView } from '../games/zombie-dice'
import type { OnlineGameProps } from './types'

function useFlash(key: unknown, ms = 600) {
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

function eventText(e: ZombieEvent, names: string[]): string {
  const who = names[e.seat] ?? ''
  if (e.kind === 'bust') return `💥 ${who}: 총에 3번 맞아 뇌 ${e.lost}개를 놓쳤어요`
  if (e.kind === 'bank') return `${who}: 뇌 ${e.gained}개 획득!`
  return `🏁 ${who}님이 ${GOAL}개 달성! 이번 바퀴가 끝나면 게임 종료`
}

export default function OnlineZombieDice({ view: s, seat, toAct, seats, result, act }: OnlineGameProps<ZombieView, ZombieAction>) {
  const myTurn = seat != null && toAct.includes(seat)
  const names = seats.map((p) => p.name)
  const rolling = useFlash(s.rollNo)
  const feet = s.hand.filter((d) => d.face === 'feet').length
  const bust = s.event?.kind === 'bust' && s.phase === 'start' && s.hand.length === 0 ? s.event : null
  const hand = bust ? bust.hand : s.hand
  const turnName = names[s.turn] ?? ''

  return (
    <>
      <ZdPlayers
        names={seats.map((p) => `${p.bot ? '🤖 ' : ''}${p.name}${p.seat === seat ? ' (나)' : ''}${p.connected === false ? ' 📴' : ''}`)}
        scores={s.scores}
        turn={result ? null : s.turn}
      />

      <div className="zd-table felt">
        <div className="status">
          {result ? '게임 끝!' : myTurn ? '내 차례' : `${seats[s.turn]?.bot ? '🤖 ' : ''}${turnName} 사냥 중…`}
          <div className="zd-sub">
            뇌 {GOAL}개를 먼저 모으면 승리{s.finalRound && ' · 🏁 마지막 바퀴!'}
            {seat == null && ' · 구경 중'}
          </div>
        </div>

        <div className={`zd-hand ${bust ? 'bust' : ''}`}>
          {hand.length === 0 ? (
            <div className="zd-cup" aria-label="주사위 통">
              <span>🥫</span>
              <small>통에서 3개를 뽑아 굴려요</small>
            </div>
          ) : (
            hand.map((d, i) => <ZombieDie key={`${s.rollNo}-${i}`} color={d.color} face={rolling ? null : d.face} size={76} rolling={rolling} />)
          )}
        </div>

        {s.event && !rolling && <div className="zd-log">{eventText(s.event, names)}</div>}

        <ZdTally brains={s.brains} shots={s.shots.length} />

        <ZdCupInfo cup={s.cup} />

        {myTurn && (
          <div className="zd-buttons">
            <button className="btn accent big" disabled={rolling} onClick={() => act({ type: 'roll' })}>
              🎲 {s.phase === 'decide' && feet > 0 ? `굴리기 (발자국 ${feet}개 + 새로 ${3 - feet}개)` : '굴리기'}
            </button>
            <button className="btn primary big" disabled={rolling || s.phase !== 'decide' || s.brains === 0} onClick={() => act({ type: 'stop' })}>
              ✋ 멈추고 뇌 {s.brains}개 저장
            </button>
          </div>
        )}
      </div>

      <ZdLegend />
    </>
  )
}
