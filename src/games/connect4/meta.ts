import type { GameMeta } from '../../lib/types'

export const meta: GameMeta = {
  id: 'connect4',
  name: '사목',
  emoji: '🔴',
  category: 'board',
  players: '1~2명',
  solo: true,
  description: '세워진 판에 돌을 떨어뜨려 먼저 네 개를 잇는 게임',
  rules: [
    '가로 7줄, 세로 6칸짜리 세워진 판에서 두 사람이 번갈아 돌을 떨어뜨려요. 🔴 빨강이 먼저 둬요.',
    '줄(열)을 고르면 돌이 그 줄의 가장 아래 빈칸까지 떨어져요. 가득 찬 줄에는 넣을 수 없어요.',
    '가로·세로·대각선으로 내 돌 4개를 먼저 한 줄로 이으면 이겨요.',
    '판이 가득 찰 때까지 아무도 잇지 못하면 무승부예요.',
    '팁: 가운데 줄을 차지하면 연결할 수 있는 방향이 많아져 유리해요. 상대가 3개를 이었다면 꼭 막으세요!',
    '↶ 무르기로 내 직전 수까지 되돌릴 수 있어요.',
  ],
  load: () => import('./index'),
}
