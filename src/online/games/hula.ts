import type { Card } from '../../cards/deck'
import {
  aiAction,
  aiWantsThankYou,
  applyHula,
  canTakeDiscard,
  claimThankYou,
  isGameOver,
  newGame,
  nextRound,
  passThankYou,
  type HulaAction,
  type HulaState,
} from '../../games/hula/logic'
import { assertLegal, type GameResult, type OnlineGame } from '../engine'

export const HULA_ROUNDS = 3

export type HulaOnlineAction = HulaAction | { type: 'thank' } | { type: 'pass' } | { type: 'next' }

export interface HulaOnline {
  s: HulaState
  /** 땡큐 기회에서 넘긴 사람 / 땡큐를 외친 사람 */
  passed: number[]
  claimed: number[]
  /** 라운드가 끝난 뒤 '다음 라운드'를 누른 사람 */
  ready: boolean[]
}

export type HulaView = HulaOnline

/**
 * 플레이어 이름은 "#1"…처럼 자리 표시로 두고(로직의 기록 문장에 들어감) 화면에서 실제 이름으로 바꿈.
 */
export const seatToken = (i: number) => `#${i + 1}`

const hidden = (tag: string, k: number): Card => ({ id: `x${tag}-${k}`, suit: 'S', rank: 0 })

/** 땡큐 기회: 차례가 빠른 후보부터 — 앞 사람이 모두 넘겼고 내가 땡큐했으면 내가 가져감 */
function resolveThankYou(o: HulaOnline): HulaOnline {
  const { s } = o
  for (const q of s.thankQueue) {
    if (o.passed.includes(q)) continue
    if (o.claimed.includes(q)) return { ...o, s: claimThankYou({ ...s, thankQueue: [q] }, q), passed: [], claimed: [] }
    return o // 앞 사람이 아직 고르는 중
  }
  return { ...o, s: passThankYou({ ...s, thankQueue: s.thankQueue.slice(-1) }), passed: [], claimed: [] }
}

export const hula: OnlineGame<HulaOnline, HulaOnlineAction, HulaView> = {
  id: 'hula',
  name: '훌라',
  emoji: '🌺',
  minPlayers: 2,
  maxPlayers: 4,
  bots: true,
  setup(n, rng) {
    const players = Array.from({ length: n }, (_, i) => ({ name: seatToken(i), isAI: false }))
    const s = newGame(players, HULA_ROUNDS, Math.floor(rng() * n), rng)
    return { s, passed: [], claimed: [], ready: players.map(() => false) }
  },
  toAct({ s, passed, claimed, ready }) {
    if (isGameOver(s)) return []
    if (s.phase === 'roundEnd') return ready.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0)
    if (s.phase === 'thankyou') return s.thankQueue.filter((i) => !passed.includes(i) && !claimed.includes(i))
    return [s.turn]
  },
  apply(o, seat, a, rng) {
    const { s } = o
    assertLegal(!isGameOver(s), '게임이 끝났어요')
    assertLegal(a && typeof a === 'object', '잘못된 행동이에요')
    if (a.type === 'next') {
      assertLegal(s.phase === 'roundEnd' && !o.ready[seat], '지금은 다음 라운드로 넘어갈 수 없어요')
      const ready = o.ready.map((r, i) => r || i === seat)
      if (!ready.every(Boolean)) return { ...o, ready }
      return { ...o, s: nextRound(s, rng), ready: ready.map(() => false) }
    }
    if (a.type === 'thank' || a.type === 'pass') {
      assertLegal(s.phase === 'thankyou' && s.thankQueue.includes(seat), '지금은 땡큐할 수 없어요')
      assertLegal(!o.passed.includes(seat) && !o.claimed.includes(seat), '이미 골랐어요')
      const next = a.type === 'thank' ? { ...o, claimed: [...o.claimed, seat] } : { ...o, passed: [...o.passed, seat] }
      return resolveThankYou(next)
    }
    assertLegal(s.turn === seat && (s.phase === 'draw' || s.phase === 'play'), '지금은 내 차례가 아니에요')
    let action: HulaAction
    switch (a.type) {
      case 'draw':
        assertLegal(s.phase === 'draw', '이미 카드를 가져왔어요')
        action = { type: 'draw' }
        break
      case 'take':
        assertLegal(s.phase === 'draw', '이미 카드를 가져왔어요')
        assertLegal(canTakeDiscard(s), '버린 카드는 바로 등록·붙이기할 수 있을 때만 가져올 수 있어요')
        action = { type: 'take' }
        break
      case 'register': {
        assertLegal(s.phase === 'play', '먼저 카드를 뽑으세요')
        const ids = a.ids
        assertLegal(Array.isArray(ids) && ids.length > 0 && ids.length <= 13 && ids.every((x) => typeof x === 'string'), '등록할 카드를 고르세요')
        assertLegal(new Set(ids).size === ids.length, '같은 카드를 두 번 고를 수 없어요')
        action = { type: 'register', ids: ids.slice() }
        break
      }
      case 'attach':
        assertLegal(s.phase === 'play', '먼저 카드를 뽑으세요')
        assertLegal(s.registered[seat], '붙이기는 한 번 등록한 뒤에 할 수 있어요')
        assertLegal(typeof a.cardId === 'string' && Number.isInteger(a.meldId), '잘못된 붙이기예요')
        action = { type: 'attach', cardId: a.cardId, meldId: a.meldId }
        break
      case 'discard':
        assertLegal(s.phase === 'play', '먼저 카드를 뽑으세요')
        assertLegal(!s.mustUse, '가져온 카드를 먼저 등록하거나 붙이세요')
        assertLegal(typeof a.cardId === 'string', '버릴 카드를 고르세요')
        action = { type: 'discard', cardId: a.cardId }
        break
      default:
        assertLegal(false, '잘못된 행동이에요')
    }
    const next = applyHula(s, action)
    assertLegal(
      next !== s,
      action.type === 'register' ? '등록할 수 없는 조합이에요' : action.type === 'attach' ? '거기에는 붙일 수 없어요' : '그 카드가 손에 없어요',
    )
    return { ...o, s: next }
  },
  view(o, seat) {
    const { s } = o
    const reveal = s.phase === 'roundEnd'
    const hands = s.hands.map((h, i) => (i === seat || reveal ? h : h.map((_, k) => hidden(String(i), k))))
    return { ...o, s: { ...s, hands, deck: s.deck.map((_, k) => hidden('d', k)) } }
  },
  result({ s }): GameResult | null {
    if (!isGameOver(s)) return null
    const low = Math.min(...s.scores)
    return {
      winners: s.scores.map((v, i) => (v === low ? i : -1)).filter((i) => i >= 0),
      scores: s.scores,
      lowerIsBetter: true,
      summary: `${s.totalRounds}라운드 끝 — 벌점이 가장 적은 사람이 우승`,
    }
  },
  bot(o, seat, rng) {
    const { s } = o
    if (s.phase === 'roundEnd') return { type: 'next' }
    if (s.phase === 'thankyou') return aiWantsThankYou(s, seat, 'normal', rng) ? { type: 'thank' } : { type: 'pass' }
    return aiAction(s, 'normal', rng)
  },
}
