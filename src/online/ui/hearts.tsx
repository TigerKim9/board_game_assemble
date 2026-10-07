import { useEffect, useState } from 'react'
import { HeartsBoard, HeartsScores } from '../../games/hearts/Board'
import { PASS_KO, PASS_OFFSET, TARGET, handPoints, legalCards, passDir, type HState } from '../../games/hearts/logic'
import '../../games/hearts/hearts.css'
import { HandFan, LogList, Toasts } from '../../games/onecard/kit'
import { useKeyedState } from '../../games/onecard/kitHooks'
import type { HeartsAction, HeartsView } from '../games/hearts'
import { nameOf, presence, useNamedLog } from './onecard-kit'
import type { OnlineGameProps } from './types'

/** Show the finished trick for a moment after the server collected it. */
function useRecentTrick(v: HeartsView): boolean {
  const key = `${v.handNo}-${v.trickNo}`
  const [shownFor, setShownFor] = useState(key)
  const [show, setShow] = useState(false)
  if (shownFor !== key) {
    setShownFor(key)
    setShow(v.trickNo > 0 && v.trick.length === 0)
  }
  useEffect(() => {
    if (!show) return
    const id = setTimeout(() => setShow(false), 1600)
    return () => clearTimeout(id)
  }, [show, key])
  return show && v.trick.length === 0 && !!v.lastTrick
}

export default function OnlineHearts({ view: v, seat: me, toAct, seats, act }: OnlineGameProps<HeartsView, HeartsAction>) {
  const log = useNamedLog(v.log, seats, me)
  const mine = me !== null && toAct.includes(me)
  const [sel, setSel] = useKeyedState<string[]>([], `${v.phase}|${v.handNo}|${v.played.length}|${mine}`)
  const recent = useRecentTrick(v)
  const hand = v.hand ?? []
  const dir = passDir(v.handNo)
  const label = (p: number) => `${seats[p]?.bot ? '🤖' : '🙂'} ${nameOf(seats, p)}${p === me ? ' (나)' : ''}`

  if (v.phase === 'over' || v.phase === 'handEnd') {
    const over = v.phase === 'over'
    const order = [0, 1, 2, 3].sort((a, b) => v.scores[a] - v.scores[b])
    const min = Math.min(...v.scores)
    const waiting = [0, 1, 2, 3].filter((i) => !v.ready[i]).map((i) => nameOf(seats, i))
    return (
      <div className="hearts">
        <div className="card-panel">
          <h3 className="center">{over ? '최종 결과' : `${v.handNo}번째 판 결과`}</h3>
          {v.moon !== null && <p className="hearts-moon">🌙 {nameOf(seats, v.moon)} 문 슛 성공! 다른 사람 모두 +26</p>}
          <HeartsScores
            order={order}
            label={label}
            lastHand={v.lastHand}
            scores={v.scores}
            win={over ? order.filter((p) => v.scores[p] === min) : []}
          />
          {!over && (
            <>
              <p className="muted hearts-note">누군가 {TARGET}점이 되면 끝나요. 점수가 가장 낮은 사람이 이겨요.</p>
              {me !== null && !v.ready[me] ? (
                <button className="btn primary big" onClick={() => act({ type: 'next' })}>
                  다음 판
                </button>
              ) : (
                <p className="center muted">기다리는 중: {waiting.join(', ')}</p>
              )}
            </>
          )}
        </div>
        <LogList log={log} count={4} />
      </div>
    )
  }

  // legalCards needs the full state shape but only reads public fields plus my own hand.
  const legal =
    mine && v.phase === 'play' && me !== null
      ? legalCards({ ...v, hands: [0, 1, 2, 3].map((i) => (i === me ? hand : [])) } as unknown as HState, me)
      : []
  const legalIds = new Set(legal.map((c) => c.id))
  const base = me ?? 0
  const passing = v.phase === 'pass' && mine

  const tap = (id: string) => {
    if (!mine) return
    if (v.phase === 'pass') {
      if (sel.includes(id)) setSel(sel.filter((x) => x !== id))
      else setSel(sel.length >= 3 ? [...sel.slice(1), id] : [...sel, id])
      return
    }
    if (!legalIds.has(id)) return
    if (sel[0] === id) act({ type: 'play', id })
    else setSel([id])
  }

  const shownTrick = recent && v.lastTrick ? v.lastTrick.plays : v.trick
  const winner = recent && v.lastTrick ? v.lastTrick.winner : -1

  let status: string
  if (v.phase === 'pass') {
    const left = [0, 1, 2, 3].filter((i) => !v.passDone[i]).map((i) => nameOf(seats, i))
    status = passing
      ? `${PASS_KO[dir]}(${nameOf(seats, (me! + PASS_OFFSET[dir]) % 4)})에게 넘길 카드 3장을 고르세요`
      : `카드 고르는 중: ${left.join(', ')}`
  } else if (recent && v.lastTrick) status = `${nameOf(seats, v.lastTrick.winner)}가 가져갔어요`
  else if (!mine) status = `${nameOf(seats, v.turn)} 차례${me === null ? ' (구경 중)' : '…'}`
  else if (v.trick.length === 0)
    status = v.trickNo === 0 ? '♣2로 시작하세요' : v.heartsBroken ? '선이에요! 아무 카드나' : '선이에요! (하트는 아직 못 내요)'
  else status = '같은 무늬가 있으면 따라 내야 해요'

  return (
    <div className="hearts">
      <div className="hearts-table felt">
        <Toasts log={log} />
        <HeartsBoard
          seats={[0, 1, 2, 3].map((p) => ({
            name: nameOf(seats, p),
            isAI: !!seats[p]?.bot,
            count: v.counts[p],
            pts: handPoints(v.taken[p]),
            total: v.scores[p],
            active: toAct.includes(p),
            note:
              v.phase === 'pass' && v.passDone[p] ? (
                <span className="hearts-seat-note">✔ 골랐어요</span>
              ) : presence(seats, p) ? (
                <span className="hearts-seat-note">{presence(seats, p)}</span>
              ) : undefined,
          }))}
          base={base}
          hide={me}
          trick={shownTrick}
          winner={winner}
          center={
            v.phase === 'pass' ? (
              <>
                <b>{dir === 'none' ? '넘기기 없음' : `${PASS_KO[dir]}으로`}</b>
                <span>{dir !== 'none' && '3장 넘기기'}</span>
              </>
            ) : (
              <>
                <b>{v.trickNo + 1}/13</b>
                <span>{v.heartsBroken ? '💔 하트 깨짐' : '♥ 아직 안 깨짐'}</span>
              </>
            )
          }
        />
        <div className={`status hearts-status ${mine ? 'mine' : ''}`}>{status}</div>
      </div>

      <div className="hearts-me card-panel">
        {me === null ? (
          <p className="muted center hearts-wait">구경 중 — 다른 사람의 카드는 보이지 않아요</p>
        ) : (
          <>
            <div className="hearts-me-head">
              <strong>{nameOf(seats, me)}</strong>
              <span className="hearts-pts">이번 판 ♥{handPoints(v.taken[me])}</span>
              <span className="muted">총점 {v.scores[me]}</span>
              {v.phase === 'play' && v.trickNo === 0 && v.received.length > 0 && <span className="hearts-recv">✨ 받은 카드</span>}
            </div>
            <HandFan
              cards={hand}
              selected={new Set(v.myPass ?? sel)}
              isPlayable={mine && v.phase === 'play' ? (c) => legalIds.has(c.id) : undefined}
              onTap={mine ? (c) => tap(c.id) : undefined}
              highlight={v.phase === 'play' && v.trickNo === 0 ? new Set(v.received.map((c) => c.id)) : undefined}
              cardWidth={60}
            />
            {v.phase === 'pass' ? (
              <div className="hearts-actions">
                <button
                  className="btn primary"
                  disabled={!passing || sel.length !== 3}
                  onClick={() => act({ type: 'pass', ids: sel })}
                >
                  {v.myPass ? '다른 사람 기다리는 중…' : `3장 넘기기 (${sel.length}/3)`}
                </button>
              </div>
            ) : (
              <div className="hearts-actions">
                <button
                  className="btn primary"
                  disabled={!mine || !sel[0] || !legalIds.has(sel[0])}
                  onClick={() => act({ type: 'play', id: sel[0] })}
                >
                  {mine ? (sel[0] ? '내기 (한 번 더 눌러도 돼요)' : '낼 카드를 고르세요') : '기다리는 중…'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <LogList log={log} count={3} />
    </div>
  )
}
