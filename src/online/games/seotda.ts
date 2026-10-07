// 섯다 온라인 어댑터. 규칙·AI는 src/games/seotda/logic.ts를 그대로 씀.
//
// 한 게임 = 한 매치: 모두 START_CHIPS 가상 칩으로 시작해 MAX_HANDS판(재경기 제외)을 하거나
// 칩이 남은 사람이 한 명이 되면 끝. 칩이 가장 많은 사람이 이겨요. 칩은 방 안에서만 쓰이고 저장되지 않아요.
// 판이 끝나면 모두의 패(다이하지 않은 사람)를 공개하고, 모두 "다음 판"을 누르면 다음 판을 나눠요.
import { ACTION_LABEL, ANTE, START_CHIPS, active, aiAction, applyAction, legalActions, raiseTarget, settle, startHand, toCall, type Action, type SPlayer, type Table } from '../../games/seotda/logic'
import { assertLegal, type OnlineGame, type Rng } from '../engine'

export const MAX_HANDS = 10

export type SeotdaAction = { type: 'bet'; action: Action } | { type: 'next' }

export interface SeotdaMatch {
  t: Table
  stage: 'bet' | 'handOver' | 'matchOver'
  ready: boolean[]
  winnings: number[]
  /** 재경기를 뺀 끝난 판 수 */
  handsDone: number
  maxHands: number
  /** `{0}` 자리 표시는 화면에서 좌석 이름으로 바꿔요 */
  log: string[]
}

/** 가려진 카드는 -1 */
export type SeotdaView = SeotdaMatch

const ACTIONS: Action[] = ['die', 'call', 'bbing', 'half']
const LOG_MAX = 8

function addLog(m: SeotdaMatch, text: string) {
  m.log = [...m.log, text].slice(-LOG_MAX)
}

function solvent(ps: SPlayer[]): number[] {
  return ps.map((p, i) => (p.chips >= ANTE ? i : -1)).filter((i) => i >= 0)
}

/** 승부가 났으면 칩 정산 */
function settleIfShowdown(m: SeotdaMatch) {
  const t = m.t
  if (t.phase !== 'showdown' || m.stage !== 'bet') return
  const r = t.result!
  const s = settle(t)
  m.t = { ...t, players: s.players }
  m.winnings = s.winnings
  const redeal = r.kind === 'redeal'
  if (redeal) addLog(m, `{${r.by}}: ${r.reason}`)
  else {
    m.handsDone++
    addLog(m, `${r.winners.map((w) => `{${w}}`).join(', ')} 승! 판돈 ${t.pot}${r.reason ? ` (${r.reason})` : ''}`)
  }
  const alive = solvent(s.players)
  if (redeal && alive.length < 2) {
    // 재경기인데 칩이 남은 사람이 모자라면 판돈을 승부에 남은 사람끼리 나누고 끝냄
    const left = active(t)
    const share = Math.floor(t.pot / left.length)
    let rest = t.pot - share * left.length
    const ps = m.t.players.map((p) => ({ ...p }))
    for (const i of left) {
      ps[i].chips += share + (rest > 0 ? 1 : 0)
      if (rest > 0) rest--
    }
    m.t = { ...m.t, players: ps, carry: 0 }
    m.stage = 'matchOver'
  } else if (!redeal && (alive.length < 2 || m.handsDone >= m.maxHands)) m.stage = 'matchOver'
  else m.stage = 'handOver'
  m.ready = t.players.map(() => false)
}

function describe(t: Table, i: number, a: Action): string {
  if (a === 'die') return '다이'
  const p = t.players[i]
  if (a === 'call') {
    const c = Math.min(toCall(t, i), p.chips)
    return c === 0 ? '체크' : `콜 ${c}`
  }
  return `${ACTION_LABEL[a]} +${raiseTarget(t, i, a)! - p.bet}`
}

function nextHand(m: SeotdaMatch, rng: Rng) {
  const t = m.t
  const redeal = t.result?.kind === 'redeal'
  const ps = t.players.map((p) => ({ ...p }))
  const n = ps.length
  let dealer = t.dealer
  if (!redeal) {
    for (let k = 1; k <= n; k++) {
      const j = (dealer + k) % n
      if (ps[j].chips >= ANTE) {
        dealer = j
        break
      }
    }
  }
  m.t = startHand(ps, dealer, redeal ? t.pot : 0, t.handNo + 1, rng)
  m.stage = 'bet'
  m.winnings = []
  m.ready = ps.map(() => false)
}

export const seotda: OnlineGame<SeotdaMatch, SeotdaAction, SeotdaView> = {
  id: 'seotda',
  name: '섯다',
  emoji: '🎴',
  minPlayers: 2,
  maxPlayers: 5,
  bots: true,
  setup(n, rng) {
    const players: SPlayer[] = Array.from({ length: n }, (_, i) => ({
      name: `{${i}}`,
      isAI: false,
      chips: START_CHIPS,
      bet: 0,
      folded: false,
      inHand: true,
      cards: [],
    }))
    return {
      t: startHand(players, Math.floor(rng() * n), 0, 1, rng),
      stage: 'bet',
      ready: players.map(() => false),
      winnings: [],
      handsDone: 0,
      maxHands: MAX_HANDS,
      log: [],
    }
  },
  toAct(m) {
    if (m.stage === 'matchOver') return []
    if (m.stage === 'handOver') return m.ready.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0)
    return [m.t.turn]
  },
  apply(m0, seat, a, rng) {
    assertLegal(a && typeof a === 'object', '잘못된 요청이에요')
    assertLegal(m0.stage !== 'matchOver', '이미 끝난 게임이에요')
    const m: SeotdaMatch = { ...m0, ready: m0.ready.slice() }
    if (m0.stage === 'handOver') {
      assertLegal(a.type === 'next', '다음 판을 기다리는 중이에요')
      assertLegal(!m.ready[seat], '이미 준비했어요')
      m.ready[seat] = true
      if (m.ready.every(Boolean)) nextHand(m, rng)
      return m
    }
    assertLegal(a.type === 'bet', '지금은 베팅할 차례예요')
    assertLegal(seat === m0.t.turn, '지금은 내 차례가 아니에요')
    assertLegal(ACTIONS.includes(a.action) && legalActions(m0.t, seat).includes(a.action), '지금 할 수 없는 베팅이에요')
    m.t = applyAction(m0.t, a.action)
    addLog(m, `{${seat}}: ${describe(m0.t, seat, a.action)}`)
    settleIfShowdown(m)
    return m
  },
  view(m, seat) {
    const showdown = m.stage !== 'bet'
    const players = m.t.players.map((p, i) => {
      const visible = i === seat || (showdown && p.inHand && !p.folded)
      return visible ? p : { ...p, cards: p.cards.map(() => -1) }
    })
    return { ...m, t: { ...m.t, deck: [], players } }
  },
  result(m) {
    if (m.stage !== 'matchOver') return null
    const chips = m.t.players.map((p) => p.chips)
    const best = Math.max(...chips)
    const winners = chips.every((c) => c === best) ? [] : chips.map((c, i) => (c === best ? i : -1)).filter((i) => i >= 0)
    return {
      winners,
      summary: `${m.handsDone}판 끝 · 최고 ${best}칩 (시작 ${START_CHIPS}칩, 가상 칩)`,
      scores: chips,
    }
  },
  bot(m, seat, rng) {
    if (m.stage === 'handOver') return { type: 'next' }
    return { type: 'bet', action: aiAction(m.t, seat, 'normal', rng) }
  },
}
