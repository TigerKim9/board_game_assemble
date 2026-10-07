import { describe, expect, it } from 'vitest'
import { bestHand, createDeck, parseCards, shuffleDeck } from '../../cards'
import { mulberry32 } from '../../lib/random'
import { codes, handScore, partialScore, score, scoreCategory } from './eval'

const sc = (s: string) => score(codes(parseCards(s)))

describe('fast evaluator', () => {
  it('ranks categories in order', () => {
    const hands = [
      'AS KD 9H 7C 3S 2D 4H', // 하이
      'AS AD 9H 7C 3S 2D 5H', // 원페어
      'AS AD 9H 9C 3S 2D 5H', // 투페어
      'AS AD AH 9C 3S 2D 5H', // 트리플
      'AS 2D 3H 4C 5S 9D JH', // 백 스트레이트
      'AS KS 9S 7S 3S 2D 4H', // 플러시
      'AS AD AH 9C 9S 2D 5H', // 풀하우스
      'AS AD AH AC 9S 2D 5H', // 포카드
      '9S 8S 7S 6S 5S 2D 4H', // 스트레이트 플러시
      'AS KS QS JS TS 2D 4H', // 로열
    ].map(sc)
    for (let i = 1; i < hands.length; i++) expect(hands[i]).toBeGreaterThan(hands[i - 1])
    expect(scoreCategory(hands[0])).toBe(0)
    expect(scoreCategory(hands[9])).toBe(8)
  })

  it('handles kickers, three pairs and two trips', () => {
    expect(sc('AS AD KH KC QS QD 2H')).toBe(sc('AS AD KH KC QS 3D 2H'))
    expect(sc('9S 9D 9H 5C 5S 5D 2H')).toBe(sc('9S 9D 9H 5C 5S 2D 3H'))
    expect(sc('AS AD 9H 8C 7S 3D 2H')).toBeGreaterThan(sc('AS AD 9H 8C 6S 3D 2H'))
  })

  it('flush beats straight when both are present', () => {
    expect(scoreCategory(sc('5H 6H 7H 8D 9H 2H TS'))).toBe(5)
  })

  it('matches src/cards bestHand on random 5–7 card hands', () => {
    const rng = mulberry32(42)
    for (let t = 0; t < 3000; t++) {
      const n = 5 + (t % 3)
      const cards = shuffleDeck(createDeck(), rng).slice(0, n)
      expect(score(codes(cards))).toBe(handScore(bestHand(cards)))
    }
  })

  it('partial scores for open cards', () => {
    const p = (s: string) => partialScore(codes(parseCards(s)))
    expect(p('AS KD')).toBeLessThan(p('2S 2D'))
    expect(p('2S 2D 3H 3C')).toBeGreaterThan(p('AS AD KH QC'))
    expect(p('5S 5D 5H')).toBeGreaterThan(p('AS AD KH KC'))
    expect(p('KS')).toBeGreaterThan(p('QS'))
  })
})
