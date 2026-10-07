import { getCard } from '../../hwatu/deck'
import { shuffle } from '../../lib/random'
import type { Difficulty } from '../../lib/types'

// ---------- 카드 ----------

/** 섯다용 20장: 1~10월, 각 달의 slot 0(광/열끗)과 slot 1(띠, 8월은 기러기) */
export const SEOTDA_IDS: number[] = Array.from({ length: 10 }, (_, m) => [m * 4, m * 4 + 1]).flat()

export const monthOfId = (id: number) => getCard(id).month as number
/** slot 0 카드: 1·3·8월은 광, 나머지는 열끗 */
export const isTop = (id: number) => id % 4 === 0
export const isGwang = (id: number) => getCard(id).kind === 'gwang'

const ID = {
  gwang1: 0,
  gwang3: 8,
  gwang8: 28,
  yeol4: 12,
  yeol7: 24,
  yeol9: 32,
}

// ---------- 족보 ----------

export type Special = 'ttaengjabi' | 'amhaeng' | 'gusa' | 'mgusa'

export interface Hand {
  /** 비교 점수 (특수패는 평소 끗 값) */
  score: number
  name: string
  special?: Special
}

export const SCORE = {
  sampal: 1000,
  ilpal: 910,
  ilsam: 900,
  ttaeng: 800, // + 월
  ali: 706,
  doksa: 705,
  gubbing: 704,
  jangbbing: 703,
  jangsa: 702,
  seryuk: 701,
}

const TTAENG_NAMES: Record<number, string> = {
  10: '장땡',
  1: '삥땡',
}

export function kkeutName(n: number): string {
  if (n === 9) return '갑오'
  if (n === 0) return '망통'
  return `${n}끗`
}

export function evaluate(cards: number[]): Hand {
  const [a, b] = cards
  const ma = monthOfId(a)
  const mb = monthOfId(b)
  const has = (id: number) => a === id || b === id
  const lo = Math.min(ma, mb)
  const hi = Math.max(ma, mb)
  if (has(ID.gwang3) && has(ID.gwang8)) return { score: SCORE.sampal, name: '38광땡' }
  if (has(ID.gwang1) && has(ID.gwang8)) return { score: SCORE.ilpal, name: '18광땡' }
  if (has(ID.gwang1) && has(ID.gwang3)) return { score: SCORE.ilsam, name: '13광땡' }
  if (ma === mb) return { score: SCORE.ttaeng + ma, name: TTAENG_NAMES[ma] ?? `${ma}땡` }
  const kk = (ma + mb) % 10
  if (has(ID.gwang3) && has(ID.yeol7)) return { score: kk, name: '땡잡이', special: 'ttaengjabi' }
  if (has(ID.yeol4) && has(ID.yeol7)) return { score: kk, name: '암행어사', special: 'amhaeng' }
  if (lo === 1 && hi === 2) return { score: SCORE.ali, name: '알리' }
  if (lo === 1 && hi === 4) return { score: SCORE.doksa, name: '독사' }
  if (lo === 1 && hi === 9) return { score: SCORE.gubbing, name: '구삥' }
  if (lo === 1 && hi === 10) return { score: SCORE.jangbbing, name: '장삥' }
  if (lo === 4 && hi === 10) return { score: SCORE.jangsa, name: '장사' }
  if (lo === 4 && hi === 6) return { score: SCORE.seryuk, name: '세륙' }
  if (lo === 4 && hi === 9) {
    const m = has(ID.yeol4) && has(ID.yeol9)
    return { score: kk, name: m ? '멍텅구리구사' : '구사', special: m ? 'mgusa' : 'gusa' }
  }
  return { score: kk, name: kkeutName(kk) }
}

export type Showdown = { kind: 'win'; winners: number[]; reason?: string } | { kind: 'redeal'; by: number; reason: string }

/**
 * 승부 판정. entries는 끝까지 남은 사람들의 [좌석번호, 패].
 * 1) 구사: 다른 사람 최고 패가 알리 이하면 재경기. 멍텅구리구사: 장땡 이하면 재경기.
 * 2) 최고 패가 13·18광땡이고 암행어사가 있으면 암행어사 승.
 * 3) 최고 패가 1~9땡이고 땡잡이가 있으면 땡잡이 승.
 * 4) 그 밖에는 점수가 가장 높은 사람(같으면 나눠 가짐).
 */
export function showdown(entries: { seat: number; cards: number[] }[]): Showdown {
  const hands = entries.map((e) => ({ seat: e.seat, hand: evaluate(e.cards) }))
  if (hands.length >= 2) {
    for (const h of hands) {
      if (h.hand.special !== 'gusa' && h.hand.special !== 'mgusa') continue
      const bestOther = Math.max(...hands.filter((o) => o !== h).map((o) => o.hand.score))
      const limit = h.hand.special === 'gusa' ? SCORE.ali : SCORE.ttaeng + 10
      if (bestOther <= limit) return { kind: 'redeal', by: h.seat, reason: `${h.hand.name}로 재경기!` }
    }
  }
  const top = Math.max(...hands.map((h) => h.hand.score))
  if (top === SCORE.ilpal || top === SCORE.ilsam) {
    const am = hands.filter((h) => h.hand.special === 'amhaeng')
    if (am.length) return { kind: 'win', winners: am.map((h) => h.seat), reason: '암행어사가 광땡을 잡았어요!' }
  }
  if (top > SCORE.ttaeng && top < SCORE.ttaeng + 10) {
    const tj = hands.filter((h) => h.hand.special === 'ttaengjabi')
    if (tj.length) return { kind: 'win', winners: tj.map((h) => h.seat), reason: '땡잡이가 땡을 잡았어요!' }
  }
  return { kind: 'win', winners: hands.filter((h) => h.hand.score === top).map((h) => h.seat) }
}

/** 0~1: 가능한 190가지 두 장 조합 중 이 패보다 약한 비율 (특수패는 보정) */
const ALL_SCORES: number[] = (() => {
  const s: number[] = []
  for (let i = 0; i < SEOTDA_IDS.length; i++)
    for (let j = i + 1; j < SEOTDA_IDS.length; j++) s.push(evaluate([SEOTDA_IDS[i], SEOTDA_IDS[j]]).score)
  return s.sort((a, b) => a - b)
})()

export function handStrength(cards: number[]): number {
  const h = evaluate(cards)
  const below = ALL_SCORES.filter((x) => x < h.score).length
  const eq = ALL_SCORES.filter((x) => x === h.score).length
  let s = (below + eq / 2) / ALL_SCORES.length
  if (h.special === 'ttaengjabi') s = Math.max(s, 0.5)
  if (h.special === 'amhaeng') s = Math.max(s, 0.45)
  if (h.special === 'gusa' || h.special === 'mgusa') s = Math.max(s, 0.55)
  return s
}

/** 첫 장만 보고 짐작하는 세기 */
export function oneCardStrength(id: number): number {
  const m = monthOfId(id)
  let s = 0.15 + m * 0.035
  if (isGwang(id)) s += 0.25
  if (m === 1 || m === 4) s += 0.08 // 알리·독사·장사 등 족보 가능성
  return Math.min(0.95, s)
}

// ---------- 베팅 ----------

export const ANTE = 10
export const START_CHIPS = 1000
export const MAX_RAISES = 3

export interface SPlayer {
  name: string
  isAI: boolean
  chips: number
  /** 이번 판에 낸 총액 */
  bet: number
  folded: boolean
  /** 이번 판 참가 여부(칩이 모자라 쉬는 사람은 false) */
  inHand: boolean
  cards: number[]
  lastAction?: string
}

export type Phase = 'bet1' | 'bet2' | 'showdown'

export interface Table {
  players: SPlayer[]
  deck: number[]
  pot: number
  phase: Phase
  dealer: number
  turn: number
  currentBet: number
  acted: boolean[]
  raises: number
  result?: Showdown
  /** 재경기로 넘어온 판돈 */
  carry: number
  handNo: number
}

export type Action = 'die' | 'call' | 'bbing' | 'half'

export const ACTION_LABEL: Record<Action, string> = { die: '다이', call: '콜', bbing: '삥', half: '하프' }

export const active = (t: Table) => t.players.map((_, i) => i).filter((i) => t.players[i].inHand && !t.players[i].folded)

/** 이번 판에서 누구나 따라갈 수 있는 최대 베팅 총액 (부족한 사람을 위한 사이드팟을 없애기 위함) */
export function betCap(t: Table): number {
  return Math.min(...active(t).map((i) => t.players[i].bet + t.players[i].chips))
}

export function toCall(t: Table, i: number): number {
  return Math.max(0, t.currentBet - t.players[i].bet)
}

/** 레이즈 후 새 베팅 총액 (cap 적용). 레이즈 불가면 null */
export function raiseTarget(t: Table, i: number, a: 'bbing' | 'half'): number | null {
  if (t.raises >= MAX_RAISES) return null
  const call = toCall(t, i)
  const inc = a === 'bbing' ? ANTE : Math.max(ANTE, Math.round((t.pot + call) / 2 / 5) * 5)
  const target = Math.min(betCap(t), t.currentBet + inc)
  return target > t.currentBet ? target : null
}

export function legalActions(t: Table, i: number): Action[] {
  const a: Action[] = ['die', 'call']
  if (raiseTarget(t, i, 'bbing') != null) a.push('bbing')
  if (raiseTarget(t, i, 'half') != null) a.push('half')
  return a
}

/** 선(dealer)부터 시작. 선이 빠졌으면 다음 사람 */
function firstSeat(t: Table): number {
  const d = t.players[t.dealer]
  return d.inHand && !d.folded ? t.dealer : nextSeat(t, t.dealer)
}

function nextSeat(t: Table, from: number): number {
  const n = t.players.length
  for (let k = 1; k <= n; k++) {
    const j = (from + k) % n
    if (t.players[j].inHand && !t.players[j].folded) return j
  }
  return from
}

/** 새 판 시작: 칩이 ANTE 이상인 사람만 참가, 각자 ANTE를 냄, 한 장씩 나눠줌. */
export function startHand(players: SPlayer[], dealer: number, carry = 0, handNo = 1, rng: () => number = Math.random): Table {
  const deck = shuffle(SEOTDA_IDS, rng)
  let pot = carry
  const ps = players.map((p) => {
    const inHand = p.chips >= ANTE
    if (inHand) pot += ANTE
    return {
      ...p,
      chips: inHand ? p.chips - ANTE : p.chips,
      bet: inHand ? ANTE : 0,
      folded: false,
      inHand,
      cards: inHand ? [deck.pop()!] : [],
      lastAction: undefined,
    }
  })
  const t: Table = {
    players: ps,
    deck,
    pot,
    phase: 'bet1',
    dealer,
    turn: dealer,
    currentBet: ANTE,
    acted: ps.map(() => false),
    raises: 0,
    carry,
    handNo,
  }
  t.turn = firstSeat(t)
  return t
}

function roundDone(t: Table): boolean {
  return active(t).every((i) => t.acted[i] && t.players[i].bet === t.currentBet)
}

/** 행동 적용 → 새 상태. 라운드가 끝나면 다음 카드/승부로 진행. */
export function applyAction(t0: Table, a: Action): Table {
  const t: Table = { ...t0, players: t0.players.map((p) => ({ ...p })), acted: t0.acted.slice() }
  const i = t.turn
  const p = t.players[i]
  if (a === 'die') {
    p.folded = true
    p.lastAction = '다이'
  } else if (a === 'call') {
    const c = Math.min(toCall(t, i), p.chips)
    p.chips -= c
    p.bet += c
    t.pot += c
    p.lastAction = c === 0 ? '체크' : `콜 ${c}`
  } else {
    const target = raiseTarget(t, i, a)
    if (target == null) return applyAction(t0, 'call')
    const pay = target - p.bet
    p.chips -= pay
    p.bet = target
    t.pot += pay
    t.currentBet = target
    t.raises++
    t.acted = t.acted.map(() => false)
    p.lastAction = `${ACTION_LABEL[a]} +${pay}`
  }
  t.acted[i] = true

  const left = active(t)
  if (left.length === 1) {
    return { ...t, phase: 'showdown', result: { kind: 'win', winners: left, reason: '모두 다이!' } }
  }
  if (roundDone(t)) {
    if (t.phase === 'bet1') {
      const deck = t.deck.slice()
      for (const j of left) t.players[j].cards = [...t.players[j].cards, deck.pop()!]
      for (const j of left) t.players[j].lastAction = undefined
      return { ...t, deck, phase: 'bet2', acted: t.players.map(() => false), raises: 0, turn: firstSeat(t) }
    }
    const result = showdown(left.map((j) => ({ seat: j, cards: t.players[j].cards })))
    return { ...t, phase: 'showdown', result }
  }
  t.turn = nextSeat(t, i)
  return t
}

/** 승부 결과를 칩에 반영. 재경기면 판돈은 carry로 남김. */
export function settle(t: Table): { players: SPlayer[]; carry: number; winnings: number[] } {
  const players = t.players.map((p) => ({ ...p }))
  const winnings = players.map(() => 0)
  if (!t.result || t.result.kind === 'redeal') return { players, carry: t.pot, winnings }
  const w = t.result.winners
  const share = Math.floor(t.pot / w.length)
  let rest = t.pot - share * w.length
  for (const s of w) {
    const amt = share + (rest > 0 ? 1 : 0)
    if (rest > 0) rest--
    players[s].chips += amt
    winnings[s] = amt
  }
  return { players, carry: 0, winnings }
}

// ---------- AI ----------

const AI_PARAMS: Record<Difficulty, { noise: number; bluff: number; tight: number; raiseAt: number }> = {
  easy: { noise: 0.3, bluff: 0.02, tight: -0.15, raiseAt: 0.85 },
  normal: { noise: 0.14, bluff: 0.07, tight: 0, raiseAt: 0.74 },
  hard: { noise: 0.06, bluff: 0.12, tight: 0.05, raiseAt: 0.66 },
}

export function aiAction(t: Table, i: number, diff: Difficulty, rng: () => number = Math.random): Action {
  const p = t.players[i]
  const P = AI_PARAMS[diff]
  const opp = active(t).length - 1
  let s = t.phase === 'bet1' ? oneCardStrength(p.cards[0]) : handStrength(p.cards)
  // 상대가 많을수록 모두를 이겨야 하므로 기준을 올림 (보통·어려움)
  if (diff !== 'easy' && opp > 1) s = Math.pow(s, 1 + (opp - 1) * 0.35)
  const eff = Math.min(1, Math.max(0, s + (rng() * 2 - 1) * P.noise))
  const call = toCall(t, i)
  const legal = legalActions(t, i)
  const can = (a: Action) => legal.includes(a)
  const bluffing = rng() < P.bluff

  if (bluffing && can('half')) return 'half'
  if (eff >= P.raiseAt + 0.12 && can('half')) return 'half'
  if (eff >= P.raiseAt && can('bbing')) return 'bbing'
  if (call === 0) return 'call'
  const odds = call / (t.pot + call)
  // 첫 장 라운드에서는 쉽게 죽지 않음
  const need = (t.phase === 'bet1' ? odds * 0.6 : odds * 1.1) + P.tight
  if (eff < need && !(diff === 'easy' && rng() < 0.35)) return 'die'
  return 'call'
}
