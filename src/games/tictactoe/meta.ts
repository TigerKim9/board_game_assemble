import type { GameMeta } from '../../lib/types'

export const meta: GameMeta = {
  id: 'tictactoe',
  name: '틱택토',
  emoji: '⭕',
  category: 'board',
  players: '1~2명',
  solo: true,
  description: '3×3 칸에 ⭕와 ✕를 번갈아 그려 먼저 한 줄을 만드는 게임',
  rules: [
    '두 사람이 번갈아 3×3 칸 중 빈칸에 자기 표시(⭕ 또는 ✕)를 그려요.',
    '가로·세로·대각선으로 자기 표시 3개를 먼저 한 줄로 만들면 이겨요.',
    '9칸이 다 찼는데 아무도 한 줄을 못 만들면 무승부예요.',
    '판마다 먼저 두는 사람이 번갈아 바뀌고, 전적이 쌓여요.',
    '컴퓨터 ‘어려움’은 절대 지지 않아요. 비기기만 해도 대단한 거예요!',
  ],
  load: () => import('./index'),
}
