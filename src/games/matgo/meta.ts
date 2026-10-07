import type { GameMeta } from '../../lib/types'
import { rulesFor } from '../gostop-core/rules'

export const meta: GameMeta = {
  id: 'matgo',
  name: '맞고',
  emoji: '🎴',
  category: 'hwatu',
  players: '2명',
  solo: true,
  description: '둘이서 치는 고스톱! 7점을 내고 고를 외칠지 스톱할지 승부하세요',
  rules: rulesFor('matgo'),
  load: () => import('./index'),
}
