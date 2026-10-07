import type { GameMeta } from '../../lib/types'

export const meta: GameMeta = {
  id: 'lottery',
  name: '제비뽑기',
  emoji: '🎟️',
  category: 'party',
  players: '2~20명',
  solo: false,
  description: '접힌 제비를 한 장씩 골라 펼쳐 보는 두근두근 뽑기',
  rules: [
    '제비 수(=인원)와 당첨 개수를 정해요. "직접 입력"을 고르면 1등·2등·청소 당번처럼 원하는 내용을 한 줄에 하나씩 적을 수 있어요.',
    '적은 내용이 제비 수보다 적으면 나머지는 "꽝"으로 채워져요.',
    '제비는 무작위로 섞여 모두 똑같이 접힌 모습으로 놓여요.',
    '한 사람씩 돌아가며 제비를 하나 눌러 펼쳐요. 몇 번째로 뽑았는지도 함께 기록돼요.',
    '당첨/꽝 모드에서는 남은 당첨 개수가 표시돼서 끝까지 긴장감이 넘쳐요.',
    '모두 뽑으면 순서대로 정리된 결과표가 나와요.',
  ],
  load: () => import('./index'),
}
