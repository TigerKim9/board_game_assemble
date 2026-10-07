import type { GameMeta } from '../../lib/types'
import { rulesFor } from '../gostop-core/rules'

export const meta: GameMeta = {
  id: 'gostop',
  name: '고스톱',
  emoji: '🌸',
  category: 'hwatu',
  players: '3명',
  solo: true,
  description: '셋이서 치는 국민 화투 놀이. 3점부터 고·스톱, 뻑·쪽·따닥에 피박·광박까지',
  rules: rulesFor('gostop'),
  load: () => import('./index'),
}
