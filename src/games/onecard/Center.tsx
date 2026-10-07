/** 원카드 table centre (draw pile · top card · suit/direction/attack) and the 7 suit picker. Shared by local and online play. */
import { PlayingCard, SuitShape, type Card, type Suit } from '../../cards'
import { SUIT_KO } from './logic'

export function OneCardCenter({
  top,
  pileCount,
  suit,
  dir,
  attack,
  flip,
}: {
  top: Card
  pileCount: number
  /** Suit to follow (null = anything). */
  suit: Suit | null
  dir: 1 | -1
  attack: number
  /** Animate the top card (it was just played). */
  flip: boolean
}) {
  return (
    <div className="onecard-center">
      <div className="onecard-pile">
        <PlayingCard faceDown width={58} back="red" />
        <span className="onecard-count">{pileCount}장</span>
      </div>
      <div className={`onecard-discard ${flip ? 'flip' : ''}`} key={top.id}>
        <PlayingCard card={top} width={74} />
      </div>
      <div className="onecard-info">
        <div className="onecard-suit" title="따라낼 무늬">
          {suit ? (
            <svg viewBox="0 0 100 100" width="30" height="30" className={suit === 'H' || suit === 'D' ? 'red' : 'black'}>
              <SuitShape suit={suit} x={0} y={0} size={100} />
            </svg>
          ) : (
            <span className="onecard-free">자유</span>
          )}
        </div>
        <div className="onecard-dir" title="진행 방향">
          {dir === 1 ? '↻' : '↺'}
        </div>
        {attack > 0 && <div className="onecard-attack">+{attack}</div>}
      </div>
    </div>
  )
}

export function SuitPicker({ onPick, onCancel }: { onPick: (s: Suit) => void; onCancel: () => void }) {
  return (
    <div className="onecard-suits">
      <span>7! 바꿀 무늬를 고르세요</span>
      <div className="onecard-suit-row">
        {(['S', 'H', 'D', 'C'] as Suit[]).map((su) => (
          <button
            key={su}
            className={`btn onecard-suit-btn ${su === 'H' || su === 'D' ? 'red' : ''}`}
            onClick={() => onPick(su)}
          >
            {SUIT_KO[su]}
          </button>
        ))}
      </div>
      <button className="btn ghost small" onClick={onCancel}>
        취소
      </button>
    </div>
  )
}
