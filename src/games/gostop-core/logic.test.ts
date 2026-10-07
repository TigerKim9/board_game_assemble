import { describe, expect, it } from 'vitest'
import { getCard } from '../../hwatu'
import { mulberry32 } from '../../lib/random'
import type { Difficulty } from '../../lib/types'
import {
  advance,
  aiAction,
  aiChoose,
  aiGoStop,
  aiStep,
  allCards,
  canBomb,
  canShake,
  choose,
  decideGo,
  finishWin,
  goBonus,
  legalActions,
  newRound,
  play,
  scoreOf,
  type GState,
  type Mode,
  type PlayAction,
} from './logic'

// 카드 id: (달-1)*4 + slot
const c = (month: number, slot: number) => (month - 1) * 4 + slot

const PEOPLE = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isAI: true }))

/** 원하는 상황을 직접 만듦 */
function mk(mode: Mode, o: { hands: number[][]; floor: number[]; deck: number[]; captured?: number[][]; turn?: number }): GState {
  const s = newRound(PEOPLE(mode === 'matgo' ? 2 : 3), mode, { rng: mulberry32(1) })
  s.result = null
  s.phase = { kind: 'play' }
  s.players.forEach((p, i) => {
    p.hand = o.hands[i] ?? []
    p.captured = o.captured?.[i] ?? []
  })
  s.floor = o.floor
  s.deck = o.deck
  s.turn = o.turn ?? 0
  return s
}

/** 행동 후 자동 단계를 끝까지 진행 (선택지는 첫 번째) */
function run(s: GState, a: PlayAction, pick?: number): GState {
  let r = play(s, a)
  for (let g = 0; g < 10; g++) {
    const ph = r.phase
    if (ph.kind === 'chooseHand' || ph.kind === 'chooseFlip') r = choose(r, pick != null && ph.options.includes(pick) ? pick : ph.options[0])
    else if (ph.kind === 'flip' || ph.kind === 'resolve') r = advance(r)
    else break
  }
  return r
}

const card = (id: number): PlayAction => ({ type: 'card', card: id })

describe('점수 계산', () => {
  it('광', () => {
    expect(scoreOf([c(1, 0), c(3, 0), c(8, 0)]).total).toBe(3)
    expect(scoreOf([c(1, 0), c(3, 0), c(12, 0)]).total).toBe(2) // 비광 포함 3광
    expect(scoreOf([c(1, 0), c(3, 0), c(8, 0), c(12, 0)]).total).toBe(4)
    expect(scoreOf([c(1, 0), c(3, 0), c(8, 0), c(11, 0), c(12, 0)]).total).toBe(15)
    expect(scoreOf([c(1, 0), c(3, 0)]).total).toBe(0)
  })
  it('열끗과 고도리', () => {
    expect(scoreOf([c(2, 0), c(4, 0), c(8, 1)]).total).toBe(5) // 고도리
    expect(scoreOf([c(5, 0), c(6, 0), c(7, 0), c(10, 0), c(12, 1)]).total).toBe(1)
    expect(scoreOf([c(5, 0), c(6, 0), c(7, 0), c(10, 0), c(12, 1), c(2, 0)]).total).toBe(2)
    // 고도리 + 열끗 5장
    expect(scoreOf([c(2, 0), c(4, 0), c(8, 1), c(5, 0), c(6, 0)]).total).toBe(6)
  })
  it('띠와 단', () => {
    expect(scoreOf([c(1, 1), c(2, 1), c(3, 1)]).total).toBe(3) // 홍단
    expect(scoreOf([c(6, 1), c(9, 1), c(10, 1)]).total).toBe(3) // 청단
    expect(scoreOf([c(4, 1), c(5, 1), c(7, 1)]).total).toBe(3) // 초단
    expect(scoreOf([c(1, 1), c(2, 1), c(4, 1), c(6, 1), c(12, 2)]).total).toBe(1) // 띠 5장
    // 홍단 + 띠 5장
    expect(scoreOf([c(1, 1), c(2, 1), c(3, 1), c(6, 1), c(12, 2)]).total).toBe(4)
  })
  it('피 (쌍피는 2장)', () => {
    const nine = [c(1, 2), c(1, 3), c(2, 2), c(2, 3), c(3, 2), c(3, 3), c(4, 2), c(4, 3), c(5, 2)]
    expect(scoreOf(nine).total).toBe(0)
    expect(scoreOf([...nine, c(5, 3)]).total).toBe(1)
    expect(getCard(c(11, 1)).piValue).toBe(2)
    expect(scoreOf([...nine, c(11, 1)]).total).toBe(2) // 쌍피 → 11장
    expect(scoreOf([...nine, c(11, 1), c(12, 3)]).total).toBe(4) // 13장
  })
  it('국진은 유리한 쪽(쌍피)으로 자동 선택', () => {
    const eight = [c(1, 2), c(1, 3), c(2, 2), c(2, 3), c(3, 2), c(3, 3), c(4, 2), c(4, 3)]
    const sc = scoreOf([...eight, c(9, 0)])
    expect(sc.gukjinAsPi).toBe(true)
    expect(sc.total).toBe(1)
    // 열끗 5장이 되는 경우엔 열끗으로
    const y = scoreOf([c(9, 0), c(5, 0), c(6, 0), c(7, 0), c(10, 0)])
    expect(y.gukjinAsPi).toBe(false)
    expect(y.total).toBe(1)
  })
})

describe('차례 진행', () => {
  it('짝이 맞으면 두 장을 먹고, 없으면 바닥에 내려놓음', () => {
    const s = mk('matgo', { hands: [[c(1, 0), c(5, 0)], [c(6, 0)]], floor: [c(1, 2), c(3, 2)], deck: [c(7, 2), c(8, 2)] })
    const r = run(s, card(c(1, 0)))
    expect(r.players[0].captured.sort()).toEqual([c(1, 0), c(1, 2)].sort())
    expect(r.floor.sort()).toEqual([c(3, 2), c(7, 2)].sort())
    expect(r.turn).toBe(1)
    expect(r.phase.kind).toBe('play')
  })

  it('쪽: 내려놓은 카드를 뒤집은 카드로 먹고 피 1장 뺏음', () => {
    const s = mk('matgo', {
      hands: [[c(1, 0), c(5, 0)], [c(6, 0)]],
      floor: [c(3, 2)],
      deck: [c(1, 2), c(8, 2)],
      captured: [[], [c(10, 2), c(11, 1)]],
    })
    const r = run(s, card(c(1, 0)))
    expect(r.events.map((e) => e.type)).toContain('jjok')
    expect(r.players[0].captured).toEqual(expect.arrayContaining([c(1, 0), c(1, 2), c(10, 2)]))
    expect(r.players[1].captured).toEqual([c(11, 1)]) // 일반 피를 먼저 뺏김
  })

  it('뻑: 세 장이 바닥에 남고, 다른 사람이 먹으면 피 1장 뺏음', () => {
    const s = mk('matgo', {
      hands: [[c(1, 0), c(5, 0)], [c(1, 3), c(6, 0)]],
      floor: [c(1, 1), c(3, 2)],
      deck: [c(1, 2), c(8, 2), c(9, 2)],
      captured: [[c(10, 2)], []],
    })
    const r = run(s, card(c(1, 0)))
    expect(r.events.map((e) => e.type)).toContain('ppeok')
    expect(r.floor.filter((x) => getCard(x).month === 1)).toHaveLength(3)
    expect(r.players[0].captured).toEqual([c(10, 2)])
    expect(r.ppeok[1]).toBe(0)
    const r2 = run(r, card(c(1, 3)))
    expect(r2.events.map((e) => e.type)).toContain('ppeokEat')
    expect(r2.players[1].captured).toEqual(expect.arrayContaining([c(1, 0), c(1, 1), c(1, 2), c(1, 3), c(10, 2)]))
    expect(r2.players[0].captured).toEqual([])
    expect(r2.ppeok[1]).toBeUndefined()
  })

  it('자뻑: 내가 싼 뻑을 내가 먹으면 피 2장', () => {
    const s = mk('matgo', {
      hands: [[c(1, 3), c(5, 0)], [c(6, 0)]],
      floor: [c(1, 0), c(1, 1), c(1, 2), c(3, 2)],
      deck: [c(8, 2), c(9, 2)],
      captured: [[], [c(10, 2), c(10, 3), c(11, 2)]],
    })
    s.ppeok[1] = 0
    const r = run(s, card(c(1, 3)))
    expect(r.events.map((e) => e.type)).toContain('jappeok')
    expect(r.players[1].captured).toHaveLength(1)
  })

  it('따닥: 바닥 두 장 + 낸 카드 + 뒤집은 카드가 모두 같은 달', () => {
    const s = mk('matgo', {
      hands: [[c(1, 0), c(5, 0)], [c(6, 0)]],
      floor: [c(1, 1), c(1, 2), c(3, 2)],
      deck: [c(1, 3), c(8, 2)],
      captured: [[], [c(10, 2)]],
    })
    let r = play(s, card(c(1, 0)))
    expect(r.phase.kind).toBe('chooseHand')
    r = choose(r, c(1, 1))
    r = advance(r) // flip
    r = advance(r) // resolve
    expect(r.events.map((e) => e.type)).toContain('ttadak')
    expect(r.players[0].captured).toHaveLength(5) // 4장 + 뺏은 피
    expect(r.floor).toEqual([c(3, 2)])
  })

  it('같은 달 두 장이면 고른 카드를 가져옴', () => {
    const s = mk('matgo', { hands: [[c(1, 2), c(5, 0)], [c(6, 0)]], floor: [c(1, 0), c(1, 1), c(3, 2)], deck: [c(8, 2), c(9, 2)] })
    const r = run(s, card(c(1, 2)), c(1, 0))
    expect(r.players[0].captured.sort()).toEqual([c(1, 0), c(1, 2)].sort())
    expect(r.floor).toContain(c(1, 1))
  })

  it('뒤집은 카드도 두 장 중 고름', () => {
    const s = mk('matgo', { hands: [[c(5, 0), c(6, 0)], [c(7, 0)]], floor: [c(1, 0), c(1, 1), c(3, 2)], deck: [c(1, 2), c(9, 2)] })
    let r = play(s, card(c(5, 0)))
    r = advance(r)
    expect(r.phase).toEqual({ kind: 'chooseFlip', options: [c(1, 0), c(1, 1)] })
    r = advance(choose(r, c(1, 1)))
    expect(r.players[0].captured.sort()).toEqual([c(1, 1), c(1, 2)].sort())
  })

  it('싹쓸이: 바닥을 모두 비우면 피 1장씩 뺏음 (고스톱은 두 사람에게서)', () => {
    const s = mk('gostop', {
      hands: [[c(1, 0), c(5, 0)], [c(6, 0)], [c(7, 0)]],
      floor: [c(1, 2), c(2, 2)],
      deck: [c(2, 3), c(9, 2)],
      captured: [[], [c(10, 2)], [c(11, 2)]],
    })
    const r = run(s, card(c(1, 0)))
    expect(r.events.map((e) => e.type)).toContain('sseul')
    expect(r.floor).toEqual([])
    expect(r.players[0].captured).toEqual(expect.arrayContaining([c(10, 2), c(11, 2)]))
    expect(r.events.find((e) => e.type === 'steal')?.text).toBe('피 2장 뺏음')
  })

  it('뺏을 피가 없으면 그냥 넘어감', () => {
    const s = mk('matgo', { hands: [[c(1, 0), c(5, 0)], [c(6, 0)]], floor: [c(3, 2)], deck: [c(1, 2), c(8, 2)], captured: [[], [c(10, 0)]] })
    const r = run(s, card(c(1, 0)))
    expect(r.players[1].captured).toEqual([c(10, 0)])
    expect(r.events.some((e) => e.type === 'steal')).toBe(false)
  })

  it('흔들기: 손에 같은 달 3장, 바닥에 없음 → ×2', () => {
    const s = mk('matgo', { hands: [[c(1, 0), c(1, 1), c(1, 2), c(5, 0)], [c(6, 0)]], floor: [c(3, 2)], deck: [c(8, 2), c(9, 2)] })
    expect(canShake(s, c(1, 0))).toBe(true)
    expect(canBomb(s, c(1, 0))).toBe(false)
    expect(legalActions(s).find((a) => a.type === 'card' && a.card === c(1, 0))).toMatchObject({ shake: true })
    const r = run(s, { type: 'card', card: c(1, 0), shake: true })
    expect(r.players[0].shakes).toBe(1)
    expect(canShake(r, c(1, 1), 0)).toBe(false) // 같은 달은 한 번만
  })

  it('폭탄: 3장을 한꺼번에 내 4장을 먹고 피 뺏기, 빈 차례 2번', () => {
    const s = mk('matgo', {
      hands: [[c(1, 0), c(1, 1), c(1, 2), c(5, 0)], [c(6, 0), c(7, 0)]],
      floor: [c(1, 3), c(3, 2)],
      deck: [c(8, 2), c(9, 2), c(10, 2), c(11, 2)],
      captured: [[], [c(12, 3)]],
    })
    expect(canBomb(s, c(1, 1))).toBe(true)
    const r = run(s, { type: 'card', card: c(1, 1), bomb: true })
    expect(r.players[0].hand).toEqual([c(5, 0)])
    expect(r.players[0].dummies).toBe(2)
    expect(r.players[0].shakes).toBe(1)
    expect(r.players[0].captured).toEqual(expect.arrayContaining([c(1, 0), c(1, 1), c(1, 2), c(1, 3), c(12, 3)]))
    // 다음 내 차례엔 빈 차례(더미만 뒤집기) 가능
    const r2 = run(r, card(c(6, 0)))
    expect(legalActions(r2).some((a) => a.type === 'dummy')).toBe(true)
    const r3 = run(r2, { type: 'dummy' })
    expect(r3.players[0].dummies).toBe(1)
    expect(r3.players[0].hand).toEqual([c(5, 0)])
  })

  it('총통: 손에 같은 달 4장이면 바로 승리', () => {
    // 플레이어 1 손패에 3월 4장
    const order = [
      c(1, 0), c(1, 1), c(1, 2), c(1, 3), c(2, 0), c(2, 1), c(2, 2), c(2, 3), c(4, 0), c(4, 1),
      c(3, 0), c(3, 1), c(3, 2), c(3, 3), c(5, 0), c(5, 1), c(5, 2), c(5, 3), c(6, 0), c(6, 1),
    ]
    const rest = Array.from({ length: 48 }, (_, i) => i).filter((i) => !order.includes(i))
    const s = newRound(PEOPLE(2), 'matgo', { deck: [...order, ...rest], first: 1 })
    expect(s.phase.kind).toBe('over')
    expect(s.result?.kind).toBe('chongtong')
    expect(s.result?.winner).toBe(1) // 선(1번)부터 확인
    expect(s.result?.payments).toEqual([{ from: 0, points: 10, reasons: [], paysFor: [] }])
  })
})

const sevenPts = [c(1, 0), c(3, 0), c(8, 0), c(2, 0), c(4, 0), c(8, 1)] // 3광 + 고도리 = 8점

describe('고/스톱과 정산', () => {
  it('기준 점수에 닿으면 고/스톱을 고름', () => {
    const s = mk('matgo', {
      hands: [[c(1, 0), c(5, 0)], [c(6, 0), c(6, 1)]],
      floor: [c(1, 2)],
      deck: [c(9, 2), c(10, 2), c(11, 2)],
      captured: [[c(3, 0), c(8, 0), c(2, 0), c(4, 0), c(8, 1)], [c(12, 3)]],
    })
    const r = run(s, card(c(1, 0)))
    expect(r.phase).toEqual({ kind: 'goStop', score: 8 })
    const g = decideGo(r, true)
    expect(g.players[0].goCount).toBe(1)
    expect(g.players[0].lastGoScore).toBe(8)
    expect(g.turn).toBe(1)
    expect(g.events[0].text).toBe('1고!')
    const st = decideGo(r, false)
    expect(st.phase.kind).toBe('over')
    expect(st.result?.winner).toBe(0)
  })

  it('고 이후에는 점수가 더 올라야 다시 고/스톱', () => {
    const s = mk('matgo', {
      hands: [[c(5, 0), c(7, 0)], [c(6, 0), c(6, 1)]],
      floor: [c(10, 0)],
      deck: [c(9, 2), c(11, 2), c(12, 2)],
      captured: [sevenPts, []],
    })
    s.players[0].goCount = 1
    s.players[0].lastGoScore = 8
    const r = run(s, card(c(5, 0)))
    expect(r.phase.kind).toBe('play')
    expect(r.turn).toBe(1)
  })

  it('고 보너스', () => {
    expect(goBonus(0)).toEqual({ add: 0, mult: 1 })
    expect(goBonus(1)).toEqual({ add: 1, mult: 1 })
    expect(goBonus(2)).toEqual({ add: 2, mult: 1 })
    expect(goBonus(3)).toEqual({ add: 3, mult: 2 })
    expect(goBonus(4)).toEqual({ add: 4, mult: 4 })
    expect(goBonus(5)).toEqual({ add: 5, mult: 8 })
  })

  it('정산: 기본 점수 + 고, 흔들기·멍박·나가리 배수', () => {
    const s = mk('matgo', { hands: [[], []], floor: [], deck: [], captured: [sevenPts, [c(11, 0), c(12, 3)]] })
    s.players[0].goCount = 3
    s.players[0].shakes = 1
    s.nagariMult = 2
    const r = finishWin(s, 0)
    // (8 + 3) × 2(3고) × 2(흔들기) × 2(나가리) = 88
    expect(r.result!.base).toBe(11)
    expect(r.result!.payments[0]).toMatchObject({ from: 1, points: 88, reasons: [] })
    expect(r.result!.multipliers.map((m) => m.factor)).toEqual([2, 2, 2])
  })

  it('피박·광박', () => {
    const pi10 = [c(1, 2), c(1, 3), c(2, 2), c(2, 3), c(3, 2), c(3, 3), c(4, 2), c(4, 3), c(5, 2), c(5, 3)]
    const win = [...pi10, c(1, 0), c(3, 0), c(8, 0)] // 피 1 + 광 3 = 4점
    const s = mk('matgo', { hands: [[], []], floor: [], deck: [], captured: [win, [c(6, 2), c(6, 3)]] })
    const r = finishWin(s, 0)
    expect(r.result!.base).toBe(4)
    expect(r.result!.payments[0].reasons).toEqual(['피박', '광박'])
    expect(r.result!.payments[0].points).toBe(16)
    // 피 0장은 피박 면제, 광이 있으면 광박 아님
    const s2 = mk('matgo', { hands: [[], []], floor: [], deck: [], captured: [win, [c(11, 0)]] })
    expect(finishWin(s2, 0).result!.payments[0].reasons).toEqual([])
    // 피 6장이면 피박 아님
    const s3 = mk('matgo', { hands: [[], []], floor: [], deck: [], captured: [win, [c(11, 0), c(6, 2), c(6, 3), c(7, 2), c(7, 3), c(11, 1)]] })
    expect(finishWin(s3, 0).result!.payments[0].reasons).toEqual([])
  })

  it('멍박: 열끗 7장 이상으로 점수', () => {
    const y7 = [c(2, 0), c(4, 0), c(5, 0), c(6, 0), c(7, 0), c(10, 0), c(12, 1)]
    const s = mk('matgo', { hands: [[], []], floor: [], deck: [], captured: [y7, [c(1, 0)]] })
    const r = finishWin(s, 0)
    expect(r.result!.base).toBe(3)
    expect(r.result!.multipliers.some((m) => m.label.startsWith('멍박'))).toBe(true)
    expect(r.result!.payments[0].points).toBe(6)
  })

  it('맞고 고박: 고를 부르고 진 사람은 두 배', () => {
    const s = mk('matgo', { hands: [[], []], floor: [], deck: [], captured: [sevenPts, [c(11, 0)]] })
    s.players[1].goCount = 1
    expect(finishWin(s, 0).result!.payments[0]).toMatchObject({ points: 16, reasons: ['고박'] })
  })

  it('고스톱 고박: 고 부른 사람이 모두의 몫을 냄', () => {
    const s = mk('gostop', { hands: [[], [], []], floor: [], deck: [], captured: [sevenPts, [c(11, 0)], [c(12, 0)]] })
    s.players[2].goCount = 1
    s.lastGoer = 2
    const r = finishWin(s, 0).result!
    expect(r.payments.find((p) => p.from === 1)!.points).toBe(0)
    expect(r.payments.find((p) => p.from === 2)).toMatchObject({ points: 16, reasons: ['고박'], paysFor: [1] })
  })

  it('나가리: 아무도 스톱 못 하고 더미가 떨어지면 다음 판 두 배', () => {
    const s = mk('matgo', { hands: [[c(5, 0)], []], floor: [c(3, 2)], deck: [c(9, 2)], captured: [[], []] })
    const r = run(s, card(c(5, 0)))
    expect(r.phase.kind).toBe('over')
    expect(r.result!.kind).toBe('nagari')
    expect(r.result!.nextMult).toBe(2)
    s.nagariMult = 2
    expect(run(s, card(c(5, 0))).result!.nextMult).toBe(4)
  })

  it('마지막 차례에 점수가 나면 자동 스톱', () => {
    const s = mk('matgo', { hands: [[c(1, 0)], []], floor: [c(1, 2)], deck: [c(9, 2)], captured: [[c(3, 0), c(8, 0), c(2, 0), c(4, 0), c(8, 1)], []] })
    const r = run(s, card(c(1, 0)))
    expect(r.result!.kind).toBe('win')
    expect(r.result!.winner).toBe(0)
  })
})

describe('AI', () => {
  const diffs: Difficulty[] = ['easy', 'normal', 'hard']

  it('항상 규칙에 맞는 행동을 고름', () => {
    const rng = mulberry32(7)
    for (const d of diffs) {
      const s = newRound(PEOPLE(2), 'matgo', { rng })
      if (s.phase.kind !== 'play') continue
      const a = aiAction(s, d, rng)
      expect(legalActions(s)).toContainEqual(a)
    }
  })

  it('보통·어려움: 광을 먹을 수 있으면 먹음', () => {
    const s = mk('matgo', {
      hands: [[c(1, 2), c(5, 2), c(7, 2)], [c(6, 0), c(9, 0), c(10, 0)]],
      floor: [c(1, 0), c(4, 2)],
      deck: [c(11, 2), c(12, 3), c(2, 2), c(3, 2)],
    })
    for (const d of ['normal', 'hard'] as const) {
      const a = aiAction(s, d, mulberry32(3))
      expect(a).toEqual({ type: 'card', card: c(1, 2) })
    }
  })

  it('두 장 중엔 더 좋은 카드를 고름', () => {
    const s = mk('matgo', { hands: [[c(1, 2), c(5, 0)], [c(6, 0)]], floor: [c(1, 0), c(1, 3), c(3, 2)], deck: [c(8, 2), c(9, 2)] })
    const r = play(s, card(c(1, 2)))
    expect(aiChoose(r, 'hard')).toBe(c(1, 0))
    expect(aiChoose(r, 'normal')).toBe(c(1, 0))
  })

  it('폭탄이 가능하면 (보통·어려움) 폭탄', () => {
    const s = mk('matgo', {
      hands: [[c(1, 0), c(1, 1), c(1, 2), c(5, 0)], [c(6, 0), c(7, 0)]],
      floor: [c(1, 3), c(3, 2)],
      deck: [c(8, 2), c(9, 2), c(10, 2), c(11, 2)],
    })
    expect(aiAction(s, 'hard', mulberry32(2))).toMatchObject({ bomb: true })
  })

  it('고/스톱 판단: 상대가 위협적이거나 더미가 거의 없으면 스톱', () => {
    const me7 = [c(1, 0), c(3, 0), c(8, 0), c(6, 1), c(9, 1), c(10, 1), c(4, 1), c(5, 1)] // 3광 + 청단 + 띠 5장 = 7점
    const base = () => {
      const s = mk('matgo', {
        hands: [[c(5, 0), c(6, 0), c(7, 0), c(9, 0)], [c(10, 0), c(12, 1), c(6, 2), c(9, 2)]],
        floor: [c(3, 2)],
        deck: [c(1, 2), c(1, 3), c(2, 2), c(2, 3), c(3, 3), c(4, 3), c(6, 3), c(9, 3)],
        captured: [me7, [c(10, 2)]],
      })
      s.phase = { kind: 'goStop', score: 7 }
      return s
    }
    expect(scoreOf(me7).total).toBe(7)
    const safe = base()
    expect(aiGoStop(safe, 'hard')).toBe(true)
    expect(aiGoStop(safe, 'normal')).toBe(true)
    const danger = base()
    // 홍단 + 피 10장(4점), 고도리 직전
    danger.players[1].captured = [c(2, 0), c(8, 1), c(1, 1), c(2, 1), c(3, 1), c(11, 1), c(11, 2), c(11, 3), c(12, 3), c(7, 2), c(7, 3), c(5, 2), c(5, 3)]
    expect(aiGoStop(danger, 'hard')).toBe(false)
    expect(aiGoStop(danger, 'normal')).toBe(false)
    const late = base()
    late.deck = []
    expect(aiGoStop(late, 'hard')).toBe(false)
    expect(aiGoStop(late, 'easy')).toBe(false)
  })
})

/** AI끼리 한 판 끝까지 */
function playOut(mode: Mode, diffs: Difficulty[], seed: number, nagariMult = 1) {
  const rng = mulberry32(seed)
  let s = newRound(PEOPLE(mode === 'matgo' ? 2 : 3), mode, { rng, first: seed % (mode === 'matgo' ? 2 : 3), nagariMult })
  let steps = 0
  const check = () => {
    const all = allCards(s)
    expect(all).toHaveLength(48)
    expect(new Set(all).size).toBe(48)
  }
  check()
  while (s.phase.kind !== 'over') {
    s = aiStep(s, diffs[s.turn], rng)
    check()
    if (++steps > 500) throw new Error('끝나지 않는 판')
  }
  return s
}

describe('AI끼리 대국 시뮬레이션', () => {
  it('맞고 300판: 오류 없이 끝나고 48장 보존', () => {
    let wins = 0
    let nagari = 0
    for (let i = 0; i < 300; i++) {
      const s = playOut('matgo', i % 3 === 0 ? ['easy', 'normal'] : ['normal', 'easy'], 1000 + i)
      const r = s.result!
      if (r.kind === 'nagari') nagari++
      else {
        wins++
        expect(r.winner).not.toBeNull()
        for (const p of r.payments) expect(p.points).toBeGreaterThanOrEqual(0)
        if (r.kind === 'win') {
          expect(r.base).toBeGreaterThanOrEqual(7)
          expect(r.payments.every((p) => p.points >= r.base)).toBe(true)
        }
      }
    }
    expect(wins).toBeGreaterThan(nagari)
  })

  it('고스톱 300판: 오류 없이 끝나고 48장 보존', () => {
    for (let i = 0; i < 300; i++) {
      const s = playOut('gostop', ['normal', 'easy', 'normal'], 5000 + i)
      const r = s.result!
      if (r.kind === 'win') {
        expect(r.base).toBeGreaterThanOrEqual(3)
        expect(r.payments.reduce((a, p) => a + p.points, 0)).toBeGreaterThan(0)
      }
    }
  })

  it('어려움 AI도 끝까지 둠', () => {
    for (let i = 0; i < 12; i++) playOut(i % 2 ? 'matgo' : 'gostop', ['hard', 'hard', 'hard'], 9000 + i)
  })

  it('어려움 AI가 쉬움 AI보다 많이 이김 (맞고)', () => {
    let hard = 0
    let easy = 0
    for (let i = 0; i < 200; i++) {
      const hardSeat = i % 2
      const diffs: Difficulty[] = hardSeat === 0 ? ['hard', 'easy'] : ['easy', 'hard']
      const r = playOut('matgo', diffs, 20000 + i).result!
      if (r.kind === 'nagari' || r.winner == null) continue
      const pts = r.payments.reduce((a, p) => a + p.points, 0)
      if (r.winner === hardSeat) hard += pts
      else easy += pts
    }
    expect(hard).toBeGreaterThan(easy)
  })
})
