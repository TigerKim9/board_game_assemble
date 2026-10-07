/**
 * 텍사스 홀덤 (노리밋) — 순수 규칙 + AI.
 *
 * 흐름: startHand → (applyAction …) → phase 'advance'가 되면 UI가 잠시 뒤 advance() →
 *       다음 스트리트(플랍·턴·리버) → … → 쇼다운/혼자 남음 → phase 'done' (정산 완료).
 * 베팅·사이드 팟은 poker-core 엔진이 처리.
 */
// 서버(온라인)에서도 쓰므로 CSS를 끌어오는 '../../cards' 대신 deck/poker를 직접 import
import { createDeck, rankValue, shuffleDeck, type Card } from '../../cards/deck'
import { bestHand, describeHand, type HandResult } from '../../cards/poker'
import type { Difficulty } from '../../lib/types'
import {
  ALL_CODES,
  act,
  code,
  handScore,
  legalActions,
  newHand,
  nextStreet,
  playersAbleToAct,
  playersInHand,
  postBlind,
  potTotal,
  score,
  seatOrderFrom,
  settle,
  startRound,
  toCall,
  type BetAction,
  type BetRound,
  type PotAward,
} from '../poker-core'

export type Mode = 'cash' | 'tournament'
export type Street = 'preflop' | 'flop' | 'turn' | 'river'
export type Phase = 'betting' | 'advance' | 'done'

export const CASH_BUYIN = 1000
export const CASH_BLINDS: [number, number] = [5, 10]
export const TOURNEY_STACK = 1500
export const BLIND_LEVELS: [number, number][] = [
  [10, 20],
  [15, 30],
  [25, 50],
  [50, 100],
  [75, 150],
  [100, 200],
  [150, 300],
  [200, 400],
  [300, 600],
  [500, 1000],
  [1000, 2000],
  [2000, 4000],
]
export const HANDS_PER_LEVEL = 8

export const STREET_LABEL: Record<Street, string> = {
  preflop: '프리플랍',
  flop: '플랍',
  turn: '턴',
  river: '리버',
}

export interface HPlayer {
  name: string
  isAI: boolean
  /** 판과 판 사이의 칩(판 진행 중 실제 스택은 bet.seats[i].stack) */
  stack: number
}

export interface HandOutcome {
  showdown: boolean
  /** 좌석별 최종 패(쇼다운한 사람만) */
  hands: (HandResult | null)[]
  /** 좌석별 받은 칩(반환금 포함) */
  won: number[]
  net: number[]
  awards: PotAward[]
  /** 칩을 받은 좌석 */
  winners: number[]
}

export interface Table {
  players: HPlayer[]
  mode: Mode
  blindsUp: boolean
  level: number
  sb: number
  bb: number
  handNo: number
  dealer: number
  sbSeat: number
  bbSeat: number
  deck: Card[]
  holes: Card[][]
  board: Card[]
  street: Street
  bet: BetRound
  phase: Phase
  /** 좌석별 마지막 행동 표시 */
  last: (string | null)[]
  /** 이번 판 좌석별 베팅/레이즈 횟수(AI의 상대 범위 추정용) */
  aggr: number[]
  /** 프리플랍에 들어온 방식: 0 블라인드/체크, 1 콜, 2 레이즈 */
  entry: number[]
  /** 토너먼트 탈락 순서 */
  busted: number[]
  outcome: HandOutcome | null
}

export function blindsFor(mode: Mode, level: number): [number, number] {
  return mode === 'cash' ? CASH_BLINDS : BLIND_LEVELS[Math.min(level, BLIND_LEVELS.length - 1)]
}

export function createTable(players: HPlayer[], mode: Mode, blindsUp: boolean, dealer = 0): Table {
  const [sb, bb] = blindsFor(mode, 0)
  return {
    players,
    mode,
    blindsUp,
    level: 0,
    sb,
    bb,
    handNo: 0,
    dealer: (dealer - 1 + players.length) % players.length,
    sbSeat: -1,
    bbSeat: -1,
    deck: [],
    holes: players.map(() => []),
    board: [],
    street: 'preflop',
    bet: newHand(
      players.map((p) => p.stack),
      { bigBlind: bb },
    ),
    phase: 'done',
    last: players.map(() => null),
    aggr: players.map(() => 0),
    entry: players.map(() => 0),
    busted: [],
    outcome: null,
  }
}

export const alive = (t: Table) => t.players.map((p, i) => (p.stack > 0 ? i : -1)).filter((i) => i >= 0)

function nextAlive(t: Table, from: number): number {
  const n = t.players.length
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n
    if (t.players[i].stack > 0) return i
  }
  return from
}

/** 새 판 시작: 버튼 이동, 블라인드, 카드 두 장씩. */
export function startHand(t: Table, rng: () => number = Math.random): Table {
  const n = t.players.length
  const live = alive(t)
  if (live.length < 2) return t
  const handNo = t.handNo + 1
  const level = t.mode === 'tournament' && t.blindsUp ? Math.floor((handNo - 1) / HANDS_PER_LEVEL) : 0
  const [sb, bb] = blindsFor(t.mode, level)
  const dealer = nextAlive(t, t.dealer)
  const headsUp = live.length === 2
  const sbSeat = headsUp ? dealer : nextAlive(t, dealer)
  const bbSeat = nextAlive(t, sbSeat)
  let bet = newHand(
    t.players.map((p) => p.stack),
    { bigBlind: bb },
  )
  bet = postBlind(bet, sbSeat, sb)
  bet = postBlind(bet, bbSeat, bb)
  bet = startRound(bet, nextAlive(t, bbSeat))
  let deck = shuffleDeck(createDeck(), rng)
  const holes: Card[][] = t.players.map(() => [])
  for (let r = 0; r < 2; r++)
    for (let k = 1; k <= n; k++) {
      const i = (dealer + k) % n
      if (t.players[i].stack > 0) {
        holes[i].push(deck[0])
        deck = deck.slice(1)
      }
    }
  const last = t.players.map((_, i) => (i === sbSeat ? `SB ${bet.seats[i].bet}` : i === bbSeat ? `BB ${bet.seats[i].bet}` : null))
  const table: Table = {
    ...t,
    level,
    sb,
    bb,
    handNo,
    dealer,
    sbSeat,
    bbSeat,
    deck,
    holes,
    board: [],
    street: 'preflop',
    bet,
    phase: bet.turn >= 0 ? 'betting' : 'advance',
    last,
    aggr: t.players.map(() => 0),
    entry: t.players.map(() => 0),
    outcome: null,
  }
  return table
}

export function actionLabel(t: Table, a: BetAction): string {
  const i = t.bet.turn
  const s = t.bet.seats[i]
  const need = toCall(t.bet, i)
  if (a.kind === 'fold') return '폴드'
  if (a.kind === 'check') return need > 0 ? (need >= s.stack ? '올인' : '콜') : '체크'
  if (a.kind === 'call') return need === 0 ? '체크' : need >= s.stack ? '올인' : '콜'
  const l = legalActions(t.bet, i)
  if (!l.raise) return need === 0 ? '체크' : need >= s.stack ? '올인' : '콜'
  const to = Math.max(l.raise.min, Math.min(l.raise.max, a.to))
  if (to >= l.raise.max) return '올인'
  return t.bet.currentBet === 0 ? `베팅 ${to}` : `레이즈 ${to}`
}

export function applyAction(t: Table, a: BetAction): Table {
  if (t.phase !== 'betting' || t.bet.turn < 0) return t
  const i = t.bet.turn
  const label = actionLabel(t, a)
  const before = t.bet.currentBet
  const bet = act(t.bet, a)
  const raised = bet.currentBet > before
  const last = t.last.slice()
  last[i] = label
  const aggr = t.aggr.slice()
  const entry = t.entry.slice()
  if (raised) aggr[i]++
  if (t.street === 'preflop') entry[i] = Math.max(entry[i], raised ? 2 : a.kind === 'call' || label === '콜' ? 1 : 0)
  return { ...t, bet, last, aggr, entry, phase: bet.turn >= 0 ? 'betting' : 'advance' }
}

/** 모두 올인이라 남은 카드를 그냥 펼치는 중인지 */
export const isRunout = (t: Table) => playersInHand(t.bet) >= 2 && playersAbleToAct(t.bet) <= 1 && t.bet.turn < 0

/** 베팅 라운드가 끝난 뒤: 다음 스트리트를 깔거나 정산. */
export function advance(t: Table): Table {
  if (t.phase !== 'advance') return t
  if (playersInHand(t.bet) <= 1) return finish(t, false)
  if (t.street === 'river') return finish(t, true)
  const street: Street = t.street === 'preflop' ? 'flop' : t.street === 'flop' ? 'turn' : 'river'
  const k = street === 'flop' ? 3 : 1
  const board = [...t.board, ...t.deck.slice(0, k)]
  const deck = t.deck.slice(k)
  const bet = nextStreet(t.bet, t.dealer + 1)
  const last = t.last.map((l, i) => (t.bet.seats[i].folded ? '폴드' : t.bet.seats[i].allIn ? '올인' : t.bet.seats[i].out ? l : null))
  return { ...t, street, board, deck, bet, last, phase: bet.turn >= 0 ? 'betting' : 'advance' }
}

function finish(t: Table, showdown: boolean): Table {
  const n = t.players.length
  const live = t.bet.seats.map((s) => !s.out && !s.folded)
  const hands = t.players.map((_, i) => (showdown && live[i] ? bestHand([...t.holes[i], ...t.board]) : null))
  const scores = hands.map((h) => (h ? handScore(h) : 0))
  const s = settle(t.bet, scores, seatOrderFrom(t.dealer, n))
  const won = s.winnings.map((w, i) => w + s.refunds[i])
  const players = t.players.map((p, i) => ({ ...p, stack: s.stacks[i] }))
  const busted = t.busted.slice()
  if (t.mode === 'tournament') {
    // 같은 판에 탈락하면 시작 칩이 많았던 사람이 더 높은 순위
    const outNow = players
      .map((p, i) => (p.stack === 0 && t.players[i].stack > 0 ? i : -1))
      .filter((i) => i >= 0)
      .sort((a, b) => t.players[a].stack - t.players[b].stack)
    busted.push(...outNow)
  }
  const outcome: HandOutcome = {
    showdown,
    hands,
    won,
    net: s.net,
    awards: s.awards,
    winners: s.winnings.map((w, i) => (w > 0 ? i : -1)).filter((i) => i >= 0),
  }
  return { ...t, players, busted, outcome, phase: 'done' }
}

/** 판에 남은(폴드 안 한) 좌석 */
export const liveSeats = (t: Table) => t.bet.seats.map((s, i) => (!s.out && !s.folded ? i : -1)).filter((i) => i >= 0)

export function handName(h: HandResult): string {
  return describeHand(h)
}

// ---------------------------------------------------------------------------
// 프리플랍 핸드 강도표 (1:1 승률, 몬테카를로 3만 회로 미리 계산)
// 행/열 = A,K,Q,…,2. 행<열 → 수딧(행이 높은 카드), 행>열 → 오프수딧, 대각선 → 페어. 값은 ‰.
// ---------------------------------------------------------------------------
// prettier-ignore
const PREFLOP_EQ = [851,665,662,658,648,632,618,606,598,605,594,582,573,652,821,633,628,619,605,584,572,564,555,550,542,533,645,617,796,607,594,575,561,545,536,526,518,507,500,635,605,585,774,576,556,540,526,506,498,492,477,474,629,598,572,555,752,544,524,508,492,471,464,461,447,609,583,550,534,515,718,504,490,476,453,438,432,425,601,558,536,517,502,482,692,481,461,448,427,406,404,588,548,517,496,474,458,446,665,451,438,418,400,379,571,539,515,478,459,447,433,423,629,437,410,395,372,581,530,507,471,445,430,413,407,399,607,411,405,375,565,522,490,462,429,407,393,384,377,382,571,384,367,559,513,483,454,428,399,373,365,361,359,348,532,359,552,502,470,446,417,391,363,347,349,340,331,317,503]

function classIndex(r1: number, r2: number, suited: boolean): number {
  const hi = Math.max(r1, r2)
  const lo = Math.min(r1, r2)
  const i = 14 - hi
  const j = 14 - lo
  if (i === j) return i * 13 + i
  return suited ? i * 13 + j : j * 13 + i
}

/** 상위 몇 %인지(0 = 최강 AA, 1 = 최약) — 169개 조합을 1:1 승률 순으로 줄 세운 누적 비율 */
const PERCENTILE: number[] = (() => {
  const idx = PREFLOP_EQ.map((_, k) => k).sort((a, b) => PREFLOP_EQ[b] - PREFLOP_EQ[a])
  const out = new Array<number>(169).fill(0)
  let cum = 0
  for (const k of idx) {
    const i = Math.floor(k / 13)
    const j = k % 13
    const combos = i === j ? 6 : i < j ? 4 : 12
    cum += combos
    out[k] = cum / 1326
  }
  return out
})()

export function preflopEquity(a: Card, b: Card): number {
  return PREFLOP_EQ[classIndex(rankValue(a.rank, true), rankValue(b.rank, true), a.suit === b.suit)] / 1000
}

export function preflopPercentile(a: Card, b: Card): number {
  return PERCENTILE[classIndex(rankValue(a.rank, true), rankValue(b.rank, true), a.suit === b.suit)]
}

function percentileOfCodes(a: number, b: number): number {
  return PERCENTILE[classIndex(a >> 2, b >> 2, (a & 3) === (b & 3))]
}

/** 상대 범위: 이 퍼센타일 안의 패를 주로 들고 있다고 가정 (1 = 아무 패나) */
export type Range = number

/**
 * 몬테카를로 승률(동률은 나눠서 계산). 상대마다 범위 바깥 패는 3%만 받아들이는 방식으로 가중.
 */
export function equity(hole: readonly Card[], board: readonly Card[], ranges: readonly Range[], iters: number, rng: () => number = Math.random): number {
  const mine = hole.map(code)
  const known = new Set([...mine, ...board.map(code)])
  const base = ALL_CODES.filter((x) => !known.has(x))
  const b0 = board.map(code)
  const need = 5 - b0.length
  const n = base.length
  const pool = base.slice()
  let total = 0
  for (let it = 0; it < iters; it++) {
    let k = 0
    const take = (j: number) => {
      const t = pool[k]
      pool[k] = pool[j]
      pool[j] = t
      return pool[k++]
    }
    const opp: number[][] = []
    for (const range of ranges) {
      let pair: [number, number] | null = null
      for (let tr = 0; tr < 24; tr++) {
        const j1 = k + Math.floor(rng() * (n - k))
        let j2 = k + Math.floor(rng() * (n - k - 1))
        if (j2 >= j1) j2++
        const ok = range >= 1 || percentileOfCodes(pool[j1], pool[j2]) <= range || rng() < 0.03 || tr === 23
        if (ok) {
          const c1 = pool[j1]
          const c2 = pool[j2]
          // j1/j2를 앞쪽으로 옮기기
          take(j1)
          take(pool.indexOf(c2, k))
          pair = [c1, c2]
          break
        }
      }
      opp.push(pair!)
    }
    const full = b0.slice()
    for (let m = 0; m < need; m++) full.push(take(k + Math.floor(rng() * (n - k))))
    const me = score([...mine, ...full])
    let best = 0
    let ties = 0
    for (const o of opp) {
      const s = score([o[0], o[1], ...full])
      if (s > best) {
        best = s
        ties = 0
      }
      if (s === best) ties++
    }
    if (me > best) total += 1
    else if (me === best) total += 1 / (ties + 1)
  }
  return total / iters
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

interface Personality {
  iters: number
  noise: number
  /** 블러프 빈도 */
  bluff: number
  /** 오픈 범위 배수(클수록 루즈) */
  loose: number
  /** 상대 범위를 읽는지 */
  reads: boolean
  /** 포지션 고려 */
  position: boolean
}

const PERSONALITY: Record<Difficulty, Personality> = {
  easy: { iters: 150, noise: 0.12, bluff: 0.03, loose: 1.7, reads: false, position: false },
  normal: { iters: 400, noise: 0.05, bluff: 0.08, loose: 1.1, reads: true, position: true },
  hard: { iters: 900, noise: 0.02, bluff: 0.13, loose: 1.0, reads: true, position: true },
}

function clampRaise(t: Table, to: number): BetAction {
  const l = legalActions(t.bet)
  if (!l.raise) return l.canCheck ? { kind: 'check' } : { kind: 'call' }
  let x = Math.round(to / t.bb) * t.bb || to
  x = Math.max(l.raise.min, Math.min(l.raise.max, x))
  // 거의 올인이면 그냥 올인
  if (x > l.raise.max * 0.8) x = l.raise.max
  return { kind: 'raise', to: x }
}

/** 상대가 지금까지 보인 행동으로 범위 추정 */
function opponentRange(t: Table, j: number, p: Personality): Range {
  if (!p.reads) return 1
  const e = t.entry[j]
  const a = t.aggr[j]
  if (a >= 3) return 0.06
  if (a === 2) return 0.12
  if (e === 2 || a === 1) return 0.25
  if (e === 1) return 0.5
  return 1
}

/** 내 뒤에 행동할(포지션이 나쁜) 사람 수가 적을수록 좋은 자리 */
function positionScore(t: Table, i: number): number {
  const n = t.players.length
  const live = liveSeats(t)
  // 버튼에 가까울수록 1에 가깝게
  let after = 0
  for (const j of live) {
    if (j === i) continue
    const dj = (j - t.dealer + n) % n || n
    const di = (i - t.dealer + n) % n || n
    if (dj > di) after++
  }
  return live.length <= 1 ? 1 : 1 - after / (live.length - 1)
}

export function aiAction(t: Table, difficulty: Difficulty, rng: () => number = Math.random): BetAction {
  const i = t.bet.turn
  const p = PERSONALITY[difficulty]
  const l = legalActions(t.bet, i)
  const seat = t.bet.seats[i]
  const need = toCall(t.bet, i)
  const pot = potTotal(t.bet)
  const bb = t.bb
  const stackBB = (seat.stack + seat.bet) / bb
  const hole = t.holes[i]
  const opps = liveSeats(t).filter((j) => j !== i)
  const check: BetAction = { kind: 'check' }
  const call: BetAction = { kind: 'call' }
  const fold: BetAction = l.canCheck ? check : { kind: 'fold' }
  const pos = p.position ? positionScore(t, i) : 0.5

  if (t.street === 'preflop') {
    const pct = preflopPercentile(hole[0], hole[1])
    const nLive = opps.length + 1
    const base = nLive <= 2 ? 0.7 : nLive <= 3 ? 0.45 : nLive <= 5 ? 0.3 : 0.22
    const open = Math.min(0.95, base * p.loose * (0.75 + 0.55 * pos))
    const raised = t.bet.currentBet > bb
    const jitter = (rng() - 0.5) * p.noise
    const h = pct + jitter
    // 짧은 스택: 올인 아니면 폴드
    if (stackBB <= 12 && difficulty !== 'easy') {
      const shove = Math.min(0.9, (nLive <= 2 ? 0.55 : 0.28) * (1 + (12 - stackBB) / 12))
      if (h < shove * (raised ? 0.5 : 1)) return clampRaise(t, seat.bet + seat.stack)
      return need === 0 ? check : fold
    }
    if (!raised) {
      // 쉬움: 레이즈는 드물게, 대신 림프(콜)를 자주
      if (difficulty === 'easy' && h >= open * 0.35 && h < open) return need === 0 ? check : call
      if (h < open) return clampRaise(t, bb * (2.5 + (difficulty === 'easy' ? rng() : 0.5)) + Math.max(0, t.bet.currentBet - bb) + countLimpers(t) * bb)
      if (need === 0) return check
      if (h < open * 1.5 && need <= bb / 2 + 0.01) return call // SB 완성
      if (difficulty === 'easy' && h < 0.6) return call
      return fold
    }
    // 레이즈를 마주함
    const potOdds = need / (pot + need)
    const commit = need / (seat.stack + 0.01)
    const premium = h < 0.03 + (difficulty === 'hard' ? 0.01 : 0)
    if (premium) return clampRaise(t, t.bet.currentBet * 3 + pot * 0.3)
    if (difficulty === 'hard' && pct > 0.25 && pct < 0.4 && pos > 0.7 && rng() < 0.08) return clampRaise(t, t.bet.currentBet * 3)
    if (h < 0.08 && commit < 0.6) return rng() < 0.4 ? clampRaise(t, t.bet.currentBet * 2.8) : call
    const callRange = (difficulty === 'easy' ? 0.45 : 0.18) * (1 + potOdds) * (commit > 0.4 ? 0.4 : 1)
    if (h < callRange) return call
    return fold
  }

  // ----- 플랍 이후: 몬테카를로 승률 -----
  const ranges = opps.map((j) => opponentRange(t, j, p))
  const eqRaw = equity(hole, t.board, ranges, p.iters, rng)
  const eq = Math.max(0, Math.min(1, eqRaw + (rng() - 0.5) * 2 * p.noise))
  const nOpp = Math.max(1, opps.length)
  const rel = eq * (nOpp + 1)
  const potOdds = need / (pot + need)
  const allInTo = seat.bet + seat.stack
  const spr = seat.stack / Math.max(1, pot)

  if (need === 0) {
    if (eq > 0.8 && rel > 1.6) {
      if (difficulty === 'hard' && t.street === 'flop' && rng() < 0.2) return check // 슬로플레이
      return clampRaise(t, spr < 1 ? allInTo : pot * (0.55 + 0.3 * rng()))
    }
    if (eq > 0.55 && rel > 1.25) return rng() < 0.7 ? clampRaise(t, pot * (0.5 + 0.25 * rng())) : check
    // 블러프 / 세미 블러프
    const draw = t.street !== 'river' && eq > 0.3 && eq < 0.5
    const bluffP = p.bluff * (nOpp === 1 ? 1.5 : nOpp === 2 ? 0.8 : 0.3) * (draw ? 2 : 1) * (0.6 + 0.8 * pos)
    if (rng() < bluffP) return clampRaise(t, pot * (0.5 + 0.3 * rng()))
    return check
  }
  // 베팅을 마주함
  const valueRaise = difficulty === 'easy' ? 0.85 : 0.75
  if (eq > valueRaise && rel > 1.5 && l.raise) {
    // 레이즈 전쟁은 정말 강할 때만
    if (t.bet.raises >= 2 && eq < 0.9) return call
    if (spr < 1.2 || (eq > 0.92 && t.bet.raises >= 1)) return clampRaise(t, allInTo)
    return rng() < 0.55 ? clampRaise(t, t.bet.currentBet * 2.5 + pot * 0.3) : call
  }
  const margin = difficulty === 'easy' ? -0.08 : difficulty === 'normal' ? 0.02 : 0.04
  // 올인 콜은 더 신중하게
  const commitPenalty = need >= seat.stack * 0.5 ? 0.06 : 0
  if (eq > potOdds + margin + commitPenalty) return call
  // 세미 블러프 레이즈
  if (difficulty === 'hard' && t.street === 'flop' && eq > 0.32 && nOpp === 1 && rng() < 0.12 && l.raise) {
    return clampRaise(t, t.bet.currentBet * 2.5 + pot * 0.3)
  }
  return fold
}

function countLimpers(t: Table): number {
  return t.bet.seats.filter((s, i) => !s.out && !s.folded && s.bet === t.bb && i !== t.bbSeat).length
}

/** 사람용 빠른 베팅 크기 */
export function potSizedRaise(t: Table, fraction: number): number {
  const i = t.bet.turn
  const need = toCall(t.bet, i)
  const pot = potTotal(t.bet)
  const unit = Math.max(1, t.sb)
  return t.bet.currentBet + Math.round(((pot + need) * fraction) / unit) * unit
}
