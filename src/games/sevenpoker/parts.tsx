/** 세븐 포커 화면 조각 — 로컬 게임과 온라인 화면이 함께 씀. */
import { useState } from 'react'
import { PlayingCard, bestHand, describeHand, rankValue, type Card } from '../../cards'
import { formatChips, potTotal } from '../poker-core'
import { Chips } from '../poker-core/ui'
import { BET_LABEL, ROUND_LABEL, namedBets, sevenOf, type BetName, type Table } from './logic'
import './sevenpoker.css'

/** 5장 미만일 때 대략적인 족보 이름 */
export function roughName(cards: Card[]): string {
  if (cards.length >= 5) return describeHand(bestHand(cards))
  const cnt = new Map<number, number>()
  for (const c of cards) cnt.set(c.rank, (cnt.get(c.rank) ?? 0) + 1)
  const counts = [...cnt.values()].sort((a, b) => b - a)
  if (counts[0] === 4) return '포카드'
  if (counts[0] === 3) return '트리플'
  if (counts[0] === 2 && counts[1] === 2) return '투페어'
  if (counts[0] === 2) return '원페어'
  const top = Math.max(...cards.map((c) => rankValue(c.rank, true)))
  const name = top === 14 ? 'A' : top === 13 ? 'K' : top === 12 ? 'Q' : top === 11 ? 'J' : String(top)
  return `${name} 하이`
}

/** 테이블: 판돈 + 좌석별 카드 + 상태줄 */
export function SevenTable({ t, canSee, bossSeat, status }: { t: Table; canSee: (i: number) => boolean; bossSeat: number; status: string }) {
  const { players, bet, phase, outcome } = t
  const turn = bet.turn
  const winCards = winningCards(t)
  const pot = potTotal(bet)
  return (
    <div className="sevenpoker-table felt">
      <div className="sevenpoker-pot">
        <span>
          판돈 <Chips amount={pot} />
        </span>
        <span className="sevenpoker-round">{phase === 'choice' ? '초이스' : (ROUND_LABEL[t.round] ?? '')}</span>
        {t.community && (
          <span className="sevenpoker-community">
            공용 <PlayingCard card={t.community} width={30} highlight={winCards.has(t.community.id)} />
          </span>
        )}
      </div>
      <ul className="sevenpoker-seats">
        {players.map((p, i) => {
          const s = bet.seats[i]
          const won = phase === 'done' && (outcome?.winners.includes(i) ?? false)
          const hand = phase === 'done' ? outcome?.hands[i] : null
          const isTurn = phase === 'betting' && i === turn
          return (
            <li
              key={i}
              className={`sevenpoker-seat ${isTurn ? 'turn' : ''} ${s.folded || s.out ? 'out' : ''} ${won ? 'won' : ''}`}
              style={{ ['--seat' as string]: `var(--p${(i % 6) + 1})` }}
            >
              <div className="sevenpoker-seat-head">
                <span className="sevenpoker-name">
                  {i === bossSeat && <span title="보스">👑</span>}
                  {p.isAI ? '🤖' : ''}
                  {p.name}
                </span>
                <Chips amount={s.stack} className="sevenpoker-stack" />
                <span className="sevenpoker-tagbox">
                  {won ? (
                    <span className="sevenpoker-tag win">+{formatChips(outcome!.won[i])}</span>
                  ) : hand ? (
                    <span className="sevenpoker-tag hand">{hand.name}</span>
                  ) : isTurn && p.isAI ? (
                    <span className="sevenpoker-tag thinking">…</span>
                  ) : phase === 'choice' && !s.out ? (
                    <span className="sevenpoker-tag">{t.chosen[i] ? '선택 완료' : '고르는 중'}</span>
                  ) : t.last[i] ? (
                    <span className={`sevenpoker-tag ${s.folded ? 'die' : ''}`}>
                      {t.last[i]}
                      {s.bet > 0 && phase !== 'done' ? ` ${formatChips(s.bet)}` : ''}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="sevenpoker-row">
                {s.out ? (
                  <span className="muted sevenpoker-sitout">쉬는 중</span>
                ) : (
                  t.cards[i].map(({ card, open }) => (
                    <PlayingCard
                      key={card.id}
                      card={card}
                      faceDown={!open && !canSee(i)}
                      width={30}
                      back="green"
                      highlight={winCards.has(card.id)}
                      className={`${!open ? 'sevenpoker-hidden' : ''} sevenpoker-deal`}
                    />
                  ))
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="status sevenpoker-status">{status}</div>
    </div>
  )
}

/** 쇼다운에서 이긴 카드 id */
export function winningCards(t: Table): Set<string> {
  const winCards = new Set<string>()
  const o = t.outcome
  if (t.phase === 'done' && o?.showdown) for (const w of o.winners) o.hands[w]?.cards.forEach((c) => winCards.add(c.id))
  return winCards
}

/** 사이드 팟 결과 */
export function PotsDetail({ t }: { t: Table }) {
  const { phase, outcome, players } = t
  return (
    <>
      {phase === 'done' && outcome?.showdown && outcome.awards.length > 1 && (
        <ul className="sevenpoker-pots card-panel">
          {outcome.awards.map((a, k) => (
            <li key={k}>
              <span className="muted">{k === 0 ? '메인 팟' : `사이드 팟 ${k}`}</span> <Chips amount={a.amount} /> →{' '}
              <strong>{a.winners.map((w) => players[w].name).join(', ')}</strong>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function headline(t: Table): string {
  const o = t.outcome!
  if (!o.showdown) return `🎉 ${o.winners.map((w) => t.players[w].name).join(', ')} 판돈 획득!`
  const main = o.awards[0]
  if (main && main.winners.length > 1) return `🤝 ${main.winners.map((w) => t.players[w].name).join(', ')} 나눠 가짐`
  const w = main?.winners[0] ?? o.winners[0]
  const h = o.hands[w]
  return `🎉 ${t.players[w].name} 승리${h ? ` — ${describeHand(h)}` : ''}`
}

export function ChoicePanel({ cards, name, onDone }: { cards: Card[]; name: string; onDone: (discard: number, open: number) => void }) {
  const [discard, setDiscard] = useState<number | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const tap = (k: number) => {
    if (k === discard) setDiscard(null)
    else if (k === open) setOpen(null)
    else if (discard == null) setDiscard(k)
    else setOpen(k)
  }
  return (
    <div className="sevenpoker-choice card-panel">
      <div className="sevenpoker-choice-title">
        <strong>{name}님 초이스</strong>
        <span className="muted">{discard == null ? '① 버릴 카드를 누르세요' : open == null ? '② 공개할 카드를 누르세요' : '좋아요! 확인을 누르세요'}</span>
      </div>
      <div className="sevenpoker-choice-cards">
        {cards.map((c, k) => (
          <div key={c.id} className="sevenpoker-choice-slot">
            <PlayingCard card={c} width={66} selected={k === open} className={k === discard ? 'sevenpoker-discarded' : ''} onClick={() => tap(k)} />
            <span className={`sevenpoker-choice-label ${k === discard ? 'discard' : k === open ? 'open' : ''}`}>
              {k === discard ? '버림' : k === open ? '공개' : '히든'}
            </span>
          </div>
        ))}
      </div>
      <button className="btn primary big" disabled={discard == null || open == null} onClick={() => onDone(discard!, open!)}>
        확인
      </button>
    </div>
  )
}

export function MyCards({ t, seat, winCards }: { t: Table; seat: number; winCards: Set<string> }) {
  const s = t.bet.seats[seat]
  const cards = t.cards[seat]
  const all = sevenOf(t, seat)
  const name = all.length ? roughName(all) : ''
  return (
    <div className={`sevenpoker-me card-panel ${s.folded ? 'folded' : ''}`}>
      <div className="sevenpoker-me-cards">
        {cards.map(({ card, open }) => (
          <div key={card.id} className={`sevenpoker-me-slot ${open ? '' : 'hidden'}`}>
            <PlayingCard card={card} width={40} highlight={winCards.has(card.id)} />
            <span>{open ? '공개' : '히든'}</span>
          </div>
        ))}
      </div>
      <div className="sevenpoker-me-info">
        <span className="muted">{t.players[seat].name}님</span>
        <strong>{s.folded ? '다이했어요' : name}</strong>
        <Chips amount={s.stack} />
      </div>
    </div>
  )
}

const ORDER: BetName[] = ['die', 'check', 'call', 'bbing', 'ddadang', 'half', 'full']

export function BetButtons({ t, onBet }: { t: Table; onBet: (b: BetName) => void }) {
  const bets = namedBets(t)
  return (
    <div className="sevenpoker-bets">
      {ORDER.map((name) => {
        const b = bets.find((x) => x.name === name)
        return (
          <button
            key={name}
            className={`btn ${name === 'die' ? 'danger' : name === 'call' || name === 'check' ? 'primary' : name === 'half' || name === 'full' ? 'accent' : ''}`}
            disabled={!b}
            onClick={() => b && onBet(name)}
          >
            <span>{b?.allIn && name !== 'die' && name !== 'check' ? '올인' : BET_LABEL[name]}</span>
            {b && b.pay > 0 && <small>{formatChips(b.pay)}</small>}
          </button>
        )
      })}
    </div>
  )
}
