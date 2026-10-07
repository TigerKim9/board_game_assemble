import { useMemo } from 'react'
import { PlayingCard, cardLabel, makeCard, type Card } from '../../cards'
import { OldMaidCenter, type DrawnInfo } from '../../games/oldmaid/Center'
import { nextWithCards } from '../../games/oldmaid/logic'
import '../../games/oldmaid/oldmaid.css'
import { HandFan, LogList, Seats, Toasts, type SeatInfo as KitSeat } from '../../games/onecard/kit'
import type { OldMaidAction, OldMaidView } from '../games/oldmaid'
import { nameOf, othersInOrder, presence, useNamedLog } from './onecard-kit'
import type { OnlineGameProps } from './types'

/** Face-down placeholders for the neighbour's hand (the server never sends their cards). */
const backs = (n: number): Card[] => Array.from({ length: n }, (_, i) => ({ ...makeCard('S', 1), id: `back${i}` }))

export default function OnlineOldMaid({ view: v, seat: me, toAct, seats, act }: OnlineGameProps<OldMaidView, OldMaidAction>) {
  const log = useNamedLog(v.log, seats, me)
  const counts = v.counts
  const hands = useMemo(() => counts.map((c) => Array(c)), [counts])
  const drawer = v.turn
  const target = v.over ? -1 : nextWithCards({ n: v.n, hands }, drawer)
  const myTurn = me !== null && !v.over && drawer === me && toAct.includes(me)

  if (v.over) {
    const order = [...v.out, ...Array.from({ length: v.n }, (_, i) => i).filter((i) => !v.out.includes(i) && i !== v.loser)]
    return (
      <div className="oldmaid">
        <div className="card-panel">
          {v.jokerCard && v.loser !== null && (
            <div className="oldmaid-joker" style={{ display: 'flex', justifyContent: 'center' }}>
              <PlayingCard card={v.jokerCard} width={70} />
            </div>
          )}
          <ol className="oldmaid-rank">
            {order.map((p, i) => (
              <li key={p}>
                {i + 1}. {seats[p]?.bot ? '🤖' : '🙂'} {nameOf(seats, p)}
                <span className="muted"> — 탈출</span>
              </li>
            ))}
            {v.loser !== null && (
              <li>
                🃏 {seats[v.loser]?.bot ? '🤖' : '🙂'} {nameOf(seats, v.loser)}
                {v.loser === me && ' (나)'}
                <strong> — 도둑!</strong>
              </li>
            )}
          </ol>
        </div>
        <LogList log={log} count={4} />
      </div>
    )
  }

  const kitSeats: KitSeat[] = othersInOrder(v.n, me).map((i) => ({
    index: i,
    name: nameOf(seats, i),
    isAI: !!seats[i]?.bot,
    count: counts[i],
    active: drawer === i,
    out: counts[i] === 0,
    badge: counts[i] === 0 ? '탈출' : i === target ? '🎯 뽑힐 차례' : undefined,
    note: presence(seats, i),
  }))

  const last = v.last
  let drawn: DrawnInfo | null = null
  if (last?.card && me !== null && last.by === me) {
    drawn = {
      card: last.card,
      lost: false,
      text: (
        <>
          뽑은 카드 {cardLabel(last.card)}
          <br />
          {last.paired ? '짝 맞춤! 🎯' : last.card.rank === 0 ? '앗, 도둑이다! 😱' : '짝 없음'}
        </>
      ),
    }
  } else if (last?.card && me !== null && last.from === me) {
    drawn = {
      card: last.card,
      lost: true,
      text: (
        <>
          {nameOf(seats, last.by)}가
          <br />
          {last.card.rank === 0 ? '도둑을 가져갔어요! 😆' : '가져갔어요'}
        </>
      ),
    }
  }

  const beingRobbed = me !== null && target === me
  let status: string
  if (myTurn) status = `${nameOf(seats, target)}의 카드 중 한 장을 골라 뽑으세요!`
  else status = `${nameOf(seats, drawer)}가 ${nameOf(seats, target)}의 카드를 뽑는 중…`

  return (
    <div className="oldmaid">
      <Seats seats={kitSeats} />
      <div className="oldmaid-table felt">
        <Toasts log={log} />
        <div className={`status oldmaid-status ${myTurn ? 'mine' : ''}`}>{status}</div>
        {myTurn ? (
          <div className="oldmaid-target" key={`t${drawer}-${counts[target]}`}>
            <div className="oldmaid-target-name">
              {seats[target]?.bot ? '🤖' : '🙂'} {nameOf(seats, target)} · {counts[target]}장
            </div>
            <HandFan
              cards={backs(counts[target])}
              faceDown
              back="red"
              cardWidth={62}
              onTap={(_, i) => act({ index: i })}
              className="oldmaid-shuffle-in"
            />
          </div>
        ) : (
          <OldMaidCenter lastPair={v.lastPair} pairs={v.pairs} drawn={drawn} />
        )}
      </div>

      <div className="oldmaid-me card-panel">
        {me === null || !v.hand ? (
          <p className="muted center oldmaid-wait">구경 중 — 다른 사람의 카드는 보이지 않아요</p>
        ) : (
          <>
            <div className="oldmaid-me-head">
              <strong>
                {nameOf(seats, me)} · {v.hand.length}장
              </strong>
              {beingRobbed && <span className="oldmaid-alert">😬 {nameOf(seats, drawer)}가 내 카드를 노려요!</span>}
            </div>
            <HandFan cards={v.hand} cardWidth={60} />
            {v.hand.length === 0 && <p className="center oldmaid-escaped">🎉 탈출했어요! 끝까지 지켜봐요</p>}
          </>
        )}
      </div>
      <LogList log={log} count={3} />
    </div>
  )
}
