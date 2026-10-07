// 맞고(2명)·고스톱(3명) 온라인 어댑터. 규칙은 src/games/gostop-core/logic.ts를 그대로 씀.
//
// 한 게임 = MATCH_ROUNDS판짜리 한 매치. 판마다 점수(점)를 주고받아 누적하고,
// 마지막 판이 끝나면 누적 점수가 가장 높은 사람이 이겨요. 나가리도 한 판으로 세고 다음 판 점수가 두 배.
// 판이 끝나면 정산 화면을 보여 주고, 모두 "다음 판"을 누르면 (선은 이긴 사람) 새 판을 나눠요.
//
// 이름은 `{0}` 같은 자리 표시로 저장하고 화면에서 좌석 이름으로 바꿔요.
import {
  aiAction,
  aiChoose,
  aiGoStop,
  advance,
  canBomb,
  canShake,
  choose,
  decideGo,
  newRound,
  play,
  type GEvent,
  type GState,
  type Mode,
  type PlayAction,
} from '../../games/gostop-core/logic'
import { assertLegal, type OnlineGame, type Rng } from '../engine'

export const MATCH_ROUNDS = 3

export type GostopAction =
  | { type: 'play'; card: number; shake?: boolean; bomb?: boolean }
  | { type: 'dummy' }
  | { type: 'choose'; card: number }
  | { type: 'go'; go: boolean }
  | { type: 'next' }

export interface LastTurn {
  seat: number
  played: number[]
  flipped: number | null
  captured: number[]
}

export interface RoundLog {
  winner: number | null
  kind: 'win' | 'nagari' | 'chongtong'
  delta: number[]
}

export interface GostopMatch {
  mode: Mode
  rounds: number
  round: number
  first: number
  g: GState
  /** 누적 점수 (점) */
  totals: number[]
  history: RoundLog[]
  stage: 'play' | 'roundOver' | 'matchOver'
  ready: boolean[]
  last: LastTurn | null
  /** 이번 동작에서 일어난 사건 (토스트용) */
  events: GEvent[]
  seq: number
  log: string[]
}

export interface GostopView extends Omit<GostopMatch, 'g'> {
  /** 다른 사람 손패와 더미는 비워서 보냄 */
  g: GState
  handCounts: number[]
  deckCount: number
}

const token = (i: number) => `{${i}}`
const LOG_MAX = 8

function pointsDelta(g: GState): number[] {
  const d = g.players.map(() => 0)
  const r = g.result
  if (!r || r.winner == null) return d
  for (const p of r.payments) {
    d[p.from] -= p.points
    d[r.winner] += p.points
  }
  return d
}

function startRound(mode: Mode, n: number, first: number, nagariMult: number, rng: Rng): GState {
  const players = Array.from({ length: n }, (_, i) => ({ name: token(i), isAI: false }))
  return newRound(players, mode, { rng, first, nagariMult })
}

function addLog(m: GostopMatch, text: string) {
  if (!text) return
  m.log = [...m.log, text].slice(-LOG_MAX)
}

/** 판이 끝났으면 정산 */
function settleIfOver(m: GostopMatch) {
  if (m.g.phase.kind !== 'over' || m.stage !== 'play') return
  const delta = pointsDelta(m.g)
  m.totals = m.totals.map((t, i) => t + delta[i])
  m.history = [...m.history, { winner: m.g.result!.winner, kind: m.g.result!.kind, delta }]
  addLog(m, m.g.message)
  m.stage = m.round >= m.rounds ? 'matchOver' : 'roundOver'
  m.ready = m.g.players.map(() => false)
}

function freshMatch(mode: Mode, n: number, rng: Rng): GostopMatch {
  const first = Math.floor(rng() * n)
  const m: GostopMatch = {
    mode,
    rounds: MATCH_ROUNDS,
    round: 1,
    first,
    g: startRound(mode, n, first, 1, rng),
    totals: Array.from({ length: n }, () => 0),
    history: [],
    stage: 'play',
    ready: Array.from({ length: n }, () => false),
    last: null,
    events: [],
    seq: 0,
    log: [],
  }
  m.events = m.g.events.slice()
  if (m.events.length) m.seq++
  settleIfOver(m)
  return m
}

/** 자동 단계(뒤집기·정리)를 사람이 고를 차례까지 진행하며 사건을 모음 */
function runAuto(m: GostopMatch, g: GState, events: GEvent[]): GState {
  for (let guard = 0; guard < 10; guard++) {
    const k = g.phase.kind
    if (k !== 'flip' && k !== 'resolve') break
    if (k === 'resolve' && g.ctx) {
      m.last = { seat: g.turn, played: g.ctx.played.slice(), flipped: g.ctx.flipped, captured: [] }
    }
    const before = g
    g = advance(g)
    if (before.phase.kind === 'resolve') {
      events.push(...g.events)
      if (m.last) m.last.captured = g.lastCaptured.slice()
      addLog(m, g.message)
    } else if (before.phase.kind === 'flip') events.push(...g.events)
  }
  return g
}

export function makeGostopGame(mode: Mode, name: string, emoji: string, players: number): OnlineGame<GostopMatch, GostopAction, GostopView> {
  return {
    id: mode,
    name,
    emoji,
    minPlayers: players,
    maxPlayers: players,
    bots: true,
    setup: (n, rng) => freshMatch(mode, n, rng),
    toAct(m) {
      if (m.stage === 'matchOver') return []
      if (m.stage === 'roundOver') return m.ready.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0)
      const k = m.g.phase.kind
      return k === 'play' || k === 'chooseHand' || k === 'chooseFlip' || k === 'goStop' ? [m.g.turn] : []
    },
    apply(m0, seat, a, rng) {
      assertLegal(a && typeof a === 'object', '잘못된 요청이에요')
      assertLegal(m0.stage !== 'matchOver', '이미 끝난 게임이에요')
      const m: GostopMatch = { ...m0, ready: m0.ready.slice(), events: [] }
      if (m0.stage === 'roundOver') {
        assertLegal(a.type === 'next', '다음 판을 기다리는 중이에요')
        assertLegal(!m.ready[seat], '이미 준비했어요')
        m.ready[seat] = true
        if (m.ready.every(Boolean)) {
          const r = m0.g.result!
          m.round++
          m.first = r.winner ?? m.first
          m.g = startRound(mode, m.totals.length, m.first, r.kind === 'nagari' ? r.nextMult : 1, rng)
          m.stage = 'play'
          m.ready = m.ready.map(() => false)
          m.last = null
          m.events = m.g.events.slice()
          if (m.events.length) m.seq++
          addLog(m, `${m.round}판째 시작!`)
          settleIfOver(m)
        }
        return m
      }
      const g0 = m0.g
      assertLegal(seat === g0.turn, '지금은 내 차례가 아니에요')
      const ph = g0.phase
      const events: GEvent[] = []
      let g: GState
      if (a.type === 'play' || a.type === 'dummy') {
        assertLegal(ph.kind === 'play', '지금은 카드를 낼 때가 아니에요')
        const p = g0.players[seat]
        let pa: PlayAction
        if (a.type === 'dummy') {
          assertLegal(p.dummies > 0, '빈 차례가 남아 있지 않아요')
          pa = { type: 'dummy' }
        } else {
          assertLegal(Number.isInteger(a.card) && p.hand.includes(a.card), '내 손에 없는 카드예요')
          if (a.bomb) assertLegal(canBomb(g0, a.card), '폭탄을 할 수 없는 카드예요')
          if (a.shake && !a.bomb) assertLegal(canShake(g0, a.card), '흔들 수 없는 카드예요')
          pa = { type: 'card', card: a.card, bomb: a.bomb || undefined, shake: (a.shake && !a.bomb) || undefined }
        }
        g = play(g0, pa)
        assertLegal(g !== g0, '낼 수 없어요')
        events.push(...g.events)
        m.last = null
      } else if (a.type === 'choose') {
        assertLegal(ph.kind === 'chooseHand' || ph.kind === 'chooseFlip', '지금은 고를 때가 아니에요')
        assertLegal(ph.options.includes(a.card), '고를 수 있는 카드가 아니에요')
        g = choose(g0, a.card)
      } else if (a.type === 'go') {
        assertLegal(ph.kind === 'goStop', '지금은 고/스톱을 정할 때가 아니에요')
        g = decideGo(g0, !!a.go)
        events.push(...g.events)
        if (g.phase.kind !== 'over') addLog(m, g.message)
      } else {
        assertLegal(false, '알 수 없는 동작이에요')
      }
      g = runAuto(m, g, events)
      m.g = g
      m.events = events
      if (events.length) m.seq = m0.seq + 1
      settleIfOver(m)
      return m
    },
    view(m, seat) {
      const g: GState = {
        ...m.g,
        deck: [],
        players: m.g.players.map((p, i) => (i === seat ? p : { ...p, hand: [] })),
      }
      return { ...m, g, handCounts: m.g.players.map((p) => p.hand.length), deckCount: m.g.deck.length }
    },
    result(m) {
      if (m.stage !== 'matchOver') return null
      const best = Math.max(...m.totals)
      const winners = m.totals.every((t) => t === best) ? [] : m.totals.map((t, i) => (t === best ? i : -1)).filter((i) => i >= 0)
      return {
        winners,
        summary: winners.length ? `${m.rounds}판 합계 ${best > 0 ? '+' : ''}${best}점 (점당 100원 가상 머니)` : `${m.rounds}판 합계가 모두 같아요 — 무승부`,
        scores: m.totals.slice(),
      }
    },
    bot(m, _seat, rng) {
      if (m.stage === 'roundOver') return { type: 'next' }
      const g = m.g
      const ph = g.phase
      if (ph.kind === 'chooseHand' || ph.kind === 'chooseFlip') return { type: 'choose', card: aiChoose(g, 'normal', rng) }
      if (ph.kind === 'goStop') return { type: 'go', go: aiGoStop(g, 'normal', rng) }
      const pa = aiAction(g, 'normal', rng)
      return pa.type === 'dummy' ? { type: 'dummy' } : { type: 'play', card: pa.card, shake: pa.shake, bomb: pa.bomb }
    },
  }
}

export const gostop = makeGostopGame('gostop', '고스톱', '🌸', 3)
