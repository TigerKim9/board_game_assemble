/** 홀덤 화면 조각 — 로컬 게임과 온라인 화면이 함께 씀. */
import { useMemo, useState } from 'react'
import { CardSlot, PlayingCard, bestHand, describeHand, type Card } from '../../cards'
import { formatChips, legalActions, potTotal, toCall, type BetAction } from '../poker-core'
import { Chips } from '../poker-core/ui'
import { HANDS_PER_LEVEL, STREET_LABEL, potSizedRaise, preflopPercentile, type Table } from './logic'
import './holdem.css'

export function HoldemInfo({ t }: { t: Table }) {
  return (
    <div className="holdem-info">
      <span>
        블라인드 <strong>{t.sb}/{t.bb}</strong>
      </span>
      {t.mode === 'tournament' && t.blindsUp && (
        <span>
          레벨 {t.level + 1} · 다음까지 {HANDS_PER_LEVEL - ((t.handNo - 1) % HANDS_PER_LEVEL)}판
        </span>
      )}
      <span>#{t.handNo}</span>
    </div>
  )
}

/** 쇼다운에서 이긴 카드 id */
export function winningCards(t: Table): Set<string> {
  const winCards = new Set<string>()
  const outcome = t.outcome
  if (t.phase === 'done' && outcome?.showdown) {
    for (const w of outcome.winners) outcome.hands[w]?.cards.forEach((c) => winCards.add(c.id))
  }
  return winCards
}

/** 테이블: 좌석들 + 공용 카드 + 팟 + 상태줄 */
export function HoldemTable({
  t,
  viewer,
  canSee,
  status,
}: {
  t: Table
  /** 내 자리(강조 표시) */
  viewer: number | null
  /** 이 좌석 손패를 앞면으로 보여줄지 */
  canSee: (i: number) => boolean
  status: string
}) {
  const { players, bet, phase, outcome, mode } = t
  const n = players.length
  const turn = bet.turn
  const winCards = winningCards(t)
  const pot = potTotal(bet)
  return (
    <div className="holdem-table felt">
      <ul className={`holdem-seats ${n <= 4 ? 'few' : ''}`}>
        {players.map((p, i) => {
          const s = bet.seats[i]
          const won = phase === 'done' && (outcome?.winners.includes(i) ?? false)
          const hand = phase === 'done' ? outcome?.hands[i] : null
          return (
            <li
              key={i}
              className={`holdem-seat ${i === turn && phase === 'betting' ? 'turn' : ''} ${s.folded || s.out ? 'folded' : ''} ${won ? 'won' : ''} ${i === viewer ? 'me' : ''}`}
              style={{ ['--seat' as string]: `var(--p${(i % 6) + 1})` }}
            >
              <div className="holdem-seat-name">
                {i === t.dealer && <span className="holdem-btn" title="딜러 버튼">D</span>}
                <span className="holdem-name-text">
                  {p.isAI ? '🤖' : ''}
                  {p.name}
                </span>
              </div>
              <div className="holdem-seat-cards">
                {s.out ? (
                  <span className="holdem-tag">{mode === 'tournament' ? '탈락' : '쉬는 중'}</span>
                ) : (
                  t.holes[i].map((c) => <PlayingCard key={c.id} card={c} faceDown={!canSee(i)} width={28} highlight={winCards.has(c.id)} back="red" />)
                )}
              </div>
              <div className="holdem-seat-stack">
                <Chips amount={s.stack} />
              </div>
              <div className="holdem-seat-tag">
                {won ? (
                  <span className="holdem-tag win">+{formatChips(outcome!.won[i])}</span>
                ) : hand ? (
                  <span className="holdem-tag hand">{hand.name}</span>
                ) : i === turn && phase === 'betting' && p.isAI ? (
                  <span className="holdem-tag thinking">…</span>
                ) : t.last[i] ? (
                  <span className={`holdem-tag ${s.folded ? 'fold' : ''}`}>{t.last[i]}</span>
                ) : null}
              </div>
              {s.bet > 0 && phase !== 'done' && <div className="holdem-seat-bet">{formatChips(s.bet)}</div>}
            </li>
          )
        })}
      </ul>

      <div className="holdem-center">
        <div className="holdem-board">
          {Array.from({ length: 5 }, (_, k) =>
            t.board[k] ? (
              <PlayingCard key={t.board[k].id} card={t.board[k]} width={50} highlight={winCards.has(t.board[k].id)} className="holdem-deal" />
            ) : (
              <CardSlot key={k} width={50} className="holdem-slot" />
            ),
          )}
        </div>
        <div className="holdem-pot">
          팟 <Chips amount={pot} />
          <span className="holdem-street">{STREET_LABEL[t.street]}</span>
        </div>
      </div>

      <div className="status holdem-status">{status}</div>
    </div>
  )
}

export function outcomeHeadline(t: Table): string {
  const o = t.outcome!
  const names = o.winners.map((w) => t.players[w].name)
  if (!o.showdown) return `🎉 ${names.join(', ')} 팟 획득!`
  const main = o.awards[0]
  if (main && main.winners.length > 1) return `🤝 ${main.winners.map((w) => t.players[w].name).join(', ')} 나눠 가짐`
  const w = main?.winners[0] ?? o.winners[0]
  const h = o.hands[w]
  return `🎉 ${t.players[w].name} 승리${h ? ` — ${describeHand(h)}` : ''}`
}

export function OutcomeDetail({ t }: { t: Table }) {
  const o = t.outcome!
  if (!o.showdown || o.awards.length <= 1) return null
  return (
    <ul className="holdem-pots card-panel">
      {o.awards.map((a, k) => (
        <li key={k}>
          <span className="muted">{k === 0 ? '메인 팟' : `사이드 팟 ${k}`}</span> <Chips amount={a.amount} /> →{' '}
          <strong>{a.winners.map((w) => t.players[w].name).join(', ')}</strong>
          {a.winners.length > 1 && <span className="muted"> (나눔)</span>}
        </li>
      ))}
    </ul>
  )
}

export function MyHand({ t, seat }: { t: Table; seat: number }) {
  const hole = t.holes[seat]
  const s = t.bet.seats[seat]
  const hint = useMemo(() => {
    if (hole.length < 2) return ''
    if (t.board.length >= 3) return describeHand(bestHand([...hole, ...t.board]))
    const pct = preflopPercentile(hole[0], hole[1])
    const pair = hole[0].rank === hole[1].rank
    const tier = pct < 0.05 ? '프리미엄' : pct < 0.15 ? '아주 좋음' : pct < 0.3 ? '좋음' : pct < 0.55 ? '보통' : '약함'
    return `${pair ? '포켓 페어 · ' : hole[0].suit === hole[1].suit ? '수딧 · ' : ''}시작 패 ${tier}${pct < 0.5 ? ` (상위 ${Math.max(1, Math.round(pct * 100))}%)` : ''}`
  }, [hole, t.board])
  const win = new Set<string>()
  if (t.phase === 'done' && t.outcome?.showdown && t.outcome.winners.includes(seat)) t.outcome.hands[seat]?.cards.forEach((c) => win.add(c.id))
  return (
    <div className={`holdem-me card-panel ${s.folded ? 'folded' : ''}`}>
      <div className="holdem-me-cards">
        {hole.map((c: Card) => (
          <PlayingCard key={c.id} card={c} width={68} highlight={win.has(c.id)} />
        ))}
      </div>
      <div className="holdem-me-info">
        <span className="muted">{t.players[seat].name}님의 패</span>
        <strong>{s.folded ? '폴드했어요' : hint}</strong>
        <span className="holdem-me-stack">
          칩 <Chips amount={s.stack} />
          {s.bet > 0 && t.phase !== 'done' && <span className="muted"> · 베팅 {formatChips(s.bet)}</span>}
        </span>
      </div>
    </div>
  )
}

/** 내 차례 행동 버튼(폴드·체크/콜·베팅/레이즈 + 금액 고르기) */
export function ActionBar({ t, onAct }: { t: Table; onAct: (a: BetAction) => void }) {
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raiseTo, setRaiseTo] = useState(0)
  const l = legalActions(t.bet)
  const seat = t.bet.seats[t.bet.turn]
  const need = toCall(t.bet, t.bet.turn)
  const callAll = need >= seat.stack
  const betWord = t.bet.currentBet === 0 ? '베팅' : '레이즈'
  const r = l.raise
  const clamp = (v: number) => (r ? Math.max(r.min, Math.min(r.max, Math.round(v))) : 0)
  const quick: [string, number][] = r
    ? [
        ['최소', r.min],
        ['½팟', clamp(potSizedRaise(t, 0.5))],
        ['팟', clamp(potSizedRaise(t, 1))],
        ['올인', r.max],
      ]
    : []
  const toggleRaise = () => {
    if (!raiseOpen) setRaiseTo(r ? Math.min(r.max, Math.max(r.min, potSizedRaise(t, 0.5))) : 0)
    setRaiseOpen(!raiseOpen)
  }
  const go = (a: BetAction) => {
    setRaiseOpen(false)
    onAct(a)
  }
  return (
    <div className="holdem-actions">
      {raiseOpen && r && (
        <div className="holdem-raise card-panel">
          <div className="holdem-raise-amount">
            {betWord} <strong>{formatChips(raiseTo)}</strong>
            {raiseTo >= r.max && <span className="holdem-allin">올인</span>}
          </div>
          <input
            type="range"
            className="holdem-slider"
            min={r.min}
            max={r.max}
            step={Math.max(1, Math.min(t.bb, r.max - r.min))}
            value={raiseTo}
            onChange={(e) => setRaiseTo(clamp(Number(e.target.value)))}
            aria-label="레이즈 금액"
          />
          <div className="holdem-quick">
            {quick.map(([label, v]) => (
              <button key={label} className={`btn small ${raiseTo === v ? 'primary' : ''}`} onClick={() => setRaiseTo(v)}>
                {label}
              </button>
            ))}
          </div>
          <div className="holdem-raise-go">
            <button className="btn ghost" onClick={() => setRaiseOpen(false)}>
              취소
            </button>
            <button className="btn accent" onClick={() => go({ kind: 'raise', to: raiseTo })}>
              {raiseTo >= r.max ? '올인' : `${betWord} ${formatChips(raiseTo)}`}
            </button>
          </div>
        </div>
      )}
      <div className="holdem-buttons">
        <button className="btn danger" disabled={l.canCheck} onClick={() => go({ kind: 'fold' })}>
          폴드
        </button>
        <button className="btn primary" onClick={() => go(l.canCheck ? { kind: 'check' } : { kind: 'call' })}>
          {l.canCheck ? '체크' : callAll ? `올인 ${formatChips(l.callAmount)}` : `콜 ${formatChips(l.callAmount)}`}
        </button>
        <button className="btn accent" disabled={!r} onClick={toggleRaise}>
          {betWord}
        </button>
      </div>
    </div>
  )
}
