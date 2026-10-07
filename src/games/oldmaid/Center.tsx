/** 도둑잡기 table centre: last discarded pair, pair count and the card I just drew / lost. Shared by local and online play. */
import type { ReactNode } from 'react'
import { PlayingCard, type Card } from '../../cards'

export interface DrawnInfo {
  card: Card
  /** The card was taken from me (rather than drawn by me). */
  lost: boolean
  text: ReactNode
}

export function OldMaidCenter({ lastPair, pairs, drawn }: { lastPair: Card[] | null; pairs: number; drawn: DrawnInfo | null }) {
  return (
    <div className="oldmaid-center">
      <div className="oldmaid-pairs">
        {lastPair ? (
          <div className="oldmaid-pair" key={lastPair[1].id}>
            <PlayingCard card={lastPair[0]} width={46} />
            <PlayingCard card={lastPair[1]} width={46} />
          </div>
        ) : (
          <div className="oldmaid-pair-empty" />
        )}
        <span>버린 짝 {pairs}쌍</span>
      </div>
      {drawn && (
        <div className={`oldmaid-drawn ${drawn.lost ? 'lost' : ''}`} key={drawn.card.id}>
          <PlayingCard card={drawn.card} width={58} />
          <span>{drawn.text}</span>
        </div>
      )}
    </div>
  )
}
