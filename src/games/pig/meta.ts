import type { GameMeta } from '../../lib/types'

export const meta: GameMeta = {
  id: 'pig',
  name: '피그',
  emoji: '🐷',
  category: 'dice',
  players: '1~6명',
  solo: true,
  description: '주사위 하나로 즐기는 욕심 조절 게임. 1만 피하면 계속 굴려도 돼요!',
  rules: [
    '자기 차례에 주사위 하나를 원하는 만큼 굴려요. 나온 눈은 이번 차례 점수에 더해져요.',
    '1이 나오면 이번 차례에 모은 점수를 모두 잃고 차례가 넘어가요.',
    '"멈추기"를 누르면 이번 차례 점수를 총점에 저장하고 차례를 넘겨요.',
    '총점 100점에 먼저 도달하는 사람이 이겨요.',
    '혼자 하면 몇 번의 차례 만에 100점을 만드는지 기록에 도전해요. 적을수록 좋아요!',
  ],
  load: () => import('./index'),
}
