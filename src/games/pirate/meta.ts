import type { GameMeta } from '../../lib/types'

export const meta: GameMeta = {
  id: 'pirate',
  name: '해적 룰렛',
  emoji: '🏴‍☠️',
  category: 'party',
  players: '2~6명',
  solo: true,
  description: '술통 구멍에 번갈아 칼을 꽂아요. 해적이 튀어나오면 끝!',
  rules: [
    '술통에는 구멍이 여러 개 있고, 그중 딱 하나가 해적을 튀어나오게 하는 구멍이에요.',
    '차례대로 아직 비어 있는 구멍 하나를 골라 칼을 꽂아요.',
    '해적이 튀어나오게 만든 사람이 그 판의 주인공! 설정에 따라 "패배(벌칙)" 또는 "승리"가 돼요.',
    '구멍이 줄어들수록 확률이 올라가요. 화면에 현재 확률이 표시돼요.',
    '컴퓨터 자리를 섞으면 혼자서도 즐길 수 있어요. 다음 판은 해적을 튀어나오게 한 사람부터 시작해요.',
  ],
  load: () => import('./index'),
}
