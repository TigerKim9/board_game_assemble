/** 블랙잭 presentational pieces shared by local and online play: a row of overlapping cards and one player hand. */
import { PlayingCard, type Card } from '../../cards'
import { OUTCOME_LABEL, handValue, totalLabel, type Hand } from './logic'

export function HandView({ hand, active }: { hand: Hand; active: boolean }) {
  const bust = handValue(hand.cards).total > 21
  return (
    <div className={`blackjack-hand ${active ? 'active' : ''}`}>
      <CardRow cards={hand.cards} width={50} />
      <div className="blackjack-hand-info">
        <span className="blackjack-total">{totalLabel(hand.cards)}</span>
        <span className="blackjack-handbet">
          {hand.bet}
          {hand.doubled ? ' (더블)' : ''}
        </span>
        {hand.outcome ? (
          <span className={`blackjack-badge ${hand.outcome}`}>{OUTCOME_LABEL[hand.outcome]}</span>
        ) : bust ? (
          <span className="blackjack-badge bust">버스트</span>
        ) : hand.cards.length === 2 && !hand.split && handValue(hand.cards).total === 21 ? (
          <span className="blackjack-badge blackjack">블랙잭!</span>
        ) : null}
      </div>
    </div>
  )
}

export function CardRow({ cards, width, hideFrom = 99 }: { cards: readonly Card[]; width: number; hideFrom?: number }) {
  const step = width * 0.58
  return (
    <div
      className="blackjack-cards"
      style={{
        width: cards.length ? width + (cards.length - 1) * step : width,
        height: width * 1.4,
      }}
    >
      {cards.map((c, i) => (
        <div key={c.id + i} className="blackjack-card" style={{ left: i * step }}>
          <PlayingCard card={c} faceDown={i >= hideFrom} width={width} back="red" />
        </div>
      ))}
    </div>
  )
}
