/**
 * 세븐 포커 (한국식, 초이스) — 순수 규칙 + AI.
 *
 * 한 판 흐름
 *  1. 모두 앤티를 내고 4장씩 받음 (phase 'choice')
 *  2. 초이스: 1장 버리고 1장 공개 → 3장(히든 2 + 오픈 1)
 *  3. 4번째 카드(오픈) → 4구 베팅, 5번째(오픈) → 5구, 6번째(오픈) → 6구, 7번째(히든) → 히든 베팅
 *  4. 쇼다운: 7장 중 최고 5장. 같은 족보·숫자면 판돈을 나눔.
 * 베팅 순서: 매 라운드 오픈 카드가 가장 좋은 사람(보스)부터.
 * 베팅 이름: 삥(기본 베팅) · 체크 · 콜 · 따당(앞 베팅의 두 배) · 하프(콜 + 판돈의 절반) · 풀(콜 + 판돈 전체) · 다이(포기)
 * 카드가 모자라면(7명 등) 마지막 장은 가운데 공용 카드 한 장으로 대신함.
 */
// 서버(온라인)에서도 쓰므로 CSS를 끌어오는 '../../cards' 대신 deck/poker를 직접 import
import { createDeck, shuffleDeck, type Card } from '../../cards/deck'
import { bestHand, type HandResult } from '../../cards/poker'
import type { Difficulty } from '../../lib/types'
import {
  ALL_CODES,
  act,
  code,
  handScore,
  legalActions,
  newHand,
  nextStreet,
  partialScore,
  playersAbleToAct,
  playersInHand,
  postAnte,
  potTotal,
  score,
  seatOrderFrom,
  settle,
  toCall,
  type BetAction,
  type BetRound,
  type PotAward,
} from '../poker-core'

export const START_CHIPS = 10000
export const ANTE = 20
/** 삥 = 기본 베팅 */
export const BASE_BET = 20
/** 라운드당 레이즈 상한 */
export const MAX_RAISES = 4

export type Phase = 'choice' | 'betting' | 'advance' | 'done'
export type BetName = 'die' | 'check' | 'bbing' | 'call' | 'ddadang' | 'half' | 'full'

export const BET_LABEL: Record<BetName, string> = {
  die: '다이',
  check: '체크',
  bbing: '삥',
  call: '콜',
  ddadang: '따당',
  half: '하프',
  full: '풀',
}

export const ROUND_LABEL: Record<number, string> = { 4: '4구', 5: '5구', 6: '6구', 7: '히든' }

export interface SCard {
  card: Card
  open: boolean
}

export interface SPlayer {
  name: string
  isAI: boolean
  stack: number
}

export interface Outcome {
  showdown: boolean
  hands: (HandResult | null)[]
  won: number[]
  net: number[]
  awards: PotAward[]
  winners: number[]
}

export interface Table {
  players: SPlayer[]
  handNo: number
  dealer: number
  deck: Card[]
  cards: SCard[][]
  /** 공용 카드(카드가 모자랄 때 7번째 장) */
  community: Card | null
  /** 초이스를 끝낸 좌석 */
  chosen: boolean[]
  phase: Phase
  /** 지금 각자 가진 카드 수 기준 라운드 (4·5·6·7) */
  round: number
  bet: BetRound
  last: (string | null)[]
  aggr: number[]
  outcome: Outcome | null
}

export const SUIT_RANK: Record<string, number> = { S: 4, D: 3, H: 2, C: 1 }

export function createTable(players: SPlayer[], dealer = 0): Table {
  return {
    players,
    handNo: 0,
    dealer: (dealer - 1 + players.length) % players.length,
    deck: [],
    cards: players.map(() => []),
    community: null,
    chosen: players.map(() => false),
    phase: 'done',
    round: 0,
    bet: newHand(
      players.map((p) => p.stack),
      { bigBlind: BASE_BET, maxRaises: MAX_RAISES },
    ),
    last: players.map(() => null),
    aggr: players.map(() => 0),
    outcome: null,
  }
}

export const solvent = (t: Table) => t.players.map((p, i) => (p.stack > 0 ? i : -1)).filter((i) => i >= 0)
const inHandSeat = (t: Table, i: number) => !t.bet.seats[i].out && !t.bet.seats[i].folded

export function startHand(t: Table, rng: () => number = Math.random): Table {
  const n = t.players.length
  if (solvent(t).length < 2) return t
  let dealer = t.dealer
  for (let k = 1; k <= n; k++) {
    const i = (t.dealer + k) % n
    if (t.players[i].stack > 0) {
      dealer = i
      break
    }
  }
  let bet = newHand(
    t.players.map((p) => p.stack),
    { bigBlind: BASE_BET, maxRaises: MAX_RAISES },
  )
  for (let i = 0; i < n; i++) bet = postAnte(bet, i, ANTE)
  let deck = shuffleDeck(createDeck(), rng)
  const cards: SCard[][] = t.players.map(() => [])
  for (let r = 0; r < 4; r++)
    for (let k = 1; k <= n; k++) {
      const i = (dealer + k) % n
      if (!bet.seats[i].out) {
        cards[i].push({ card: deck[0], open: false })
        deck = deck.slice(1)
      }
    }
  return {
    ...t,
    handNo: t.handNo + 1,
    dealer,
    deck,
    cards,
    community: null,
    chosen: bet.seats.map((s) => s.out),
    phase: 'choice',
    round: 3,
    bet,
    last: t.players.map(() => null),
    aggr: t.players.map(() => 0),
    outcome: null,
  }
}

/** 초이스: discard번째 카드를 버리고 open번째 카드를 공개 */
export function choose(t: Table, seat: number, discard: number, open: number): Table {
  if (t.phase !== 'choice' || t.chosen[seat] || discard === open) return t
  const hand = t.cards[seat]
  if (!hand[discard] || !hand[open]) return t
  const next = hand.map((c, k) => (k === open ? { ...c, open: true } : c)).filter((_, k) => k !== discard)
  const cards = t.cards.map((h, i) => (i === seat ? next : h))
  const chosen = t.chosen.map((c, i) => c || i === seat)
  let table: Table = { ...t, cards, chosen }
  if (chosen.every(Boolean)) table = dealNext(table)
  return table
}

/** 오픈 카드 비교용 점수(무늬로 동점 깨기 포함) */
export function openScore(cs: readonly SCard[], community: Card | null = null): number {
  const open = cs.filter((c) => c.open).map((c) => c.card)
  if (community) open.push(community)
  if (open.length === 0) return 0
  const base = open.length >= 5 ? score(open.map(code)) : partialScore(open.map(code))
  // 가장 높은 카드의 무늬로 동점 깨기
  const top = open.reduce((a, b) => (rv(b) > rv(a) || (rv(b) === rv(a) && SUIT_RANK[b.suit] > SUIT_RANK[a.suit]) ? b : a))
  return base * 8 + SUIT_RANK[top.suit]
}
const rv = (c: Card) => (c.rank === 1 ? 14 : c.rank)

/** 이번 라운드 먼저 행동할 사람(보스): 남은 사람 중 오픈 카드가 가장 좋은 사람 */
export function boss(t: Table): number {
  let best = -1
  let bs = -1
  t.players.forEach((_, i) => {
    if (!inHandSeat(t, i)) return
    const s = openScore(t.cards[i], t.community)
    if (s > bs) {
      bs = s
      best = i
    }
  })
  return best
}

/** 다음 카드 한 장씩 돌리고 베팅 라운드 시작 */
function dealNext(t: Table): Table {
  const n = t.players.length
  const round = t.round + 1
  const live = t.players.map((_, i) => i).filter((i) => inHandSeat(t, i))
  let deck = t.deck
  let community = t.community
  const cards = t.cards.map((h) => h.slice())
  const order = Array.from({ length: n }, (_, k) => (t.dealer + 1 + k) % n).filter((i) => live.includes(i))
  if (round === 7 && deck.length < order.length) {
    community = deck[0]
    deck = deck.slice(1)
  } else {
    for (const i of order) {
      cards[i].push({ card: deck[0], open: round !== 7 })
      deck = deck.slice(1)
    }
  }
  const dealt: Table = { ...t, round, deck, cards, community }
  const first = boss(dealt)
  const bet = nextStreet(t.bet, first)
  const last = t.last.map((l, i) => (t.bet.seats[i].folded ? '다이' : t.bet.seats[i].allIn ? '올인' : t.bet.seats[i].out ? l : null))
  return { ...dealt, bet, last, phase: bet.turn >= 0 ? 'betting' : 'advance' }
}

// ---------------------------------------------------------------------------
// 베팅 이름 → 금액
// ---------------------------------------------------------------------------

export interface NamedBet {
  name: BetName
  /** 레이즈 목표 금액(이번 라운드 총 베팅). 콜·체크·다이는 0 */
  to: number
  /** 이번 행동으로 더 내는 칩 */
  pay: number
  allIn: boolean
}

/** 지금 차례 사람이 쓸 수 있는 베팅들 */
export function namedBets(t: Table, i = t.bet.turn): NamedBet[] {
  if (t.phase !== 'betting' || i < 0) return []
  const r = t.bet
  const l = legalActions(r, i)
  const s = r.seats[i]
  const need = toCall(r, i)
  const pot = potTotal(r)
  const out: NamedBet[] = [{ name: 'die', to: 0, pay: 0, allIn: false }]
  if (l.canCheck) out.push({ name: 'check', to: 0, pay: 0, allIn: false })
  if (l.canCall) out.push({ name: 'call', to: 0, pay: l.callAmount, allIn: l.callAmount >= s.stack })
  if (l.raise) {
    const { min, max } = l.raise
    const add = (name: BetName, raw: number) => {
      const to = Math.max(min, Math.min(max, Math.floor(raw)))
      out.push({ name, to, pay: to - s.bet, allIn: to >= max })
    }
    if (r.currentBet === 0) add('bbing', BASE_BET)
    else add('ddadang', r.currentBet * 2)
    add('half', r.currentBet + (pot + need) / 2)
    add('full', r.currentBet + pot + need)
  }
  return out
}

export function toAction(b: NamedBet): BetAction {
  if (b.name === 'die') return { kind: 'fold' }
  if (b.name === 'check') return { kind: 'check' }
  if (b.name === 'call') return { kind: 'call' }
  return { kind: 'raise', to: b.to }
}

export function applyBet(t: Table, name: BetName): Table {
  if (t.phase !== 'betting') return t
  const b = namedBets(t).find((x) => x.name === name)
  if (!b) return t
  const i = t.bet.turn
  const bet = act(t.bet, toAction(b))
  const last = t.last.slice()
  last[i] = b.allIn && name !== 'die' && name !== 'check' ? '올인' : BET_LABEL[name]
  const aggr = t.aggr.slice()
  if (bet.currentBet > t.bet.currentBet) aggr[i]++
  return { ...t, bet, last, aggr, phase: bet.turn >= 0 ? 'betting' : 'advance' }
}

export const isRunout = (t: Table) => playersInHand(t.bet) >= 2 && playersAbleToAct(t.bet) <= 1 && t.bet.turn < 0

export function advance(t: Table): Table {
  if (t.phase !== 'advance') return t
  if (playersInHand(t.bet) <= 1 || t.round >= 7) return finish(t)
  return dealNext(t)
}

export function sevenOf(t: Table, i: number): Card[] {
  const cs = t.cards[i].map((c) => c.card)
  return t.community ? [...cs, t.community] : cs
}

function finish(t: Table): Table {
  const n = t.players.length
  const live = t.players.map((_, i) => inHandSeat(t, i))
  const showdown = live.filter(Boolean).length >= 2
  const hands = t.players.map((_, i) => (showdown && live[i] ? bestHand(sevenOf(t, i)) : null))
  const scores = hands.map((h) => (h ? handScore(h) : 0))
  const s = settle(t.bet, scores, seatOrderFrom(t.dealer, n))
  const won = s.winnings.map((w, i) => w + s.refunds[i])
  return {
    ...t,
    players: t.players.map((p, i) => ({ ...p, stack: s.stacks[i] })),
    phase: 'done',
    outcome: {
      showdown,
      hands,
      won,
      net: s.net,
      awards: s.awards,
      winners: s.winnings.map((w, i) => (w > 0 ? i : -1)).filter((i) => i >= 0),
    },
  }
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

/** 초이스 AI: 버릴 카드·공개할 카드 */
export function aiChoice(hand: readonly Card[], difficulty: Difficulty, rng: () => number = Math.random): { discard: number; open: number } {
  if (difficulty === 'easy' && rng() < 0.4) {
    const d = Math.floor(rng() * 4)
    let o = Math.floor(rng() * 3)
    if (o >= d) o++
    return { discard: d, open: o }
  }
  let best = { discard: 0, open: 1, v: -Infinity }
  for (let d = 0; d < 4; d++) {
    const keep = [0, 1, 2, 3].filter((k) => k !== d)
    const v = keepValue(keep.map((k) => hand[k]))
    for (const o of keep) {
      // 공개 카드: 페어를 숨기고 낮은 카드를 보여주는 편이 유리
      const rest = keep.filter((k) => k !== o).map((k) => hand[k])
      const hidesPair = rest.length === 2 && rest[0].rank === rest[1].rank ? 6 : 0
      const shown = rv(hand[o])
      const ov = v + hidesPair - shown * 0.15 + (difficulty === 'hard' && shown >= 13 ? 0.8 : 0)
      if (ov > best.v) best = { discard: d, open: o, v: ov }
    }
  }
  return { discard: best.discard, open: best.open }
}

function keepValue(cs: Card[]): number {
  const ranks = cs.map(rv).sort((a, b) => b - a)
  let v = ranks[0] * 0.3 + ranks[1] * 0.2 + ranks[2] * 0.1
  if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) v += 60 + ranks[0]
  else if (ranks[0] === ranks[1] || ranks[1] === ranks[2]) v += 25 + (ranks[0] === ranks[1] ? ranks[0] : ranks[1])
  if (cs.every((c) => c.suit === cs[0].suit)) v += 9
  const uniq = [...new Set(ranks)]
  if (uniq.length === 3 && (uniq[0] - uniq[2] <= 4 || (uniq[0] === 14 && uniq[1] <= 5))) v += 6
  return v
}

interface Personality {
  iters: number
  noise: number
  bluff: number
  reads: boolean
}

const PERSONALITY: Record<Difficulty, Personality> = {
  easy: { iters: 150, noise: 0.12, bluff: 0.03, reads: false },
  normal: { iters: 400, noise: 0.05, bluff: 0.07, reads: true },
  hard: { iters: 800, noise: 0.02, bluff: 0.12, reads: true },
}

/**
 * 보이는 정보만으로 승률 계산: 내 카드 전부 + 남들 오픈 카드 + 공용 카드.
 * 상대의 히든 카드와 앞으로 받을 카드는 안 보이는 카드에서 무작위로 채움.
 */
export function equity(t: Table, me: number, iters: number, rng: () => number = Math.random, reads = false): number {
  const mine = t.cards[me].map((c) => code(c.card))
  const opps = t.players.map((_, i) => i).filter((i) => i !== me && inHandSeat(t, i))
  const comm = t.community ? [code(t.community)] : []
  const known = new Set([...mine, ...comm])
  const oppOpen = opps.map((i) =>
    t.cards[i].filter((c) => c.open).map((c) => code(c.card)),
  )
  for (const o of oppOpen) for (const x of o) known.add(x)
  const pool = ALL_CODES.filter((x) => !known.has(x))
  const total = t.community ? 6 : 7
  const myNeed = total - mine.length
  const oppNeed = opps.map((_, k) => total - oppOpen[k].length)
  // 상대가 크게 베팅했으면 이미 좋은 패를 들었을 가능성을 높임
  const strong = opps.map((i) => (reads ? t.aggr[i] : 0))
  let sum = 0
  const n = pool.length
  for (let it = 0; it < iters; it++) {
    let k = 0
    const take = () => {
      const j = k + Math.floor(rng() * (n - k))
      const tmp = pool[k]
      pool[k] = pool[j]
      pool[j] = tmp
      return pool[k++]
    }
    const myAll = mine.slice()
    for (let m = 0; m < myNeed; m++) myAll.push(take())
    myAll.push(...comm)
    const me7 = score(myAll)
    let best = 0
    let ties = 0
    for (let o = 0; o < opps.length; o++) {
      let hand: number[] = []
      const tries = strong[o] >= 2 ? 4 : strong[o] === 1 ? 2 : 1
      const start = k
      for (let tr = 0; tr < tries; tr++) {
        k = start
        hand = oppOpen[o].slice()
        for (let m = 0; m < oppNeed[o]; m++) hand.push(take())
        hand.push(...comm)
        // 지금까지의 카드(히든 포함)로 원페어 이상이면 받아들임
        if (tr === tries - 1) break
        const nowCount = t.cards[opps[o]].length
        const nowCards = hand.slice(0, nowCount)
        if (partialScore(nowCards) >= 16 ** 5 * 1) break
      }
      const s = score(hand)
      if (s > best) {
        best = s
        ties = 0
      }
      if (s === best) ties++
    }
    if (me7 > best) sum += 1
    else if (me7 === best) sum += 1 / (ties + 1)
  }
  return sum / iters
}

export function aiBet(t: Table, difficulty: Difficulty, rng: () => number = Math.random): BetName {
  const i = t.bet.turn
  const p = PERSONALITY[difficulty]
  const options = namedBets(t, i)
  const has = (n: BetName) => options.some((o) => o.name === n)
  const s = t.bet.seats[i]
  const need = toCall(t.bet, i)
  const pot = potTotal(t.bet)
  const opps = t.players.map((_, j) => j).filter((j) => j !== i && inHandSeat(t, j))
  const eqRaw = equity(t, i, p.iters, rng, p.reads)
  const eq = Math.max(0, Math.min(1, eqRaw + (rng() - 0.5) * 2 * p.noise))
  const nOpp = Math.max(1, opps.length)
  const rel = eq * (nOpp + 1)
  const potOdds = need / (pot + need)
  const late = t.round >= 6

  if (need === 0) {
    if (eq > 0.7 && rel > 1.6 && has('half')) {
      if (difficulty === 'hard' && !late && rng() < 0.25) return has('bbing') ? 'bbing' : 'check' // 함정
      return late && eq > 0.85 && has('full') && rng() < 0.4 ? 'full' : 'half'
    }
    if (eq > 0.45 && rel > 1.15) return has('bbing') && rng() < 0.6 ? 'bbing' : has('half') && rng() < 0.3 ? 'half' : 'check'
    // 블러프: 내 오픈 카드가 무서워 보일 때
    const myOpen = openScore(t.cards[i])
    const scary = opps.every((j) => openScore(t.cards[j]) < myOpen)
    if (has('half') && rng() < p.bluff * (scary ? 2 : 0.6) * (nOpp <= 2 ? 1 : 0.4)) return 'half'
    return 'check'
  }
  // 베팅을 마주함
  const raiseOk = has('half') || has('ddadang')
  if (eq > (difficulty === 'easy' ? 0.8 : 0.68) && rel > 1.5 && raiseOk) {
    if (t.bet.raises >= 2 && eq < 0.88) return 'call'
    if (eq > 0.88 && late && has('full') && rng() < 0.3) return 'full'
    return has('half') && rng() < 0.7 ? 'half' : has('ddadang') ? 'ddadang' : 'call'
  }
  const margin = difficulty === 'easy' ? -0.1 : difficulty === 'normal' ? 0.0 : 0.03
  const commit = need >= s.stack * 0.5 ? 0.05 : 0
  // 초반(4구)엔 드로우 가능성이 커서 조금 더 따라감
  const early = t.round <= 4 ? 0.05 : 0
  if (eq + early > potOdds + margin + commit) return 'call'
  return 'die'
}
