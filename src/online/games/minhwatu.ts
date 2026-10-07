// 민화투 온라인 어댑터. 규칙·AI는 src/games/minhwatu/logic.ts를 그대로 씀.
//
// 한 게임 = MATCH_ROUNDS판짜리 한 매치. 판마다 얻은 점수(패 점수 + 약)를 더해 누적이 가장 높은 사람이 이겨요.
// 판이 끝나면 점수를 보여 주고, 모두 "다음 판"을 누르면 다음 사람이 선이 되어 새로 나눠요.
// 더미 뒤집기는 서버가 바로 진행해요 (뒤집은 카드는 화면에 표시).
import { aiChoose, aiPlay, chooseFlip, chooseHand, deal, flip, playCard, scoreOf, type MState } from '../../games/minhwatu/logic'
import { assertLegal, type OnlineGame } from '../engine'

export const MATCH_ROUNDS = 3

export type MinhwatuAction = { type: 'play'; card: number; choice?: number } | { type: 'choose'; card: number } | { type: 'next' }

export interface MinhwatuMatch {
  g: MState
  rounds: number
  round: number
  first: number
  /** 누적 점수 */
  totals: number[]
  /** 판별 점수 */
  history: number[][]
  stage: 'play' | 'roundOver' | 'matchOver'
  ready: boolean[]
  /** `{0}` 자리 표시는 화면에서 좌석 이름으로 바꿔요 */
  log: string[]
}

export interface MinhwatuView extends MinhwatuMatch {
  handCounts: number[]
  deckCount: number
}

const LOG_MAX = 8

function names(n: number) {
  return Array.from({ length: n }, (_, i) => ({ name: `{${i}}`, isAI: false }))
}

function addLog(m: MinhwatuMatch, text: string) {
  if (text.trim()) m.log = [...m.log, text.trim()].slice(-LOG_MAX)
}

/** 뒤집기는 자동으로 진행 */
function runFlip(g: MState): MState {
  while (g.phase.kind === 'flip') g = flip(g)
  return g
}

function afterStep(m: MinhwatuMatch) {
  const k = m.g.phase.kind
  if (k === 'play' || k === 'over') addLog(m, m.g.message)
  if (k !== 'over') return
  const pts = m.g.players.map((p) => scoreOf(p.captured).total)
  m.totals = m.totals.map((t, i) => t + pts[i])
  m.history = [...m.history, pts]
  m.stage = m.round >= m.rounds ? 'matchOver' : 'roundOver'
  m.ready = pts.map(() => false)
}

export const minhwatu: OnlineGame<MinhwatuMatch, MinhwatuAction, MinhwatuView> = {
  id: 'minhwatu',
  name: '민화투',
  emoji: '🌺',
  minPlayers: 2,
  maxPlayers: 3,
  bots: true,
  setup(n, rng) {
    const first = Math.floor(rng() * n)
    return {
      g: deal(names(n), rng, first),
      rounds: MATCH_ROUNDS,
      round: 1,
      first,
      totals: Array.from({ length: n }, () => 0),
      history: [],
      stage: 'play',
      ready: Array.from({ length: n }, () => false),
      log: [],
    }
  },
  toAct(m) {
    if (m.stage === 'matchOver') return []
    if (m.stage === 'roundOver') return m.ready.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0)
    return m.g.phase.kind === 'over' ? [] : [m.g.turn]
  },
  apply(m0, seat, a, rng) {
    assertLegal(a && typeof a === 'object', '잘못된 요청이에요')
    assertLegal(m0.stage !== 'matchOver', '이미 끝난 게임이에요')
    const m: MinhwatuMatch = { ...m0, ready: m0.ready.slice() }
    if (m0.stage === 'roundOver') {
      assertLegal(a.type === 'next', '다음 판을 기다리는 중이에요')
      assertLegal(!m.ready[seat], '이미 준비했어요')
      m.ready[seat] = true
      if (m.ready.every(Boolean)) {
        const n = m.totals.length
        m.round++
        m.first = (m.first + 1) % n
        m.g = deal(names(n), rng, m.first)
        m.stage = 'play'
        m.ready = m.ready.map(() => false)
        addLog(m, `${m.round}판째 시작!`)
      }
      return m
    }
    const g0 = m0.g
    assertLegal(seat === g0.turn, '지금은 내 차례가 아니에요')
    const ph = g0.phase
    let g: MState
    if (a.type === 'play') {
      assertLegal(ph.kind === 'play', '지금은 카드를 낼 때가 아니에요')
      assertLegal(Number.isInteger(a.card) && g0.players[seat].hand.includes(a.card), '내 손에 없는 카드예요')
      g = playCard(g0, a.card, typeof a.choice === 'number' ? a.choice : undefined)
    } else if (a.type === 'choose') {
      assertLegal(ph.kind === 'chooseHand' || ph.kind === 'chooseFlip', '지금은 고를 때가 아니에요')
      assertLegal(ph.options.includes(a.card), '고를 수 있는 카드가 아니에요')
      g = ph.kind === 'chooseHand' ? chooseHand(g0, a.card) : chooseFlip(g0, a.card)
    } else {
      assertLegal(false, '알 수 없는 동작이에요')
    }
    assertLegal(g !== g0, '할 수 없는 동작이에요')
    m.g = runFlip(g)
    afterStep(m)
    return m
  },
  view(m, seat) {
    const g: MState = {
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
      summary: winners.length ? `${m.rounds}판 합계 최고 ${best}점` : `${m.rounds}판 합계가 모두 ${best}점 — 무승부`,
      scores: m.totals.slice(),
    }
  },
  bot(m, _seat, rng) {
    if (m.stage === 'roundOver') return { type: 'next' }
    const k = m.g.phase.kind
    if (k === 'chooseHand' || k === 'chooseFlip') return { type: 'choose', card: aiChoose(m.g, 'normal', rng) }
    return { type: 'play', card: aiPlay(m.g, 'normal', rng) }
  },
}
