import {
  BET_LABEL,
  ROUND_LABEL,
  START_CHIPS,
  advance,
  aiBet,
  aiChoice,
  applyBet,
  choose,
  createTable,
  namedBets,
  solvent,
  startHand,
  type BetName,
  type SCard,
  type Table,
} from '../../games/sevenpoker/logic'
import { assertLegal, type GameResult, type OnlineGame, type Rng } from '../engine'
import { HOST_SEAT, hiddenCard, type HoldemLog } from './holdem'

export type SevenAction = { type: 'choose'; discard: number; open: number } | { type: 'bet'; name: BetName } | { type: 'next' } | { type: 'end' }

export interface SevenOnline {
  t: Table
  ended: boolean
  log: HoldemLog[]
}

export type SevenView = SevenOnline

const pushLog = (log: HoldemLog[], ...items: HoldemLog[]) => [...log, ...items].slice(-8)

/** 카드 돌리기·정산('advance')은 온라인에서 바로 진행 */
function settle(s: SevenOnline, prev: Table): SevenOnline {
  let { t, log } = s
  let guard = 0
  while (t.phase === 'advance' && guard++ < 10) t = advance(t)
  if (t.phase === 'done' && prev.phase !== 'done') {
    const o = t.outcome!
    log = pushLog(log, ...o.winners.map((w) => ({ seat: w, text: `+${o.won[w]}칩${o.showdown && o.hands[w] ? ` (${o.hands[w]!.name})` : ''}` })))
  } else if (t.phase === 'betting' && t.round !== prev.round) log = pushLog(log, { seat: null, text: `${ROUND_LABEL[t.round] ?? ''} 카드를 받았어요` })
  return { ...s, t, log }
}

function newHand(s: SevenOnline, rng: Rng): SevenOnline {
  const t = startHand(s.t, rng)
  return { ...s, t, log: pushLog(s.log, { seat: null, text: `${t.handNo}번째 판 — 초이스: 1장 버리고 1장 공개` }) }
}

export const isSevenOver = (s: SevenOnline) => s.ended || (s.t.phase === 'done' && solvent(s.t).length < 2)

export const sevenpoker: OnlineGame<SevenOnline, SevenAction, SevenView> = {
  id: 'sevenpoker',
  name: '세븐 포커',
  emoji: '🃏',
  minPlayers: 2,
  maxPlayers: 7,
  bots: true,
  setup(n, rng) {
    const players = Array.from({ length: n }, (_, i) => ({ name: `${i + 1}번`, isAI: false, stack: START_CHIPS }))
    return newHand({ t: createTable(players, Math.floor(rng() * n)), ended: false, log: [] }, rng)
  },
  toAct(s) {
    const t = s.t
    if (isSevenOver(s)) return []
    if (t.phase === 'done') return [HOST_SEAT]
    if (t.phase === 'choice') return t.chosen.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0)
    return t.phase === 'betting' && t.bet.turn >= 0 ? [t.bet.turn] : []
  },
  apply(s, seat, a, rng) {
    assertLegal(!isSevenOver(s), '게임이 끝났어요')
    assertLegal(a && typeof a === 'object', '잘못된 행동이에요')
    const t = s.t
    switch (a.type) {
      case 'next':
      case 'end':
        assertLegal(t.phase === 'done' && seat === HOST_SEAT, '판이 끝난 뒤 방장만 할 수 있어요')
        if (a.type === 'end') return { ...s, ended: true, log: pushLog(s.log, { seat, text: '게임을 끝냈어요' }) }
        return newHand(s, rng)
      case 'choose': {
        assertLegal(t.phase === 'choice' && !t.chosen[seat], '지금은 초이스할 수 없어요')
        const n = t.cards[seat].length
        const ok = (k: unknown) => Number.isInteger(k) && (k as number) >= 0 && (k as number) < n
        assertLegal(ok(a.discard) && ok(a.open) && a.discard !== a.open, '버릴 카드와 공개할 카드를 서로 다르게 골라 주세요')
        const next = choose(t, seat, a.discard, a.open)
        return settle({ ...s, t: next, log: pushLog(s.log, { seat, text: '초이스 완료' }) }, t)
      }
      case 'bet': {
        assertLegal(t.phase === 'betting' && t.bet.turn === seat, '지금은 내 차례가 아니에요')
        const b = namedBets(t, seat).find((x) => x.name === a.name)
        assertLegal(b, '지금은 그 베팅을 할 수 없어요')
        const next = applyBet(t, a.name)
        const text = next.last[seat] ?? BET_LABEL[a.name]
        return settle({ ...s, t: next, log: pushLog(s.log, { seat, text: b.pay > 0 ? `${text} ${b.pay}` : text }) }, t)
      }
    }
    assertLegal(false, '잘못된 행동이에요')
  },
  view(s, seat) {
    const t = s.t
    const showdown = t.phase === 'done' && !!t.outcome?.showdown
    const live = (i: number) => !t.bet.seats[i].out && !t.bet.seats[i].folded
    const cards = t.cards.map((h, i): SCard[] => {
      if (i === seat || (showdown && live(i))) return h
      // 초이스 중에는 남의 고른 카드(공개할 카드)도 아직 숨김
      if (t.phase === 'choice') return h.map((_, k) => ({ card: hiddenCard(i, k), open: false }))
      return h.map((c, k) => (c.open ? c : { card: hiddenCard(i, k), open: false }))
    })
    return { ...s, t: { ...t, deck: [], cards } }
  },
  result(s): GameResult | null {
    if (!isSevenOver(s)) return null
    const stacks = s.t.players.map((p) => p.stack)
    const top = Math.max(...stacks)
    return {
      winners: stacks.map((v, i) => (v === top ? i : -1)).filter((i) => i >= 0),
      scores: stacks,
      summary: s.ended ? `방장이 ${s.t.handNo}판에서 게임을 끝냈어요 — 칩이 가장 많은 사람 승리` : `${s.t.handNo}판 만에 모든 칩을 땄어요!`,
    }
  },
  bot(s, seat, rng) {
    const t = s.t
    if (t.phase === 'done') return { type: 'next' }
    if (t.phase === 'choice') {
      const c = aiChoice(
        t.cards[seat].map((x) => x.card),
        'normal',
        rng,
      )
      return { type: 'choose', discard: c.discard, open: c.open }
    }
    return { type: 'bet', name: aiBet(t, 'normal', rng) }
  },
}
