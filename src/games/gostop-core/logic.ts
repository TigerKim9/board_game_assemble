/**
 * 맞고·고스톱 공용 규칙 엔진 (순수 함수, UI와 분리).
 *
 * 차례 진행: play → (chooseHand) → flip → (chooseFlip) → resolve → (goStop) → 다음 사람 play
 * - play: 손패 한 장 내기(흔들기/폭탄 선택 가능) 또는 폭탄 뒤 '빈 차례'(dummy, 더미만 뒤집기)
 * - flip / resolve: 자동 단계. UI는 잠깐 기다렸다가 `advance()`를 부름.
 * - resolve에서 뻑·쪽·따닥·뻑 먹기·폭탄·쓸 처리, 피 뺏기, 점수 확인.
 */
import { CHEONGDAN_IDS, CHODAN_IDS, GODORI_IDS, HONGDAN_IDS, getCard, monthOf, newDeckIds } from '../../hwatu'
import type { Difficulty } from '../../lib/types'

// ---------- 설정 ----------

export type Mode = 'matgo' | 'gostop'

export interface ModeConfig {
  players: number
  hand: number
  floor: number
  /** 고/스톱을 부를 수 있는 최소 점수 */
  threshold: number
}

export const MODES: Record<Mode, ModeConfig> = {
  matgo: { players: 2, hand: 10, floor: 8, threshold: 7 },
  gostop: { players: 3, hand: 7, floor: 6, threshold: 3 },
}

/** 점당 가상 머니 */
export const WON_PER_POINT = 100
/** 총통(손패에 같은 달 4장) 점수 */
export const CHONGTONG_POINTS = 10
/** 피박 기준: 진 사람 피가 1~PIBAK_MAX장이면 피박 (0장은 면제) */
export const PIBAK_MAX = 5

// ---------- 점수 ----------

export interface ScoreItem {
  key: string
  label: string
  points: number
}

export interface ScoreInfo {
  total: number
  items: ScoreItem[]
  /** 국진을 쌍피로 썼는지 */
  gukjinAsPi: boolean
  gwang: number
  yeol: number
  tti: number
  pi: number
  gwangPts: number
  yeolPts: number
  piPts: number
}

const has = (set: Set<number>, ids: readonly number[]) => ids.every((id) => set.has(id))

function scoreWith(captured: readonly number[], gukjinAsPi: boolean): ScoreInfo {
  const set = new Set(captured)
  let gwang = 0
  let bi = false
  let yeol = 0
  let tti = 0
  let pi = 0
  for (const id of captured) {
    const c = getCard(id)
    if (c.kind === 'gwang') {
      gwang++
      if (c.isBiGwang) bi = true
    } else if (c.kind === 'yeol') {
      if (c.isGukjin && gukjinAsPi) pi += 2
      else yeol++
    } else if (c.kind === 'tti') tti++
    else pi += c.piValue
  }
  const items: ScoreItem[] = []
  let gwangPts = 0
  if (gwang === 5) gwangPts = 15
  else if (gwang === 4) gwangPts = 4
  else if (gwang === 3) gwangPts = bi ? 2 : 3
  if (gwangPts) items.push({ key: 'gwang', label: gwang === 3 && bi ? '비광 3광' : `${gwang}광`, points: gwangPts })
  const yeolPts = yeol >= 5 ? yeol - 4 : 0
  if (yeolPts) items.push({ key: 'yeol', label: `열끗 ${yeol}장`, points: yeolPts })
  if (has(set, GODORI_IDS)) items.push({ key: 'godori', label: '고도리', points: 5 })
  const ttiPts = tti >= 5 ? tti - 4 : 0
  if (ttiPts) items.push({ key: 'tti', label: `띠 ${tti}장`, points: ttiPts })
  if (has(set, HONGDAN_IDS)) items.push({ key: 'hong', label: '홍단', points: 3 })
  if (has(set, CHEONGDAN_IDS)) items.push({ key: 'cheong', label: '청단', points: 3 })
  if (has(set, CHODAN_IDS)) items.push({ key: 'cho', label: '초단', points: 3 })
  const piPts = pi >= 10 ? pi - 9 : 0
  if (piPts) items.push({ key: 'pi', label: `피 ${pi}장`, points: piPts })
  const total = items.reduce((a, b) => a + b.points, 0)
  return { total, items, gukjinAsPi, gwang, yeol, tti, pi, gwangPts, yeolPts, piPts }
}

/** 먹은 패의 점수. 국진(9월 열끗)은 열끗/쌍피 중 점수가 높은 쪽으로 자동 선택. */
export function scoreOf(captured: readonly number[]): ScoreInfo {
  const a = scoreWith(captured, false)
  if (!captured.some((id) => getCard(id).isGukjin)) return a
  const b = scoreWith(captured, true)
  return b.total > a.total ? b : a
}

/** 피 장수(쌍피 2장). 박 판정용으로 국진을 피로 셀 수 있음. */
export function piOf(captured: readonly number[], gukjinAsPi = false): number {
  let n = 0
  for (const id of captured) {
    const c = getCard(id)
    if (c.kind === 'pi') n += c.piValue
    else if (gukjinAsPi && c.isGukjin) n += 2
  }
  return n
}

// ---------- 상태 ----------

export interface GPlayer {
  name: string
  isAI: boolean
  hand: number[]
  captured: number[]
  goCount: number
  /** 마지막으로 고를 부른 시점의 점수 (점수가 이보다 올라야 다시 고/스톱 가능) */
  lastGoScore: number
  /** 흔들기·폭탄 횟수 (각 ×2) */
  shakes: number
  shakenMonths: number[]
  bombs: number
  /** 폭탄 후 남은 빈 차례(더미만 뒤집기) 수 */
  dummies: number
  ppeoks: number
}

export interface TurnCtx {
  /** 이번 차례에 낸 카드 (폭탄이면 3장, 빈 차례면 0장) */
  played: number[]
  playMonth: number | null
  /** 내기 전 바닥에 있던 같은 달 카드 */
  fpBefore: number[]
  playTarget: number | null
  flipped: number | null
  flipTarget: number | null
  bomb: boolean
}

export type EventType =
  | 'ppeok'
  | 'jjok'
  | 'ttadak'
  | 'sseul'
  | 'ppeokEat'
  | 'jappeok'
  | 'bomb'
  | 'shake'
  | 'steal'
  | 'go'
  | 'stop'
  | 'chongtong'
  | 'nagari'

export interface GEvent {
  type: EventType
  player: number
  text: string
}

export type Phase =
  | { kind: 'play' }
  | { kind: 'chooseHand'; options: number[] }
  | { kind: 'flip' }
  | { kind: 'chooseFlip'; options: number[] }
  | { kind: 'resolve' }
  | { kind: 'goStop'; score: number }
  | { kind: 'over' }

export interface Payment {
  from: number
  points: number
  /** 이 사람에게만 붙는 박 (피박·광박·고박) */
  reasons: string[]
  /** 고스톱 고박: 다른 사람 몫까지 대신 냄 */
  paysFor: number[]
}

export interface RoundResult {
  kind: 'win' | 'nagari' | 'chongtong'
  winner: number | null
  items: ScoreItem[]
  base: number
  goCount: number
  /** 전체에 붙는 배수 (고 배수, 흔들기, 멍박, 나가리) */
  multipliers: { label: string; factor: number }[]
  payments: Payment[]
  /** 나가리 이후 다음 판 배수 */
  nextMult: number
  note?: string
}

export interface GState {
  mode: Mode
  cfg: ModeConfig
  players: GPlayer[]
  floor: number[]
  deck: number[]
  turn: number
  phase: Phase
  ctx: TurnCtx | null
  /** 바닥에 쌓인 뻑: 달 → 뻑을 싼 사람 */
  ppeok: Record<number, number>
  /** 직전 단계에서 일어난 사건 (토스트용) */
  events: GEvent[]
  eventSeq: number
  /** 직전 차례 설명 */
  message: string
  /** 직전 차례에 먹은 카드 (애니메이션용) */
  lastCaptured: number[]
  /** 이번 판 배수 (나가리 누적) */
  nagariMult: number
  /** 마지막으로 고를 부른 사람 (고스톱 고박용) */
  lastGoer: number | null
  result: RoundResult | null
}

export interface NewRoundOpts {
  rng?: () => number
  first?: number
  nagariMult?: number
  /** 테스트용: 섞지 않고 이 순서대로 나눔 (손패 → 바닥 → 더미) */
  deck?: number[]
}

function hasFourOfMonth(cards: number[]): number | null {
  const c = new Map<number, number>()
  for (const id of cards) {
    const m = monthOf(id)
    c.set(m, (c.get(m) ?? 0) + 1)
    if (c.get(m)! >= 4) return m
  }
  return null
}

export function newRound(players: { name: string; isAI: boolean }[], mode: Mode, opts: NewRoundOpts = {}): GState {
  const cfg = MODES[mode]
  if (players.length !== cfg.players) throw new Error(`${mode}는 ${cfg.players}명이 필요해요`)
  const rng = opts.rng ?? Math.random
  const first = opts.first ?? 0
  for (;;) {
    const deck = opts.deck ? opts.deck.slice() : newDeckIds(rng)
    const ps: GPlayer[] = players.map((p) => ({
      name: p.name,
      isAI: p.isAI,
      hand: deck.splice(0, cfg.hand).sort((a, b) => a - b),
      captured: [],
      goCount: 0,
      lastGoScore: 0,
      shakes: 0,
      shakenMonths: [],
      bombs: 0,
      dummies: 0,
      ppeoks: 0,
    }))
    const floor = deck.splice(0, cfg.floor)
    if (!opts.deck && hasFourOfMonth(floor) != null) continue // 바닥에 같은 달 4장 → 다시 섞기
    const s: GState = {
      mode,
      cfg,
      players: ps,
      floor,
      deck,
      turn: first % ps.length,
      phase: { kind: 'play' },
      ctx: null,
      ppeok: {},
      events: [],
      eventSeq: 0,
      message: '',
      lastCaptured: [],
      nagariMult: opts.nagariMult ?? 1,
      lastGoer: null,
      result: null,
    }
    // 총통 확인 (선부터 차례대로)
    for (let k = 0; k < ps.length; k++) {
      const i = (first + k) % ps.length
      const m = hasFourOfMonth(ps[i].hand)
      if (m != null) return finishChongtong(s, i, m)
    }
    return s
  }
}

export function clone(s: GState): GState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, hand: p.hand.slice(), captured: p.captured.slice(), shakenMonths: p.shakenMonths.slice() })),
    floor: s.floor.slice(),
    deck: s.deck.slice(),
    ctx: s.ctx && { ...s.ctx, played: s.ctx.played.slice(), fpBefore: s.ctx.fpBefore.slice() },
    ppeok: { ...s.ppeok },
    events: s.events.slice(),
    lastCaptured: s.lastCaptured.slice(),
  }
}

// ---------- 도우미 ----------

export const ofMonth = (cards: readonly number[], m: number) => cards.filter((c) => monthOf(c) === m)

export function matchesOnFloor(s: GState, card: number): number[] {
  return ofMonth(s.floor, monthOf(card))
}

/** 이 카드를 낼 때 흔들기를 선언할 수 있는지 (손에 같은 달 3장, 바닥에 0장) */
export function canShake(s: GState, card: number, player = s.turn): boolean {
  const p = s.players[player]
  const m = monthOf(card)
  return p.hand.includes(card) && ofMonth(p.hand, m).length === 3 && ofMonth(s.floor, m).length === 0 && !p.shakenMonths.includes(m)
}

/** 폭탄 가능 여부 (손에 같은 달 3장, 바닥에 1장) */
export function canBomb(s: GState, card: number, player = s.turn): boolean {
  const p = s.players[player]
  const m = monthOf(card)
  return p.hand.includes(card) && ofMonth(p.hand, m).length === 3 && ofMonth(s.floor, m).length === 1
}

export type PlayAction = { type: 'card'; card: number; shake?: boolean; bomb?: boolean } | { type: 'dummy' }

export function legalActions(s: GState): PlayAction[] {
  if (s.phase.kind !== 'play') return []
  const p = s.players[s.turn]
  const out: PlayAction[] = []
  const bombMonths = new Set<number>()
  for (const c of p.hand) {
    if (canBomb(s, c)) {
      const m = monthOf(c)
      if (!bombMonths.has(m)) {
        bombMonths.add(m)
        out.push({ type: 'card', card: c, bomb: true })
      }
    }
    out.push({ type: 'card', card: c, shake: canShake(s, c) || undefined })
  }
  if (p.dummies > 0) out.push({ type: 'dummy' })
  return out
}

export function canAct(p: GPlayer): boolean {
  return p.hand.length > 0 || p.dummies > 0
}

const nameOf = (id: number) => getCard(id).name

function batchim(word: string): number {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code >= 0 && code <= 11171 ? code % 28 : 0
}
/** 받침에 맞는 조사: 을/를 */
export const eulReul = (w: string) => w + (batchim(w) ? '을' : '를')

// ---------- 진행 ----------

function push(s: GState, type: EventType, player: number, text: string) {
  s.events.push({ type, player, text })
  s.eventSeq++
}

/** 손패 내기 (흔들기/폭탄 선택) 또는 빈 차례 */
export function play(s0: GState, action: PlayAction): GState {
  if (s0.phase.kind !== 'play') return s0
  const s = clone(s0)
  const p = s.players[s.turn]
  s.events = []
  s.lastCaptured = []
  s.message = ''
  if (action.type === 'dummy') {
    if (p.dummies <= 0) return s0
    p.dummies--
    s.ctx = { played: [], playMonth: null, fpBefore: [], playTarget: null, flipped: null, flipTarget: null, bomb: false }
    s.message = `${p.name}: 빈 차례 — 더미만 뒤집어요. `
    s.phase = { kind: 'flip' }
    return s
  }
  const card = action.card
  if (!p.hand.includes(card)) return s0
  const m = monthOf(card)
  const fp = ofMonth(s.floor, m)
  if (action.bomb) {
    if (!canBomb(s0, card)) return s0
    const three = ofMonth(p.hand, m)
    p.hand = p.hand.filter((c) => monthOf(c) !== m)
    if (!p.shakenMonths.includes(m)) {
      p.shakes++
      p.shakenMonths.push(m)
    }
    p.bombs++
    p.dummies += 2
    s.floor.push(...three)
    s.ctx = { played: three, playMonth: m, fpBefore: fp, playTarget: fp[0], flipped: null, flipTarget: null, bomb: true }
    push(s, 'bomb', s.turn, '폭탄!')
    s.message = `${p.name}: ${m}월 폭탄! `
    s.phase = { kind: 'flip' }
    return s
  }
  if (action.shake && canShake(s0, card)) {
    p.shakes++
    p.shakenMonths.push(m)
    push(s, 'shake', s.turn, '흔들기!')
    s.message = `${p.name}: ${m}월 흔들기! `
  }
  p.hand = p.hand.filter((c) => c !== card)
  s.floor.push(card)
  s.ctx = { played: [card], playMonth: m, fpBefore: fp, playTarget: fp.length === 1 ? fp[0] : null, flipped: null, flipTarget: null, bomb: false }
  s.phase = fp.length === 2 ? { kind: 'chooseHand', options: fp } : { kind: 'flip' }
  return s
}

/** 같은 달 두 장 중 가져올 카드 고르기 */
export function choose(s0: GState, target: number): GState {
  const ph = s0.phase
  if ((ph.kind !== 'chooseHand' && ph.kind !== 'chooseFlip') || !ph.options.includes(target)) return s0
  const s = clone(s0)
  if (ph.kind === 'chooseHand') {
    s.ctx!.playTarget = target
    s.phase = { kind: 'flip' }
  } else {
    s.ctx!.flipTarget = target
    s.phase = { kind: 'resolve' }
  }
  return s
}

/** 더미 맨 위 카드 뒤집기 */
export function flip(s0: GState): GState {
  if (s0.phase.kind !== 'flip') return s0
  const s = clone(s0)
  s.events = []
  const ctx = s.ctx!
  const f = s.deck.shift()
  if (f == null) {
    s.phase = { kind: 'resolve' }
    return s
  }
  ctx.flipped = f
  const mf = monthOf(f)
  if (ctx.playMonth === mf && !ctx.bomb) {
    s.phase = { kind: 'resolve' }
    return s
  }
  const m = ofMonth(s.floor, mf)
  s.phase = m.length === 2 ? { kind: 'chooseFlip', options: m } : { kind: 'resolve' }
  return s
}

/** 피 한 장 뺏기 (일반 피 우선, 없으면 쌍피) */
export function stealPi(s: GState, from: number, to: number): number | null {
  const v = s.players[from]
  const pis = v.captured.filter((id) => getCard(id).kind === 'pi').sort((a, b) => getCard(a).piValue - getCard(b).piValue || a - b)
  if (!pis.length) return null
  const id = pis[0]
  v.captured = v.captured.filter((c) => c !== id)
  s.players[to].captured.push(id)
  return id
}

function takeAllThree(s: GState, month: number, me: number): number {
  // 바닥 같은 달 3장을 한꺼번에 먹음. 뻑이었다면 뻑 먹기(피 뺏기)
  const owner = s.ppeok[month]
  delete s.ppeok[month]
  if (owner == null) return 0
  if (owner === me) {
    push(s, 'jappeok', me, '자뻑!')
    return 2
  }
  push(s, 'ppeokEat', me, '뻑 먹기!')
  return 1
}

/** 이번 차례 정리: 먹기·뻑·쪽·따닥·쓸·피 뺏기, 이후 고/스톱 판정 */
export function resolve(s0: GState): GState {
  if (s0.phase.kind !== 'resolve') return s0
  const s = clone(s0)
  const me = s.turn
  const p = s.players[me]
  const ctx = s.ctx!
  const caught: number[] = []
  let steal = 0
  const takeFromFloor = (cards: number[]) => {
    s.floor = s.floor.filter((c) => !cards.includes(c))
    caught.push(...cards)
  }
  // 낸 카드는 화면 표시용으로 바닥에 올려 두었으므로 먼저 걷어냄
  s.floor = s.floor.filter((c) => !ctx.played.includes(c))
  const F = ctx.flipped
  let flipDone = F == null
  const fp = ctx.fpBefore

  if (ctx.bomb) {
    caught.push(...ctx.played)
    takeFromFloor(fp)
    steal += 1
  } else if (ctx.played.length === 1) {
    const P = ctx.played[0]
    const mP = ctx.playMonth!
    if (F != null && monthOf(F) === mP) {
      flipDone = true
      if (fp.length === 0) {
        caught.push(P, F)
        steal += 1
        push(s, 'jjok', me, '쪽!')
      } else if (fp.length === 1) {
        s.floor.push(P, F)
        s.ppeok[mP] = me
        p.ppeoks++
        push(s, 'ppeok', me, '뻑!')
      } else {
        caught.push(P, F)
        takeFromFloor(fp)
        steal += 1
        push(s, 'ttadak', me, '따닥!')
      }
    } else if (fp.length === 0) {
      s.floor.push(P)
    } else if (fp.length === 1) {
      caught.push(P)
      takeFromFloor(fp)
    } else if (fp.length === 2) {
      const t = ctx.playTarget != null && fp.includes(ctx.playTarget) ? ctx.playTarget : fp[0]
      caught.push(P)
      takeFromFloor([t])
    } else {
      caught.push(P)
      takeFromFloor(fp)
      steal += takeAllThree(s, mP, me)
    }
  }

  if (!flipDone && F != null) {
    const mF = monthOf(F)
    const fm = ofMonth(s.floor, mF)
    if (fm.length === 0) s.floor.push(F)
    else if (fm.length === 1) {
      caught.push(F)
      takeFromFloor(fm)
    } else if (fm.length === 2) {
      const t = ctx.flipTarget != null && fm.includes(ctx.flipTarget) ? ctx.flipTarget : fm[0]
      caught.push(F)
      takeFromFloor([t])
    } else {
      caught.push(F)
      takeFromFloor(fm)
      steal += takeAllThree(s, mF, me)
    }
  }

  const lastTurn = s.deck.length === 0 && !s.players.some(canAct)
  if (s.floor.length === 0 && caught.length > 0 && !lastTurn) {
    steal += 1
    push(s, 'sseul', me, '싹쓸이!')
  }
  p.captured.push(...caught)
  s.lastCaptured = caught.slice()

  let stolen = 0
  if (steal > 0) {
    for (let i = 0; i < s.players.length; i++) {
      if (i === me) continue
      for (let k = 0; k < steal; k++) {
        const got = stealPi(s, i, me)
        if (got != null) {
          stolen++
          s.lastCaptured.push(got)
        }
      }
    }
    if (stolen > 0) push(s, 'steal', me, `피 ${stolen}장 뺏음`)
  }

  // 설명 문구
  let msg = s.message
  if (ctx.played.length && !ctx.bomb) msg += `${p.name}: ${eulReul(nameOf(ctx.played[0]))} 냄`
  else if (!ctx.played.length) msg = msg || `${p.name}: 빈 차례`
  if (F != null) msg += `${ctx.played.length && !ctx.bomb ? ', ' : ''}${eulReul(nameOf(F))} 뒤집음`
  msg += caught.length ? ` → ${caught.length}장 먹음` : ''
  if (stolen) msg += ` · 피 ${stolen}장 뺏음`
  s.message = msg.trim()
  s.ctx = null
  return afterTurn(s)
}

/** 고/스톱 판정 및 다음 차례로 */
function afterTurn(s: GState): GState {
  const p = s.players[s.turn]
  const sc = scoreOf(p.captured).total
  const turnsLeft = s.players.some(canAct) && s.deck.length > 0
  const qualifies = sc >= s.cfg.threshold && sc > p.lastGoScore
  if (qualifies) {
    if (!turnsLeft || !canAct(p)) return finishWin(s, s.turn, '더 낼 패가 없어 자동으로 스톱!')
    s.phase = { kind: 'goStop', score: sc }
    return s
  }
  if (!turnsLeft) return finishNagari(s)
  return nextTurn(s)
}

function nextTurn(s: GState): GState {
  const n = s.players.length
  for (let k = 1; k <= n; k++) {
    const i = (s.turn + k) % n
    if (canAct(s.players[i])) {
      s.turn = i
      s.phase = { kind: 'play' }
      return s
    }
  }
  return finishNagari(s)
}

/** 고(true) 또는 스톱(false) */
export function decideGo(s0: GState, go: boolean): GState {
  if (s0.phase.kind !== 'goStop') return s0
  const s = clone(s0)
  const p = s.players[s.turn]
  s.events = []
  if (!go) {
    push(s, 'stop', s.turn, '스톱!')
    return finishWin(s, s.turn)
  }
  p.goCount++
  p.lastGoScore = s0.phase.score
  s.lastGoer = s.turn
  push(s, 'go', s.turn, `${p.goCount}고!`)
  s.message = `${p.name}: ${p.goCount}고! (${s0.phase.score}점)`
  return nextTurn(s)
}

/** 고 보너스: 1고 +1, 2고 +2, 3고부터 (+고 횟수) 후 ×2, ×4, ×8 … */
export function goBonus(goCount: number): { add: number; mult: number } {
  return { add: goCount, mult: goCount >= 3 ? 2 ** (goCount - 2) : 1 }
}

export function finishWin(s: GState, w: number, note?: string): GState {
  const win = s.players[w]
  const sc = scoreOf(win.captured)
  const { add, mult } = goBonus(win.goCount)
  const multipliers: { label: string; factor: number }[] = []
  if (mult > 1) multipliers.push({ label: `${win.goCount}고`, factor: mult })
  if (win.shakes > 0) multipliers.push({ label: win.bombs ? `흔들기·폭탄 ${win.shakes}번` : `흔들기 ${win.shakes}번`, factor: 2 ** win.shakes })
  if (sc.yeolPts > 0 && sc.yeol >= 7) multipliers.push({ label: `멍박 (열끗 ${sc.yeol}장)`, factor: 2 })
  if (s.nagariMult > 1) multipliers.push({ label: '나가리 다음 판', factor: s.nagariMult })
  const base = sc.total + add
  const globalMult = multipliers.reduce((a, m) => a * m.factor, 1)
  let payments: Payment[] = []
  for (let i = 0; i < s.players.length; i++) {
    if (i === w) continue
    const L = s.players[i]
    const reasons: string[] = []
    let f = 1
    const lp = piOf(L.captured, true)
    if (sc.piPts > 0 && lp >= 1 && lp <= PIBAK_MAX) {
      reasons.push('피박')
      f *= 2
    }
    if (sc.gwangPts > 0 && !L.captured.some((id) => getCard(id).kind === 'gwang')) {
      reasons.push('광박')
      f *= 2
    }
    if (s.mode === 'matgo' && L.goCount > 0) {
      reasons.push('고박')
      f *= 2
    }
    payments.push({ from: i, points: base * globalMult * f, reasons, paysFor: [] })
  }
  if (s.mode === 'gostop') {
    // 고박: 고를 불렀다가 진 사람이 다른 사람 몫까지 모두 냄
    const goers = payments.filter((pm) => s.players[pm.from].goCount > 0)
    if (goers.length) {
      const g = goers.find((pm) => pm.from === s.lastGoer) ?? goers[0]
      const total = payments.reduce((a, pm) => a + pm.points, 0)
      payments = payments.map((pm) =>
        pm === g
          ? { ...pm, points: total, reasons: [...pm.reasons, '고박'], paysFor: payments.filter((x) => x !== g).map((x) => x.from) }
          : { ...pm, points: 0 },
      )
    }
  }
  const items = sc.items.slice()
  if (sc.gukjinAsPi) items.push({ key: 'gukjin', label: '국진 → 쌍피로 사용', points: 0 })
  s.result = {
    kind: 'win',
    winner: w,
    items,
    base,
    goCount: win.goCount,
    multipliers,
    payments,
    nextMult: 1,
    note,
  }
  s.phase = { kind: 'over' }
  s.message = `${win.name} 스톱! ${sc.total}점`
  return s
}

function finishNagari(s: GState): GState {
  push(s, 'nagari', s.turn, '나가리!')
  s.result = {
    kind: 'nagari',
    winner: null,
    items: [],
    base: 0,
    goCount: 0,
    multipliers: [],
    payments: [],
    nextMult: s.nagariMult * 2,
  }
  s.phase = { kind: 'over' }
  s.message = '아무도 스톱하지 못해 나가리! 다음 판은 점수 두 배'
  return s
}

function finishChongtong(s: GState, w: number, month: number): GState {
  const pts = CHONGTONG_POINTS * s.nagariMult
  push(s, 'chongtong', w, '총통!')
  s.result = {
    kind: 'chongtong',
    winner: w,
    items: [{ key: 'chongtong', label: `총통 (${month}월 4장)`, points: CHONGTONG_POINTS }],
    base: CHONGTONG_POINTS,
    goCount: 0,
    multipliers: s.nagariMult > 1 ? [{ label: '나가리 다음 판', factor: s.nagariMult }] : [],
    payments: s.players.map((_, i) => i).filter((i) => i !== w).map((i) => ({ from: i, points: pts, reasons: [], paysFor: [] })),
    nextMult: 1,
  }
  s.phase = { kind: 'over' }
  s.message = `${s.players[w].name}: ${month}월 네 장 총통!`
  return s
}

/** 자동 단계(flip/resolve) 한 번 진행 */
export function advance(s: GState): GState {
  if (s.phase.kind === 'flip') return flip(s)
  if (s.phase.kind === 'resolve') return resolve(s)
  return s
}

/** 진행 중인 판의 남은 카드까지 모두 세어 48장인지 확인 (테스트용) */
export function allCards(s: GState): number[] {
  const out = [...s.floor, ...s.deck]
  if (s.ctx?.flipped != null) out.push(s.ctx.flipped)
  for (const p of s.players) out.push(...p.hand, ...p.captured)
  return out
}

// ---------- AI ----------

const GODORI = GODORI_IDS as readonly number[]
const DANS = [HONGDAN_IDS, CHEONGDAN_IDS, CHODAN_IDS] as const

/** 먹은 패의 가치(점수 + 족보 진행도). others가 있으면 막힌 족보는 진행 가치 없음. */
export function evalCaptured(captured: readonly number[], others: readonly (readonly number[])[] = []): number {
  const sc = scoreOf(captured)
  const set = new Set(captured)
  const blocked = (ids: readonly number[]) => others.some((o) => o.some((c) => ids.includes(c)))
  let v = sc.total * 8
  let g = 0
  for (const id of captured) {
    const c = getCard(id)
    if (c.kind === 'gwang') {
      g++
      v += c.isBiGwang ? 1.5 : 2.5
    } else if (c.kind === 'yeol') v += 0.7
    else if (c.kind === 'tti') v += 0.6
    else v += c.piValue * 0.7
  }
  if (g === 2) v += 2
  const godori = GODORI.filter((id) => set.has(id)).length
  if (godori < 3 && !blocked(GODORI)) v += godori * godori * 1.3
  for (const d of DANS) {
    const k = d.filter((id) => set.has(id)).length
    if (k < 3 && !blocked(d)) v += k * k * 1.1
  }
  const pi = piOf(captured, true)
  if (pi < 10) v += Math.min(pi, PIBAK_MAX + 1) * 0.4 // 피박 피하기
  if (sc.yeol >= 4 && sc.yeol < 5) v += 1.5
  if (sc.tti >= 4 && sc.tti < 5) v += 1.5
  return v
}

function stateValue(s: GState, me: number): number {
  const caps = s.players.map((p) => p.captured)
  const mine = evalCaptured(caps[me], caps.filter((_, i) => i !== me))
  let worst = 0
  let sum = 0
  s.players.forEach((p, i) => {
    if (i === me) return
    const v = evalCaptured(p.captured, caps.filter((_, j) => j !== i))
    worst = Math.max(worst, v)
    sum += v
  })
  return mine - 0.75 * worst - 0.15 * sum
}

/** 플레이어 me가 볼 수 없는 카드 (더미 + 다른 사람 손패) */
export function unseenCards(s: GState, me: number): number[] {
  const out = s.deck.slice()
  s.players.forEach((p, i) => {
    if (i !== me) out.push(...p.hand)
  })
  return out
}

/** 가장 좋은 선택지 (두 장 중 하나) */
function greedyChoice(s: GState, options: number[]): number {
  const me = s.turn
  const others = s.players.filter((_, i) => i !== me).map((p) => p.captured)
  const mine = s.players[me].captured
  let best = options[0]
  let bv = -Infinity
  for (const o of options) {
    const v = evalCaptured([...mine, o], others)
    if (v > bv) {
      bv = v
      best = o
    }
  }
  return best
}

/** action 후 더미 맨 위가 flipCard라고 가정하고 차례 끝까지 진행 */
export function simulate(s0: GState, action: PlayAction, flipCard: number | null): GState {
  let s = clone(s0)
  if (flipCard != null && s.deck.length && s.deck[0] !== flipCard) {
    const di = s.deck.indexOf(flipCard)
    if (di > 0) [s.deck[0], s.deck[di]] = [s.deck[di], s.deck[0]]
    else {
      for (const p of s.players) {
        const hi = p.hand.indexOf(flipCard)
        if (hi >= 0) {
          ;[p.hand[hi], s.deck[0]] = [s.deck[0], p.hand[hi]]
          break
        }
      }
    }
  }
  s = play(s, action)
  for (let guard = 0; guard < 8; guard++) {
    const ph = s.phase
    if (ph.kind === 'chooseHand' || ph.kind === 'chooseFlip') s = choose(s, greedyChoice(s, ph.options))
    else if (ph.kind === 'flip' || ph.kind === 'resolve') s = advance(s)
    else break
  }
  return s
}

function pickRandom<T>(a: readonly T[], rng: () => number): T {
  return a[Math.floor(rng() * a.length)]
}

function sample<T>(a: readonly T[], n: number, rng: () => number): T[] {
  const b = a.slice()
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b.slice(0, n)
}

/** AI: 이번 차례에 할 행동 */
export function aiAction(s: GState, diff: Difficulty, rng: () => number = Math.random): PlayAction {
  const acts = legalActions(s)
  if (!acts.length) throw new Error('낼 수 있는 행동이 없어요')
  const me = s.turn
  const p = s.players[me]
  if (diff === 'easy') {
    const bomb = acts.find((a) => a.type === 'card' && a.bomb)
    if (bomb && rng() < 0.5) return bomb
    const cards = acts.filter((a): a is Extract<PlayAction, { type: 'card' }> => a.type === 'card' && !a.bomb)
    if (!cards.length) return acts[0]
    const matching = cards.filter((a) => matchesOnFloor(s, a.card).length > 0)
    const pool = matching.length && rng() < 0.7 ? matching : cards
    const a = pickRandom(pool, rng)
    return a.shake && rng() < 0.5 ? a : { type: 'card', card: a.card }
  }
  const unseen = unseenCards(s, me)
  const samples: (number | null)[] = unseen.length === 0 ? [null] : diff === 'hard' ? unseen : sample(unseen, Math.min(8, unseen.length), rng)
  // 이미 공개된 카드로 각 달의 남은(안 보이는) 장수 세기
  const hidden = new Map<number, number>()
  for (const c of unseen) hidden.set(monthOf(c), (hidden.get(monthOf(c)) ?? 0) + 1)
  let best = acts[0]
  let bestV = -Infinity
  const before = stateValue(s, me)
  for (const a of acts) {
    let total = 0
    for (const f of samples) {
      const r = simulate(s, a, f)
      let v = stateValue(r, me) - before
      if (diff === 'hard') {
        // 바닥에 남긴 카드는 상대가 가져갈 수 있음
        for (const fc of r.floor) {
          if (s.floor.includes(fc)) continue
          const h = hidden.get(monthOf(fc)) ?? 0
          if (h > 0) v -= (evalCaptured([fc]) * 0.35 * Math.min(h, 2)) / 2
        }
        // 뻑을 남기면 상대가 뻑 먹기로 피를 뺏어갈 수 있음
        for (const m of Object.keys(r.ppeok)) if (s.ppeok[+m] == null && (hidden.get(+m) ?? 0) > 0) v -= 3
      }
      total += v
    }
    let v = total / samples.length
    if (a.type === 'dummy') v += 0.3 // 손패를 아낌
    if (a.type === 'card' && a.bomb) v += 2
    // 손에 같은 달 2장을 쥐고 있으면 기다렸다 먹을 수 있으니 섣불리 버리지 않기
    if (a.type === 'card' && !a.bomb && matchesOnFloor(s, a.card).length === 0) {
      const pair = ofMonth(p.hand, monthOf(a.card)).length
      if (pair >= 2 && diff === 'hard') v -= 1.2
    }
    if (diff === 'normal') v += rng() * 2
    else v += rng() * 0.2
    if (v > bestV) {
      bestV = v
      best = a
    }
  }
  return best
}

/** AI: 두 장 중 고르기 */
export function aiChoose(s: GState, diff: Difficulty, rng: () => number = Math.random): number {
  const ph = s.phase
  if (ph.kind !== 'chooseHand' && ph.kind !== 'chooseFlip') throw new Error('고를 것이 없어요')
  if (diff === 'easy' && rng() < 0.5) return pickRandom(ph.options, rng)
  return greedyChoice(s, ph.options)
}

/** 상대가 곧 점수를 낼 위험도 (점수 + 거의 완성된 족보) */
export function threatOf(captured: readonly number[], others: readonly (readonly number[])[]): number {
  const sc = scoreOf(captured)
  const set = new Set(captured)
  const blocked = (ids: readonly number[]) => others.some((o) => o.some((c) => ids.includes(c)))
  let t = sc.total
  const near = (ids: readonly number[], pts: number) => {
    const k = ids.filter((id) => set.has(id)).length
    if (k === ids.length - 1 && !blocked(ids)) t += pts * 0.5
  }
  near(GODORI, 5)
  for (const d of DANS) near(d, 3)
  if (sc.gwang === 2) t += 1.2
  if (sc.pi >= 8 && sc.pi < 10) t += 0.8
  if (sc.yeol === 4 || sc.tti === 4) t += 0.5
  return t
}

/** AI: 고(true) / 스톱(false) */
export function aiGoStop(s: GState, diff: Difficulty, rng: () => number = Math.random): boolean {
  const me = s.turn
  const p = s.players[me]
  const myTurns = p.hand.length + p.dummies
  const T = s.cfg.threshold
  const caps = s.players.map((q) => q.captured)
  const opps = s.players.map((_, i) => i).filter((i) => i !== me)
  if (myTurns === 0 || s.deck.length === 0) return false
  if (diff === 'easy') return myTurns >= 2 && rng() < 0.55
  const oppMax = Math.max(...opps.map((i) => scoreOf(caps[i]).total))
  if (diff === 'normal') {
    const safe = s.mode === 'matgo' ? oppMax <= 3 : oppMax <= 1
    return safe && myTurns >= 3 && p.goCount < 3
  }
  // hard: 상대 위협과 남은 차례를 함께 고려
  const threat = Math.max(...opps.map((i) => threatOf(caps[i], caps.filter((_, j) => j !== i))))
  const risk = threat / T
  // 상대 손패가 많을수록 따라잡을 기회가 많음
  const oppTurns = Math.max(...opps.map((i) => s.players[i].hand.length + s.players[i].dummies))
  const limit = s.mode === 'matgo' ? 0.62 : 0.45
  let go = risk < limit && myTurns >= 2 && oppTurns >= 1
  if (p.goCount >= 3 && risk > limit * 0.6) go = false
  if (s.deck.length <= 3 && risk > 0.3) go = false
  // 상대가 아직 점수가 없고 피박·광박 상태라면 굳이 무리하지 않아도 큰 점수
  const sc = scoreOf(p.captured).total
  if (sc >= T * 2.5 && risk > 0.3) go = false
  return go
}

/** AI가 현재 단계 하나를 진행 (자동 단계 포함) */
export function aiStep(s: GState, diff: Difficulty, rng: () => number = Math.random): GState {
  const ph = s.phase
  if (ph.kind === 'play') return play(s, aiAction(s, diff, rng))
  if (ph.kind === 'chooseHand' || ph.kind === 'chooseFlip') return choose(s, aiChoose(s, diff, rng))
  if (ph.kind === 'goStop') return decideGo(s, aiGoStop(s, diff, rng))
  return advance(s)
}

