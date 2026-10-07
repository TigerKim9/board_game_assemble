import { useMemo } from 'react'
import { sortCards, type Card } from '../../cards'
import { OneCardCenter, SuitPicker } from '../../games/onecard/Center'
import { HandFan, LogList, Seats, Toasts, type SeatInfo as KitSeat } from '../../games/onecard/kit'
import { useKeyedState } from '../../games/onecard/kitHooks'
import { BUST_LIMIT, canPlay, type OCState } from '../../games/onecard/logic'
import '../../games/onecard/onecard.css'
import type { OneCardAction, OneCardView } from '../games/onecard'
import { nameOf, othersInOrder, presence, useNamedLog } from './onecard-kit'
import type { OnlineGameProps } from './types'

/** logic.canPlay only looks at the top card, the attack and the suit — all public. */
const canPlayView = (v: OneCardView, c: Card) =>
  canPlay({ discard: [v.top], attack: v.attack, suit: v.suit } as Pick<OCState, 'discard' | 'attack' | 'suit'> as OCState, c)

export default function OnlineOneCard({ view: v, seat: me, toAct, seats, act }: OnlineGameProps<OneCardView, OneCardAction>) {
  const log = useNamedLog(v.log, seats, me)
  const key = String(v.log[v.log.length - 1]?.id ?? 0)
  const [sel, setSel] = useKeyedState<string | null>(null, key)
  const [pick7, setPick7] = useKeyedState<string | null>(null, key)
  const active = (i: number) => !v.done.includes(i) && !v.busted.includes(i)
  const myTurn = me !== null && !v.over && v.turn === me && toAct.includes(me)
  const hand = useMemo(() => (v.hand ? sortCards(v.hand, { suitOrder: ['S', 'H', 'C', 'D'] }) : []), [v.hand])
  const hasLegal = myTurn && hand.some((c) => canPlayView(v, c))
  const curName = nameOf(seats, v.turn)

  const doPlay = (id: string) => {
    const c = hand.find((x) => x.id === id)
    if (!myTurn || !c || !canPlayView(v, c)) return
    if (c.rank === 7) return setPick7(id)
    act({ type: 'play', cardId: id })
  }

  if (v.over) {
    const rest = Array.from({ length: v.n }, (_, i) => i)
      .filter(active)
      .sort((a, b) => v.counts[a] - v.counts[b])
    const order = [...v.done, ...rest, ...v.busted.slice().reverse()]
    return (
      <div className="onecard">
        <div className="card-panel">
          <ol className="onecard-rank">
            {order.map((p, i) => (
              <li key={p}>
                <strong>{i + 1}등</strong> {seats[p]?.bot ? '🤖' : '🙂'} {nameOf(seats, p)}
                {p === me && ' (나)'}
                <span className="muted">
                  {v.done.includes(p) ? ' — 탈출' : v.busted.includes(p) ? ' — 파산' : ` — ${v.counts[p]}장 남음`}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <LogList log={log} count={5} />
      </div>
    )
  }

  const kitSeats: KitSeat[] = othersInOrder(v.n, me).map((i) => ({
    index: i,
    name: nameOf(seats, i),
    isAI: !!seats[i]?.bot,
    count: v.counts[i],
    active: v.turn === i,
    out: !active(i),
    badge: v.done.includes(i)
      ? `${v.done.indexOf(i) + 1}등`
      : v.busted.includes(i)
        ? '파산'
        : v.counts[i] === 1
          ? '☝️ 1장'
          : undefined,
    note: presence(seats, i),
  }))

  const vul = v.vulnerable
  const iAmVulnerable = vul !== null && vul === me
  const canCatch = vul !== null && me !== null && vul !== me && active(me) && toAct.includes(me)
  const canPredeclare = myTurn && me !== null && v.counts[me] === 2 && !v.predeclared[me]

  let status: string
  if (me === null) status = `${curName} 차례 (구경 중)`
  else if (!myTurn) status = active(me) ? `${curName} 차례…` : `${curName} 차례 — 나는 끝났어요`
  else if (v.attack > 0) status = hasLegal ? `⚔️ +${v.attack} 공격! 막거나 받으세요` : `⚔️ +${v.attack} 공격! 막을 카드가 없어요`
  else status = hasLegal ? '내 차례 — 카드를 고르세요' : '낼 카드가 없어요 — 한 장 뽑으세요'

  return (
    <div className="onecard">
      <Seats seats={kitSeats} />
      <div className="onecard-table felt">
        <Toasts log={log} />
        <OneCardCenter
          top={v.top}
          pileCount={v.pileCount}
          suit={v.suit}
          dir={v.dir}
          attack={v.attack}
          flip={v.last?.kind === 'play'}
        />
        <div className={`status onecard-status ${myTurn ? 'mine' : ''}`}>{status}</div>
        {(iAmVulnerable || canCatch) && (
          <div className="onecard-calls">
            {iAmVulnerable && (
              <button className="btn accent onecard-call" onClick={() => act({ type: 'declare' })}>
                ☝️ 원카드!
              </button>
            )}
            {canCatch && vul !== null && (
              <button className="btn danger onecard-call" onClick={() => act({ type: 'catch' })}>
                🚨 {nameOf(seats, vul)} 원카드 안 외침! 잡기
              </button>
            )}
          </div>
        )}
      </div>

      <div className="onecard-me card-panel">
        {me === null ? (
          <p className="muted center onecard-wait">구경 중 — 다른 사람의 카드는 보이지 않아요</p>
        ) : (
          <>
            <div className="onecard-me-head">
              <strong>
                {nameOf(seats, me)} · {hand.length}장
              </strong>
              {hand.length >= BUST_LIMIT - 5 && <span className="onecard-warn">⚠️ {BUST_LIMIT}장이면 파산</span>}
              {v.predeclared[me] && <span className="onecard-ready">☝️ 원카드 준비</span>}
              {v.done.includes(me) && <span className="onecard-ready">🎉 {v.done.indexOf(me) + 1}등 탈출!</span>}
              {v.busted.includes(me) && <span className="onecard-warn">💥 파산</span>}
            </div>
            <HandFan
              cards={hand}
              selected={sel ? new Set([sel]) : undefined}
              isPlayable={myTurn ? (c) => canPlayView(v, c) : undefined}
              onTap={
                myTurn
                  ? (c) => {
                      if (sel === c.id) doPlay(c.id)
                      else setSel(c.id)
                    }
                  : undefined
              }
              cardWidth={60}
            />
            {pick7 ? (
              <SuitPicker
                onPick={(su) => {
                  act({ type: 'play', cardId: pick7, suit: su })
                  setPick7(null)
                }}
                onCancel={() => setPick7(null)}
              />
            ) : (
              active(me) && (
                <div className="onecard-actions">
                  <button
                    className="btn primary"
                    disabled={!myTurn || !sel || !hand.some((c) => c.id === sel && canPlayView(v, c))}
                    onClick={() => sel && doPlay(sel)}
                  >
                    내기
                  </button>
                  <button
                    className={`btn ${v.attack > 0 ? 'danger' : ''}`}
                    disabled={!myTurn}
                    onClick={() => act({ type: 'draw' })}
                  >
                    {v.attack > 0 ? `공격 받기 (+${v.attack}장)` : '한 장 뽑기'}
                  </button>
                  <button className="btn accent" disabled={!canPredeclare} onClick={() => act({ type: 'declare' })}>
                    ☝️ 원카드
                  </button>
                </div>
              )
            )}
          </>
        )}
      </div>
      <LogList log={log} count={3} />
    </div>
  )
}
