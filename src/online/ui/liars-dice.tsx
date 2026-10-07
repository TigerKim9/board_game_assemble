import { useEffect, useState } from 'react'
import { Die } from '../../components/Die'
import { BidControls, BidLog, BidView, RevealPanel } from '../../games/liars-dice/parts'
import '../../games/liars-dice/liars-dice.css'
import type { LiarAction, LiarView } from '../games/liars-dice'
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

export default function OnlineLiarsDice({ view: s, seat, toAct, seats, result, act }: OnlineGameProps<LiarView, LiarAction>) {
  const myTurn = seat != null && toAct.includes(seat)
  const names = seats.map((p) => p.name)
  const total = s.counts.reduce((a, b) => a + b, 0)
  const cur = s.bids.length ? s.bids[s.bids.length - 1] : null
  const rolling = useFlash(s.round)
  const last = s.last
  const fresh = last != null && s.bids.length === 0 && !result
  const turnName = names[s.turn] ?? ''

  return (
    <>
      <ul className="ld-players">
        {seats.map((p, i) => (
          <li
            key={i}
            className={`ld-player ${i === s.turn && !result ? 'active' : ''} ${s.counts[i] === 0 ? 'out' : ''} ${fresh && last?.loser === i ? 'loser' : ''}`}
            style={{ '--c': `var(--p${(i % 6) + 1})` } as React.CSSProperties}
          >
            <span className="ld-pname">
              {p.bot ? '🤖 ' : ''}
              {p.name}
              {i === seat ? ' (나)' : ''}
              {p.connected === false ? ' 📴' : ''}
            </span>
            <span className="ld-count">{s.counts[i] > 0 ? `🎲×${s.counts[i]}` : '탈락'}</span>
          </li>
        ))}
      </ul>

      {last && (
        <details className="ld-last" open={fresh}>
          <summary>
            {last.round}라운드: {names[last.challenger]}의 "거짓말!" → {names[last.loser]} 주사위 −1
          </summary>
          <div className="ld-table felt">
            <div className="ld-current">
              <span className="ld-current-label">{names[last.bidder]}의 베팅</span>
              <BidView bid={last.bid} size={34} />
            </div>
            <RevealPanel names={names} hands={last.hands} reveal={last} wild={s.wild} />
          </div>
        </details>
      )}

      {!result && (
        <div className="ld-table felt">
          <div className="status">
            {myTurn ? '내 차례' : `${turnName} ${seats[s.turn]?.bot ? '고민 중…' : '차례'}`}
            <div className="ld-sub">
              {s.round}라운드 · 전체 주사위 {total}개{s.wild ? ' · 1은 만능' : ''}
              {seat == null && ' · 구경 중'}
            </div>
          </div>

          <div className="ld-current">
            {cur ? (
              <>
                <span className="ld-current-label">{names[cur.player]}의 베팅</span>
                <BidView bid={cur.bid} size={44} />
                <span className="ld-current-hint">
                  "전체에 {cur.bid.face}
                  {s.wild ? '(또는 1)' : ''}이 {cur.bid.qty}개 이상 있다"
                </span>
              </>
            ) : (
              <span className="ld-current-label">{myTurn ? '내가' : `${turnName}님이`} 첫 베팅을 해요</span>
            )}
          </div>

          <div className="ld-mine">
            <span className="ld-mine-label">{s.mine ? '내 주사위 (나만 보여요)' : seat == null ? '주사위는 컵 속에…' : '탈락했어요 — 구경해요'}</span>
            <div className="ld-mine-dice">
              {s.mine
                ? s.mine.map((d, i) => <Die key={i} value={d} size={44} rolling={rolling} />)
                : Array.from({ length: 3 }, (_, i) => (
                    <span key={i} className="ld-cup">
                      🥤
                    </span>
                  ))}
            </div>
          </div>

          {myTurn && (
            <BidControls
              key={`${s.round}-${s.bids.length}`}
              cur={cur?.bid ?? null}
              total={total}
              wild={s.wild}
              onBid={(bid) => act({ type: 'bid', bid })}
              onChallenge={() => act({ type: 'challenge' })}
            />
          )}
        </div>
      )}

      <BidLog names={names} bids={s.bids} />
    </>
  )
}
