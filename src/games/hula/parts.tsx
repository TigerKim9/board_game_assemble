/** 훌라 화면 조각 — 로컬 게임과 온라인 화면이 함께 씀. */
import { useRef, type ReactNode } from 'react'
import { CardSlot, PlayingCard, sortCards, useElementWidth, type Card } from '../../cards'
import { canTakeDiscard, topDiscard, type HulaState } from './logic'
import './hula.css'

/** 위쪽 사람 목록: 손패 수·벌점·등록 여부 */
export function HulaPlayers({ s, active }: { s: HulaState; active: number[] }) {
  const { players } = s
  return (
    <ul className="hula-players">
      {players.map((p, i) => (
        <li key={i} className={`hula-player ${active.includes(i) ? 'active' : ''}`} style={{ ['--seat' as string]: `var(--p${i + 1})` }}>
          <span className="hula-pname">
            {p.isAI ? '🤖' : ''}
            {p.name}
          </span>
          <span className="hula-pinfo">
            🂠 {s.hands[i].length} · 벌점 {s.scores[i]}
            {s.registered[i] && <span className="hula-reg">등록</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** 더미·버린 카드·라운드, 상태줄, 등록된 멜드, 최근 기록 */
export function HulaTable({
  s,
  canDraw,
  onDraw,
  onTake,
  status,
  attachable,
  onAttach,
}: {
  s: HulaState
  /** 지금 더미/버린 카드를 누를 수 있음 */
  canDraw: boolean
  onDraw: () => void
  onTake: () => void
  status: ReactNode
  attachable: Set<number>
  onAttach: (meldId: number) => void
}) {
  const { players } = s
  const top = topDiscard(s)
  return (
    <div className="hula-table felt">
      <div className="hula-piles">
        <button className="hula-pile" disabled={!canDraw} onClick={onDraw} aria-label="더미에서 뽑기">
          {s.deck.length ? <PlayingCard faceDown width={54} back="red" /> : <CardSlot width={54} label="없음" />}
          <span>더미 {s.deck.length}</span>
        </button>
        <button className="hula-pile" disabled={!canDraw || !top} onClick={onTake} aria-label="버린 카드 가져오기">
          {top ? <PlayingCard card={top} width={54} highlight={canDraw && canTakeDiscard(s)} /> : <CardSlot width={54} />}
          <span>버린 카드</span>
        </button>
        <div className="hula-round">
          <strong>
            {s.round} / {s.totalRounds}
          </strong>
          <span>라운드</span>
        </div>
      </div>
      <div className="status hula-status">{status}</div>
      {s.melds.length > 0 ? (
        <div className="hula-melds">
          {s.melds.map((m) => (
            <button
              key={m.id}
              className={`hula-meld ${attachable.has(m.id) ? 'target' : ''}`}
              style={{ ['--seat' as string]: `var(--p${m.owner + 1})` }}
              disabled={!attachable.has(m.id)}
              onClick={() => onAttach(m.id)}
              aria-label={`${players[m.owner].name}의 등록 카드`}
            >
              {m.cards.map((c) => (
                <PlayingCard key={c.id} card={c} width={32} className="hula-meld-card" />
              ))}
            </button>
          ))}
        </div>
      ) : (
        <p className="hula-empty">아직 등록된 카드가 없어요</p>
      )}
      <ul className="hula-log">
        {s.log.slice(-3).map((l, k) => (
          <li key={`${s.log.length}-${k}`}>{l}</li>
        ))}
      </ul>
    </div>
  )
}

export function Hand({ cards, sel, mustUse, onTap }: { cards: Card[]; sel: string[]; mustUse: string | null; onTap?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useElementWidth(ref, 320)
  const cw = 54
  const step = cards.length > 1 ? Math.min(cw + 6, (width - cw) / (cards.length - 1)) : 0
  return (
    <div className="hula-hand" ref={ref} style={{ height: cw * 1.4 + 14 }}>
      {cards.map((c, k) => (
        <PlayingCard
          key={c.id}
          card={c}
          width={cw}
          selected={sel.includes(c.id)}
          highlight={c.id === mustUse}
          onClick={onTap ? () => onTap(c.id) : undefined}
          className="hula-hand-card"
          style={{ left: k * step }}
        />
      ))}
    </div>
  )
}

export function RoundSummary({ s, children }: { s: HulaState; children: ReactNode }) {
  const r = s.result!
  const title =
    r.reason === 'stop'
      ? `스톱! ${r.winners.map((w) => s.players[w].name).join(', ')} 승리`
      : r.hula
        ? `🌺 훌라! ${s.players[r.winner!].name} 승리 (벌점 2배)`
        : `🎉 ${s.players[r.winner!].name} 승리!`
  return (
    <div className="hula-summary card-panel">
      <h3>{title}</h3>
      <ul>
        {s.players.map((p, i) => (
          <li key={i}>
            <div className="hula-sum-head">
              <span>
                {p.isAI ? '🤖 ' : ''}
                {p.name}
              </span>
              <span>
                {r.penalties[i] > 0 ? <strong className="hula-pen">+{r.penalties[i]}</strong> : <strong className="hula-win">0</strong>}
                <span className="muted"> (합계 {s.scores[i]})</span>
              </span>
            </div>
            <div className="hula-sum-cards">
              {sortCards(s.hands[i]).map((c) => (
                <PlayingCard key={c.id} card={c} width={28} />
              ))}
              {s.hands[i].length === 0 && <span className="muted">다 털었어요!</span>}
            </div>
          </li>
        ))}
      </ul>
      {children}
    </div>
  )
}
