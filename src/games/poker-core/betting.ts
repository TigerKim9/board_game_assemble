/**
 * 포커 공용 베팅 엔진 (순수 함수, 불변 상태).
 *
 * 한 판(hand) 흐름
 *   let r = newHand(stacks, { bigBlind, out })     // 칩 스택으로 좌석 만들기
 *   r = postAnte(r, i, 10) / postBlind(r, i, 5)    // 앤티(판돈에만 들어감) · 블라인드(이번 라운드 베팅으로 침)
 *   r = startRound(r, firstSeat)                    // 베팅 라운드 시작 (블라인드는 유지)
 *   while (r.turn >= 0) r = act(r, { kind: 'call' }) // fold / check / call / raise(to)
 *   r = nextStreet(r, firstSeat)                    // 다음 라운드: 베팅액 0으로
 *   const { stacks, winnings } = settle(r, scores, oddOrder)
 *
 * 규칙
 * - 최소 레이즈: 직전 레이즈 크기 이상(첫 베팅은 bigBlind 이상). 스택이 모자라면 올인으로만.
 * - 최소 레이즈에 못 미치는 올인(숏 올인)은 이미 행동한 사람에게 베팅을 다시 열어주지 않음:
 *   그 사람들은 콜/폴드만 가능(locked).
 * - 다른 모두가 올인/폴드라 응수할 사람이 없으면 레이즈 불가(콜만).
 * - 판이 끝나면 아무도 받지 않은 초과 베팅을 돌려주고(uncalled), 올인 금액별로 사이드 팟을 나눠
 *   팟마다 자격 있는 사람 중 최고 패에게 분배. 동점은 나누고, 남는 칩(odd chip)은 oddOrder 앞사람부터 1개씩.
 */

export interface BetSeat {
  /** 앞에 남은 칩 */
  stack: number
  /** 이번 베팅 라운드에 낸 칩 */
  bet: number
  /** 이번 판 전체에 낸 칩 (앤티·블라인드 포함) */
  total: number
  folded: boolean
  allIn: boolean
  /** 이번 판에 참여하지 않음(탈락·관전) */
  out: boolean
  /** 이번 라운드에서 마지막 레이즈 이후 행동했는지 */
  acted: boolean
  /** 숏 올인을 마주해 레이즈할 수 없음 */
  locked: boolean
}

export interface BetRound {
  seats: BetSeat[]
  /** 행동할 좌석, 라운드가 끝났으면 -1 */
  turn: number
  /** 이번 라운드 최고 베팅액 */
  currentBet: number
  /** 최소 레이즈 크기 */
  minRaise: number
  bigBlind: number
  /** 이번 라운드 레이즈 횟수 */
  raises: number
  /** 라운드당 레이즈 상한 (0 = 무제한) */
  maxRaises: number
  /** 마지막으로 베팅/레이즈한 좌석 (-1 = 없음) */
  lastAggressor: number
}

export type BetAction =
  | { kind: 'fold' }
  | { kind: 'check' }
  | { kind: 'call' }
  /** 베팅·레이즈: 이번 라운드 내 총 베팅액을 `to`로 만든다(올인 포함). */
  | { kind: 'raise'; to: number }

export interface Legal {
  canCheck: boolean
  /** 콜에 필요한 칩(스택보다 많으면 스택 = 올인 콜) */
  callAmount: number
  canCall: boolean
  /** 레이즈 가능하면 [최소 to, 최대 to] */
  raise: { min: number; max: number } | null
}

export interface HandOptions {
  bigBlind: number
  /** 참여하지 않는 좌석 */
  out?: boolean[]
  /** 라운드당 레이즈 상한 (0 = 무제한) */
  maxRaises?: number
}

export function newHand(stacks: readonly number[], opts: HandOptions): BetRound {
  return {
    seats: stacks.map((stack, i) => ({
      stack,
      bet: 0,
      total: 0,
      folded: false,
      allIn: false,
      out: !!opts.out?.[i] || stack <= 0,
      acted: false,
      locked: false,
    })),
    turn: -1,
    currentBet: 0,
    minRaise: opts.bigBlind,
    bigBlind: opts.bigBlind,
    raises: 0,
    maxRaises: opts.maxRaises ?? 0,
    lastAggressor: -1,
  }
}

const inHand = (s: BetSeat) => !s.out && !s.folded
const canAct = (s: BetSeat) => inHand(s) && !s.allIn

function pay(s: BetSeat, amount: number, asBet: boolean): BetSeat {
  const a = Math.max(0, Math.min(amount, s.stack))
  const stack = s.stack - a
  return { ...s, stack, bet: asBet ? s.bet + a : s.bet, total: s.total + a, allIn: stack === 0 }
}

function setSeat(r: BetRound, i: number, s: BetSeat): BetSeat[] {
  return r.seats.map((x, j) => (j === i ? s : x))
}

/** 앤티: 판돈에만 들어가고 이번 라운드 베팅액에는 포함되지 않음. */
export function postAnte(r: BetRound, i: number, amount: number): BetRound {
  if (r.seats[i].out) return r
  return { ...r, seats: setSeat(r, i, pay(r.seats[i], amount, false)) }
}

/** 블라인드(또는 브링인): 이번 라운드 베팅으로 계산됨. 스택이 모자라면 올인. */
export function postBlind(r: BetRound, i: number, amount: number): BetRound {
  if (r.seats[i].out) return r
  const seats = setSeat(r, i, pay(r.seats[i], amount, true))
  return { ...r, seats, currentBet: Math.max(r.currentBet, seats[i].bet) }
}

/** 남은 사람(폴드·불참 제외) 수 */
export const playersInHand = (r: BetRound) => r.seats.filter(inHand).length
/** 아직 행동할 수 있는 사람(올인 아님) 수 */
export const playersAbleToAct = (r: BetRound) => r.seats.filter(canAct).length
export const potTotal = (r: BetRound) => r.seats.reduce((a, s) => a + s.total, 0)
export const toCall = (r: BetRound, i: number) => Math.max(0, r.currentBet - r.seats[i].bet)

function needsToAct(r: BetRound, i: number): boolean {
  const s = r.seats[i]
  if (!canAct(s)) return false
  if (playersInHand(r) < 2) return false
  if (!s.acted || s.bet < r.currentBet) {
    // 혼자만 행동 가능하고 맞출 베팅도 없으면 할 일이 없음
    if (s.bet >= r.currentBet && r.seats.every((x, j) => j === i || !canAct(x))) return false
    return true
  }
  return false
}

/** `from`부터(포함) 시계 방향으로 행동할 좌석 찾기. 없으면 -1. */
function findTurn(r: BetRound, from: number): number {
  const n = r.seats.length
  for (let k = 0; k < n; k++) {
    const i = (((from + k) % n) + n) % n
    if (needsToAct(r, i)) return i
  }
  return -1
}

/** 베팅 라운드 시작(현재 베팅액 유지 — 프리플랍 블라인드용). */
export function startRound(r: BetRound, first: number): BetRound {
  const seats = r.seats.map((s) => ({ ...s, acted: false, locked: false }))
  const currentBet = Math.max(0, ...seats.map((s) => s.bet))
  const next: BetRound = { ...r, seats, currentBet, minRaise: r.bigBlind, raises: 0, lastAggressor: -1 }
  return { ...next, turn: findTurn(next, first) }
}

/** 다음 스트리트: 베팅액을 0으로 돌리고 라운드 시작. */
export function nextStreet(r: BetRound, first: number): BetRound {
  return startRound({ ...r, seats: r.seats.map((s) => ({ ...s, bet: 0 })), currentBet: 0 }, first)
}

export function legalActions(r: BetRound, i = r.turn): Legal {
  const s = r.seats[i]
  if (i < 0 || !s || !canAct(s)) return { canCheck: false, callAmount: 0, canCall: false, raise: null }
  const need = toCall(r, i)
  const callAmount = Math.min(need, s.stack)
  const others = r.seats.some((x, j) => j !== i && canAct(x))
  const capped = r.maxRaises > 0 && r.raises >= r.maxRaises
  const maxTo = s.bet + s.stack
  let raise: Legal['raise'] = null
  if (!s.locked && !capped && others && s.stack > need) {
    const minTo = r.currentBet + Math.max(r.minRaise, r.currentBet === 0 ? r.bigBlind : 0)
    raise = { min: Math.min(minTo, maxTo), max: maxTo }
  }
  return { canCheck: need === 0, callAmount, canCall: need > 0, raise }
}

/** 현재 차례의 행동을 적용. 불가능한 행동은 가장 가까운 합법 행동으로 보정(체크 불가→콜 등). */
export function act(r: BetRound, a: BetAction): BetRound {
  const i = r.turn
  if (i < 0) return r
  const legal = legalActions(r, i)
  let s = r.seats[i]
  let { currentBet, minRaise, raises, lastAggressor } = r
  let seats = r.seats.slice()
  let kind = a.kind
  if (kind === 'check' && !legal.canCheck) kind = 'call'
  if (kind === 'call' && !legal.canCall) kind = 'check'
  if (kind === 'raise' && !legal.raise) kind = legal.canCall ? 'call' : 'check'

  if (kind === 'fold') {
    // 체크할 수 있는데 폴드하는 것도 허용(실제 포커처럼)
    s = { ...s, folded: true, acted: true }
    seats[i] = s
  } else if (kind === 'check') {
    seats[i] = { ...s, acted: true }
  } else if (kind === 'call') {
    seats[i] = { ...pay(s, toCall(r, i), true), acted: true }
  } else {
    const { min, max } = legal.raise!
    const to = Math.max(min, Math.min(max, Math.floor((a as { to: number }).to)))
    const inc = to - currentBet
    const full = inc >= minRaise || currentBet === 0
    seats[i] = { ...pay(s, to - s.bet, true), acted: true, locked: false }
    if (full) {
      minRaise = Math.max(minRaise, inc)
      raises++
      seats = seats.map((x, j) => (j === i || !canAct(x) ? x : { ...x, acted: false, locked: false }))
    } else {
      // 숏 올인: 이미 행동한 사람은 콜/폴드만
      seats = seats.map((x, j) => (j === i || !canAct(x) ? x : x.acted ? { ...x, acted: false, locked: true } : x))
    }
    currentBet = Math.max(currentBet, to)
    lastAggressor = i
  }
  const next: BetRound = { ...r, seats, currentBet, minRaise, raises, lastAggressor }
  return { ...next, turn: findTurn(next, i + 1) }
}

// ---------------------------------------------------------------------------
// 정산: 초과 베팅 반환 · 사이드 팟 · 분배
// ---------------------------------------------------------------------------

export interface Pot {
  amount: number
  /** 이 팟을 받을 자격이 있는 좌석 */
  eligible: number[]
}

/**
 * 아무도 따라오지 않은 초과 베팅액. 가장 많이 낸 사람이 두 번째보다 더 낸 만큼 돌려받는다.
 * 반환: 좌석별 돌려받을 칩.
 */
export function uncalled(totals: readonly number[]): number[] {
  const back = totals.map(() => 0)
  if (totals.length < 2) return back
  let top = -1
  for (let i = 0; i < totals.length; i++) if (top < 0 || totals[i] > totals[top]) top = i
  const second = Math.max(0, ...totals.filter((_, i) => i !== top))
  if (totals[top] > second) back[top] = totals[top] - second
  return back
}

/**
 * 사이드 팟 나누기. contributions = 좌석별 낸 칩, live = 폴드하지 않은(자격 있는) 좌석.
 * 폴드한 사람의 칩도 팟에 들어가지만 받을 자격은 없음.
 */
export function buildPots(contributions: readonly number[], live: readonly boolean[]): Pot[] {
  const levels = [...new Set(contributions.filter((c, i) => live[i] && c > 0))].sort((a, b) => a - b)
  const pots: Pot[] = []
  let prev = 0
  for (const L of levels) {
    let amount = 0
    for (const c of contributions) amount += Math.max(0, Math.min(c, L) - Math.min(c, prev))
    const eligible = contributions.map((c, i) => (live[i] && c >= L ? i : -1)).filter((i) => i >= 0)
    if (amount > 0) pots.push({ amount, eligible })
    prev = L
  }
  // 살아있는 사람보다 더 낸 폴드 칩(정상이라면 uncalled로 이미 반환됨)은 마지막 팟으로
  let extra = 0
  for (const c of contributions) extra += Math.max(0, c - prev)
  if (extra > 0) {
    if (pots.length) pots[pots.length - 1].amount += extra
    else {
      const eligible = live.map((l, i) => (l ? i : -1)).filter((i) => i >= 0)
      pots.push({ amount: extra, eligible })
    }
  }
  return pots
}

export interface PotAward {
  amount: number
  eligible: number[]
  winners: number[]
  /** 좌석별 이 팟에서 받은 칩 */
  shares: number[]
}

/**
 * 팟 분배. scores[i] = 좌석 i의 패 점수(클수록 강함). oddOrder = 남는 칩을 받을 우선순위(보통 버튼 왼쪽부터).
 */
export function awardPots(pots: readonly Pot[], scores: readonly number[], oddOrder: readonly number[]): { winnings: number[]; awards: PotAward[] } {
  const n = scores.length
  const winnings = new Array<number>(n).fill(0)
  const awards: PotAward[] = []
  for (const pot of pots) {
    const best = Math.max(...pot.eligible.map((i) => scores[i]))
    const winnersSet = pot.eligible.filter((i) => scores[i] === best)
    const ordered = oddOrder.filter((i) => winnersSet.includes(i))
    for (const w of winnersSet) if (!ordered.includes(w)) ordered.push(w)
    const share = Math.floor(pot.amount / ordered.length)
    let rest = pot.amount - share * ordered.length
    const shares = new Array<number>(n).fill(0)
    for (const w of ordered) {
      shares[w] = share + (rest > 0 ? 1 : 0)
      if (rest > 0) rest--
      winnings[w] += shares[w]
    }
    awards.push({ amount: pot.amount, eligible: pot.eligible.slice(), winners: ordered, shares })
  }
  return { winnings, awards }
}

export interface Settlement {
  /** 정산 후 스택 */
  stacks: number[]
  /** 좌석별 팟에서 받은 칩(돌려받은 초과 베팅 제외) */
  winnings: number[]
  /** 좌석별 돌려받은 초과 베팅 */
  refunds: number[]
  awards: PotAward[]
  /** 좌석별 순손익 (받은 칩 + 반환 − 낸 칩) */
  net: number[]
}

/**
 * 판 정산. scores는 쇼다운 점수(남은 사람만 의미 있음). 혼자 남았다면 scores 무시하고 그 사람이 모두 가짐.
 */
export function settle(r: BetRound, scores: readonly number[], oddOrder: readonly number[]): Settlement {
  const totals = r.seats.map((s) => s.total)
  const refunds = uncalled(totals)
  const contributions = totals.map((t, i) => t - refunds[i])
  const live = r.seats.map(inHand)
  const pots = buildPots(contributions, live)
  const sc = live.filter(Boolean).length === 1 ? live.map((l) => (l ? 1 : 0)) : scores.map((s, i) => (live[i] ? s : -Infinity))
  const { winnings, awards } = awardPots(pots, sc, oddOrder)
  const stacks = r.seats.map((s, i) => s.stack + refunds[i] + winnings[i])
  const net = r.seats.map((_, i) => winnings[i] + refunds[i] - totals[i])
  return { stacks, winnings, refunds, awards, net }
}

/** 버튼(dealer) 왼쪽부터 시계 방향 좌석 순서 — 남는 칩 분배 순서. */
export function seatOrderFrom(dealer: number, n: number): number[] {
  return Array.from({ length: n }, (_, k) => (dealer + 1 + k) % n)
}

/** 칩 숫자 표시: 12,500 → "12,500" / 1,250,000 → "125만" */
export function formatChips(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    const man = n / 10000
    return `${Number.isInteger(man) ? man : man.toFixed(1)}만`
  }
  return n.toLocaleString('ko-KR')
}
