/**
 * 화투 공용 모듈. 맞고·고스톱·섯다 등 화투 게임에서 함께 씁니다.
 * - 데이터/규칙 도우미: ./deck (카드 id 규칙과 필드 설명은 deck.ts 상단 주석 참고)
 * - 그림: <HwatuCard card={id} width={48} />, <HwatuPile count={n} />
 * - 카드 모양 설정(쉬운 보기/클래식): <HwatuStyleToggle />(설정 화면), <HwatuStyleButton />(게임 중)
 * - 먹은 패/바닥 UI: <CaptureRows />, <ProgressChips />, <FloorGroups />
 */
export * from './deck'
export { HwatuCard, HwatuPile, type HwatuCardProps } from './HwatuCard'
export { HwatuStyleButton, HwatuStyleToggle, setHwatuStyle, useHwatuStyle, type HwatuStyle } from './style'
export { MONTH_COLORS, kindStyle } from './easy'
export { CaptureRows, FloorGroups, ProgressChips, type Progress } from './ui'
