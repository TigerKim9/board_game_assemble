import type { GameMeta } from '../../lib/types'

export const meta: GameMeta = {
  id: 'roulette',
  name: '룰렛 돌림판',
  emoji: '🎡',
  category: 'party',
  players: '2~12 항목',
  solo: true,
  description: '점심 메뉴부터 벌칙까지, 돌림판을 빙글빙글 돌려 정해요',
  rules: [
    '항목을 2~12개까지 적을 수 있어요. "편집"을 눌러 고치거나, 준비된 묶음(점심 메뉴, 벌칙 등)을 골라 보세요.',
    '적은 항목은 자동으로 저장돼서 다음에 와도 그대로 있어요.',
    '가운데 "돌려!" 버튼이나 아래 버튼을 누르면 돌림판이 돌다가 천천히 멈춰요.',
    '맨 위 빨간 바늘이 가리키는 칸이 결과예요. 모든 칸이 뽑힐 확률은 똑같아요.',
    '"뽑힌 항목은 다음 판에서 빼기"를 켜면 순서 정하기나 당번 나누기에 딱 좋아요.',
  ],
  load: () => import('./index'),
}
