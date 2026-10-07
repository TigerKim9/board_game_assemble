import type { Card } from '../../cards/deck'
import { aiAction, advance, alive, applyAction, actionLabel, createTable, startHand, STREET_LABEL, TOURNEY_STACK, type Table } from '../../games/holdem/logic'
import { legalActions } from '../../games/poker-core'
import { assertLegal, type GameResult, type OnlineGame, type Rng } from '../engine'

/** 판이 끝난 뒤 다음 판을 시작하거나 게임을 끝낼 수 있는 자리(방을 만든 사람 = 0번) */
export const HOST_SEAT = 0

export type HoldemAction =
  | { type: 'bet'; kind: 'fold' | 'check' | 'call' }
  | { type: 'bet'; kind: 'raise'; to: number }
  | { type: 'next' }
  | { type: 'end' }

export interface HoldemLog {
  seat: number | null
  text: string
}

export interface HoldemOnline {
  t: Table
  /** 방장이 일찍 끝냄 */
  ended: boolean
  log: HoldemLog[]
}

export type HoldemView = HoldemOnline

/** 가려진 카드 자리(앞면 정보 없음) */
export const hiddenCard = (seat: number, k: number): Card => ({ id: `x${seat}-${k}`, suit: 'S', rank: 0 })

const pushLog = (log: HoldemLog[], ...items: HoldemLog[]) => [...log, ...items].slice(-8)

/** 'advance'(스트리트 넘김) 단계는 온라인에서 바로 진행 */
function settle(s: HoldemOnline): HoldemOnline {
  let t = s.t
  let log = s.log
  let guard = 0
  while (t.phase === 'advance' && guard++ < 10) {
    const before = t
    t = advance(t)
    if (t.phase === 'done') {
      const o = t.outcome!
      log = pushLog(
        log,
        ...o.winners.map((w) => ({
          seat: w,
          text: `+${o.won[w]}칩${o.showdown && o.hands[w] ? ` (${o.hands[w]!.name})` : ''}`,
        })),
      )
    } else if (t.street !== before.street) log = pushLog(log, { seat: null, text: `${STREET_LABEL[t.street]} 공개` })
  }
  return { ...s, t, log }
}

function newHand(s: HoldemOnline, rng: Rng): HoldemOnline {
  const t = startHand(s.t, rng)
  return settle({ ...s, t, log: pushLog(s.log, { seat: null, text: `${t.handNo}번째 판 · 블라인드 ${t.sb}/${t.bb}` }) })
}

export const isTourneyOver = (s: HoldemOnline) => s.ended || (s.t.phase === 'done' && alive(s.t).length < 2)

export const holdem: OnlineGame<HoldemOnline, HoldemAction, HoldemView> = {
  id: 'holdem',
  name: '텍사스 홀덤',
  emoji: '♠️',
  minPlayers: 2,
  maxPlayers: 9,
  bots: true,
  setup(n, rng) {
    const players = Array.from({ length: n }, (_, i) => ({ name: `${i + 1}번`, isAI: false, stack: TOURNEY_STACK }))
    const t = createTable(players, 'tournament', true, Math.floor(rng() * n))
    return newHand({ t, ended: false, log: [] }, rng)
  },
  toAct(s) {
    if (isTourneyOver(s)) return []
    if (s.t.phase === 'done') return [HOST_SEAT]
    return s.t.phase === 'betting' && s.t.bet.turn >= 0 ? [s.t.bet.turn] : []
  },
  apply(s, seat, a, rng) {
    assertLegal(!isTourneyOver(s), '게임이 끝났어요')
    assertLegal(a && typeof a === 'object', '잘못된 행동이에요')
    const t = s.t
    if (a.type === 'next' || a.type === 'end') {
      assertLegal(t.phase === 'done' && seat === HOST_SEAT, '판이 끝난 뒤 방장만 할 수 있어요')
      if (a.type === 'end') return { ...s, ended: true, log: pushLog(s.log, { seat, text: '게임을 끝냈어요' }) }
      return newHand(s, rng)
    }
    assertLegal(a.type === 'bet', '잘못된 행동이에요')
    assertLegal(t.phase === 'betting' && t.bet.turn === seat, '지금은 내 차례가 아니에요')
    const l = legalActions(t.bet, seat)
    if (a.kind === 'check') assertLegal(l.canCheck, '체크할 수 없어요 — 콜하거나 폴드하세요')
    else if (a.kind === 'call') assertLegal(l.canCall, '콜할 베팅이 없어요')
    else if (a.kind === 'raise') {
      assertLegal(l.raise, '지금은 레이즈할 수 없어요')
      assertLegal(Number.isInteger(a.to) && a.to >= l.raise.min && a.to <= l.raise.max, `${l.raise.min}~${l.raise.max} 사이로 걸어 주세요`)
    } else assertLegal(a.kind === 'fold', '잘못된 행동이에요')
    const action = a.kind === 'raise' ? { kind: 'raise' as const, to: a.to } : { kind: a.kind }
    const label = actionLabel(t, action)
    return settle({ ...s, t: applyAction(t, action), log: pushLog(s.log, { seat, text: label }) })
  },
  view(s, seat) {
    const t = s.t
    const showdown = t.phase === 'done' && !!t.outcome?.showdown
    const live = (i: number) => !t.bet.seats[i].out && !t.bet.seats[i].folded
    const holes = t.holes.map((h, i) => (i === seat || (showdown && live(i)) ? h : h.map((_, k) => hiddenCard(i, k))))
    return { ...s, t: { ...t, deck: [], holes } }
  },
  result(s): GameResult | null {
    if (!isTourneyOver(s)) return null
    const stacks = s.t.players.map((p) => p.stack)
    const top = Math.max(...stacks)
    const winners = stacks.map((v, i) => (v === top ? i : -1)).filter((i) => i >= 0)
    return {
      winners,
      scores: stacks,
      summary: s.ended ? `방장이 ${s.t.handNo}판에서 게임을 끝냈어요 — 칩이 가장 많은 사람 승리` : `${s.t.handNo}판 만에 모든 칩을 땄어요!`,
    }
  },
  bot(s, seat, rng) {
    if (s.t.phase === 'done') return { type: 'next' }
    const a = aiAction(s.t, 'normal', rng)
    const l = legalActions(s.t.bet, seat)
    if (a.kind === 'raise' && l.raise) return { type: 'bet', kind: 'raise', to: Math.max(l.raise.min, Math.min(l.raise.max, Math.floor(a.to))) }
    if (a.kind === 'raise' || (a.kind === 'check' && !l.canCheck) || (a.kind === 'call' && !l.canCall)) return { type: 'bet', kind: l.canCheck ? 'check' : 'call' }
    return { type: 'bet', kind: a.kind }
  },
}
