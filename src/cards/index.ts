/**
 * Shared playing-card (트럼프 카드) toolkit. Import from 'src/cards' in any card game:
 *
 *   import { createDeck, shuffleDeck, deal, PlayingCard, CardSlot } from '../../cards'
 *
 * - deck.ts        Card/Suit/Rank types, createDeck (multi-deck, jokers), shuffleDeck (seedable),
 *                  draw/deal, labels (cardLabel "♠A", cardNameKo "스페이드 A"), sortCards, parseCards.
 * - poker.ts       evaluate5 / bestHand (5–7 cards) / compareHands / winners / describeHand,
 *                  Korean hand names (원페어 … 로열 스트레이트 플러시).
 * - PlayingCard    SVG card face/back, sizes via `width`, selected/disabled/highlight/faceDown;
 *                  CardSlot for empty piles; SuitShape for drawing suit symbols anywhere.
 * - drag.ts        useCardDrag: tap / double-tap / pointer drag-and-drop between `[data-drop]` piles.
 * - hooks.ts       useStopwatch, formatTime, useElementWidth, useViewportHeight.
 * - ui.tsx         SolitaireBar (timer · moves · best · undo · new), Celebration (win confetti).
 * Styles: cards.css (class prefix `pc-`), imported automatically by the components.
 */
export * from './deck'
export * from './poker'
export * from './drag'
export { PlayingCard, CardSlot, SuitShape, type PlayingCardProps, type CardBack } from './PlayingCard'
export { useStopwatch, formatTime, useElementWidth, useViewportHeight } from './hooks'
export { SolitaireBar, Celebration } from './ui'
