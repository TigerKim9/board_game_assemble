import { cardLabel, isJoker, type Card } from '../../cards'
import { HandFan, LogList, Seats, Toasts, type SeatInfo as KitSeat } from '../../games/onecard/kit'
import { useKeyedState } from '../../games/onecard/kitHooks'
import { TITLE_EMOJI, TITLE_KO, analyze, beats, rankName, standings, type PRState } from '../../games/president/logic'
import { PresidentTrick, ScoreTable } from '../../games/president/parts'
import '../../games/president/president.css'
import type { PresidentAction, PresidentView } from '../games/president'
import { nameOf, othersInOrder, presence, useNamedLog } from './onecard-kit'
import type { OnlineGameProps } from './types'

const COUNT_NAME = ['', '한 장', '두 장(페어)', '세 장(트리플)', '네 장(포카드)']

export default function OnlinePresident({ view: v, seat: me, toAct, seats, act }: OnlineGameProps<PresidentView, PresidentAction>) {
  const log = useNamedLog(v.log, seats, me)
  const mine = me !== null && toAct.includes(me)
  const [sel, setSel] = useKeyedState<string[]>([], `${v.phase}|${v.round}|${v.plays}|${v.turn}|${mine}`)
  const hand = v.hand ?? []
  const label = (p: number) => `${seats[p]?.bot ? '🤖' : '🙂'} ${nameOf(seats, p)}${p === me ? ' (나)' : ''}`

  if (v.phase === 'over' || v.phase === 'roundEnd') {
    const over = v.phase === 'over'
    const order = over ? standings(v as unknown as PRState) : v.finished
    const waiting = seats.filter((_, i) => !v.ready[i]).map((s) => s.name)
    return (
      <div className="president">
        <div className="card-panel">
          <h3 className="center">{over ? '최종 결과' : `${v.round}/${v.opts.rounds} 라운드 결과`}</h3>
          <ScoreTable titles={v.titles} scores={v.scores} order={order} label={label} />
          {!over && (
            <>
              <p className="muted president-note">
                다음 라운드: 노예는 가장 센 카드 2장을 대통령에게 바치고{v.n >= 4 ? ', 부국민은 부통령에게 1장을' : ''} 주고 받아요.
              </p>
              {me !== null && !v.ready[me] ? (
                <button className="btn primary big" onClick={() => act({ type: 'next' })}>
                  다음 라운드
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

  const giving = v.phase === 'exchange' && mine ? v.pendingGive.find((g) => g.from === me) : undefined
  const myTurn = v.phase === 'play' && mine && v.turn === me
  const selCards = hand.filter((c) => sel.includes(c.id))
  const combo = analyze(selCards)
  const canPlay = myTurn && !!combo && beats(combo, v.current, v.revolution)

  const tap = (c: Card) => {
    if (!mine) return
    if (sel.includes(c.id)) return setSel(sel.filter((x) => x !== c.id))
    if (giving) return setSel(sel.length >= giving.count ? [...sel.slice(1), c.id] : [...sel, c.id])
    const need = v.current?.count ?? 0
    if (sel.length === 0 && need > 1 && !isJoker(c)) {
      const same = hand.filter((x) => x.rank === c.rank)
      if (same.length >= need) {
        const rest = same.filter((x) => x.id !== c.id).slice(0, need - 1)
        return setSel([c.id, ...rest.map((x) => x.id)])
      }
    }
    setSel([...sel, c.id])
  }

  const kitSeats: KitSeat[] = othersInOrder(v.n, me).map((i) => {
    const t = v.titles[i]
    const fin = v.finished.indexOf(i)
    return {
      index: i,
      name: nameOf(seats, i),
      isAI: !!seats[i]?.bot,
      count: v.counts[i],
      active: toAct.includes(i),
      out: fin >= 0,
      badge: fin >= 0 ? `${fin + 1}등 탈출` : t ? `${TITLE_EMOJI[t]} ${TITLE_KO[t]}` : `${v.scores[i]}점`,
      note: presence(seats, i) ?? (v.passed[i] && v.current ? '패스' : fin < 0 && t ? `${v.scores[i]}점` : undefined),
    }
  })

  let status: string
  if (v.phase === 'exchange') {
    status = giving
      ? `${nameOf(seats, giving.to)}에게 돌려줄 카드 ${giving.count}장을 고르세요`
      : `${v.pendingGive.map((g) => nameOf(seats, g.from)).join(', ')} 돌려줄 카드 고르는 중…`
  } else if (!myTurn) status = `${nameOf(seats, v.turn)} 차례${me === null ? ' (구경 중)' : '…'}`
  else if (!v.current) status = '선 차례! 아무 조합이나 내세요'
  else status = `${COUNT_NAME[v.current.count]}로 ${rankName(v.current.level)}보다 ${v.revolution ? '약한(혁명)' : '센'} 카드!`

  return (
    <div className="president">
      <Seats seats={kitSeats} />
      <div className={`president-table felt ${v.revolution ? 'revo' : ''}`}>
        <Toasts log={log} />
        <div className="president-info">
          <span>
            {v.round}/{v.opts.rounds} 라운드
          </span>
          {v.revolution && <span className="president-revo">✊ 혁명 중 — 3이 가장 세요</span>}
        </div>
        <PresidentTrick
          current={v.current}
          byName={v.current ? nameOf(seats, v.current.by) : ''}
          plays={v.plays}
          emptyText={v.phase === 'exchange' ? '카드 교환 중' : '새 판 — 자유롭게 내기'}
        />
        <div className={`status president-status ${mine ? 'mine' : ''}`}>{status}</div>
      </div>

      <div className="president-me card-panel">
        {me === null ? (
          <p className="muted center president-wait">구경 중 — 다른 사람의 카드는 보이지 않아요</p>
        ) : (
          <>
            <div className="president-me-head">
              <strong>
                {nameOf(seats, me)} · {hand.length}장
              </strong>
              {v.titles[me] && (
                <span className="president-title">
                  {TITLE_EMOJI[v.titles[me]!]} {TITLE_KO[v.titles[me]!]}
                </span>
              )}
              <span className="muted">{v.scores[me]}점</span>
            </div>
            {v.exchanges.length > 0 && v.plays === 0 && (
              <div className="president-ex">
                {v.exchanges.map((e, i) => (
                  <span key={i}>
                    {e.from === me ? `→ ${nameOf(seats, e.to)}에게 줌: ` : `← ${nameOf(seats, e.from)}에게 받음: `}
                    <b>{e.cards.map(cardLabel).join(' ')}</b>
                  </span>
                ))}
              </div>
            )}
            <HandFan cards={hand} selected={new Set(sel)} onTap={mine ? tap : undefined} cardWidth={60} />
            {hand.length === 0 ? (
              <p className="center president-done">🎉 탈출! 다른 사람들을 기다려요</p>
            ) : giving ? (
              <div className="president-actions one">
                <button
                  className="btn primary"
                  disabled={sel.length !== giving.count}
                  onClick={() => act({ type: 'give', cardIds: sel })}
                >
                  {giving.count}장 돌려주기 ({sel.length}/{giving.count})
                </button>
              </div>
            ) : (
              <div className="president-actions">
                <button className="btn primary" disabled={!canPlay} onClick={() => act({ type: 'play', cardIds: sel })}>
                  {sel.length ? `${sel.length}장 내기` : '내기'}
                </button>
                <button className="btn" disabled={!myTurn || !v.current} onClick={() => act({ type: 'pass' })}>
                  패스
                </button>
                <button className="btn ghost" disabled={!sel.length} onClick={() => setSel([])}>
                  선택 해제
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
