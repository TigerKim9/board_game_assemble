/**
 * 화투 공용 모듈. 맞고·고스톱·섯다 등 화투 게임에서 함께 씁니다.
 * - 데이터/규칙 도우미: ./deck (카드 id 규칙과 필드 설명은 deck.ts 상단 주석 참고)
 * - 그림: <HwatuCard card={id} width={48} />, <HwatuPile count={n} />
 */
export * from './deck'
export { HwatuCard, HwatuPile, type HwatuCardProps } from './HwatuCard'
