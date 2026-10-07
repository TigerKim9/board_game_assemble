import { describe, expect, it } from 'vitest'
import {
  act,
  awardPots,
  buildPots,
  legalActions,
  newHand,
  nextStreet,
  postAnte,
  postBlind,
  potTotal,
  seatOrderFrom,
  settle,
  startRound,
  uncalled,
  type BetAction,
  type BetRound,
} from './betting'

const F: BetAction = { kind: 'fold' }
const X: BetAction = { kind: 'check' }
const C: BetAction = { kind: 'call' }
const R = (to: number): BetAction => ({ kind: 'raise', to })

/** 3명: 0=버튼, 1=SB 5, 2=BB 10. 프리플랍 첫 행동은 버튼(0). */
function threeHanded(stacks = [1000, 1000, 1000]): BetRound {
  let r = newHand(stacks, { bigBlind: 10 })
  r = postBlind(r, 1, 5)
  r = postBlind(r, 2, 10)
  return startRound(r, 0)
}

function play(r: BetRound, ...actions: BetAction[]): BetRound {
  for (const a of actions) {
    expect(r.turn).toBeGreaterThanOrEqual(0)
    r = act(r, a)
  }
  return r
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('betting round basics', () => {
  it('posts blinds and starts with the button preflop', () => {
    const r = threeHanded()
    expect(r.turn).toBe(0)
    expect(r.currentBet).toBe(10)
    expect(potTotal(r)).toBe(15)
    const l = legalActions(r)
    expect(l.canCheck).toBe(false)
    expect(l.callAmount).toBe(10)
    expect(l.raise).toEqual({ min: 20, max: 1000 })
  })

  it('gives the big blind the option after limps', () => {
    let r = threeHanded()
    r = play(r, C, C)
    expect(r.turn).toBe(2)
    expect(legalActions(r).canCheck).toBe(true)
    r = play(r, X)
    expect(r.turn).toBe(-1)
    expect(potTotal(r)).toBe(30)
  })

  it('ends when everyone folds to one player', () => {
    let r = threeHanded()
    r = play(r, F, F)
    expect(r.turn).toBe(-1)
    const s = settle(r, [0, 0, 0], seatOrderFrom(0, 3))
    expect(s.stacks).toEqual([1000, 995, 1005])
    expect(s.refunds[2]).toBe(5) // BB의 받지 않은 5칩 반환
  })

  it('reopens action after a raise and enforces min-raise size', () => {
    let r = threeHanded()
    r = play(r, R(30)) // 버튼 30으로 (레이즈 20)
    expect(r.minRaise).toBe(20)
    expect(legalActions(r).raise!.min).toBe(50)
    r = play(r, R(80)) // SB 80 (레이즈 50)
    expect(r.minRaise).toBe(50)
    expect(r.turn).toBe(2)
    expect(legalActions(r).raise!.min).toBe(130)
    r = play(r, C, C)
    expect(r.turn).toBe(-1)
    expect(potTotal(r)).toBe(240)
  })

  it('clamps a too-small raise up to the minimum', () => {
    let r = threeHanded()
    r = act(r, R(12))
    expect(r.seats[0].bet).toBe(20)
  })

  it('converts illegal check into call and illegal call into check', () => {
    let r = threeHanded()
    r = act(r, X)
    expect(r.seats[0].bet).toBe(10)
    r = play(r, C)
    r = act(r, C) // BB는 맞출 금액이 없으니 체크
    expect(r.turn).toBe(-1)
    expect(r.seats[2].bet).toBe(10)
  })

  it('postflop: first player after button acts, bets reset', () => {
    let r = threeHanded()
    r = play(r, C, C, X)
    r = nextStreet(r, 1)
    expect(r.turn).toBe(1)
    expect(r.currentBet).toBe(0)
    expect(r.seats.every((s) => s.bet === 0)).toBe(true)
    const l = legalActions(r)
    expect(l.canCheck).toBe(true)
    expect(l.raise!.min).toBe(10)
    r = play(r, X, R(20))
    expect(r.turn).toBe(0) // 버튼이 응수
    r = play(r, C, C)
    expect(r.turn).toBe(-1)
    expect(potTotal(r)).toBe(90)
  })

  it('skips folded and all-in players', () => {
    let r = threeHanded([1000, 50, 1000])
    r = play(r, R(100), R(50)) // SB는 50 올인 → 콜도 안 됨(숏) — 그냥 올인 처리
    expect(r.seats[1].allIn).toBe(true)
    expect(r.turn).toBe(2)
    r = play(r, C)
    expect(r.turn).toBe(-1)
    r = nextStreet(r, 1)
    expect(r.turn).toBe(2) // SB(1)는 올인이라 건너뜀
  })

  it('respects a raise cap per round', () => {
    let r = newHand([1000, 1000], { bigBlind: 10, maxRaises: 2 })
    r = startRound(r, 0)
    r = play(r, R(10), R(20))
    expect(legalActions(r).raise).toBeNull()
    r = play(r, C)
    expect(r.turn).toBe(-1)
  })

  it('antes go into the pot but not into the street bet', () => {
    let r = newHand([100, 100, 100], { bigBlind: 10 })
    for (let i = 0; i < 3; i++) r = postAnte(r, i, 5)
    r = startRound(r, 0)
    expect(potTotal(r)).toBe(15)
    expect(r.currentBet).toBe(0)
    expect(legalActions(r).canCheck).toBe(true)
    r = play(r, X, X, X)
    expect(r.turn).toBe(-1)
  })

  it('a player all-in from the ante does not act', () => {
    let r = newHand([5, 100, 100], { bigBlind: 10 })
    r = postAnte(r, 0, 5)
    expect(r.seats[0].allIn).toBe(true)
    r = startRound(r, 0)
    expect(r.turn).toBe(1)
  })

  it('no action needed when everyone else is all-in and bets are matched', () => {
    let r = newHand([1000, 30], { bigBlind: 10 })
    r = postBlind(r, 0, 5)
    r = postBlind(r, 1, 10)
    r = startRound(r, 0)
    r = play(r, R(1000)) // 올인
    expect(r.turn).toBe(1)
    expect(legalActions(r).raise).toBeNull() // 스택 30 < 콜 990 → 콜(올인)만
    r = play(r, C)
    expect(r.turn).toBe(-1)
    r = nextStreet(r, 1)
    expect(r.turn).toBe(-1)
  })

  it('cannot raise when all opponents are all-in', () => {
    let r = newHand([100, 1000], { bigBlind: 10 })
    r = startRound(r, 0)
    r = play(r, R(100))
    expect(r.seats[0].allIn).toBe(true)
    const l = legalActions(r)
    expect(l.raise).toBeNull()
    expect(l.callAmount).toBe(100)
  })
})

describe('short all-in does not reopen betting', () => {
  it('locks players who already acted', () => {
    // 0: 1000, 1: 1000, 2: 130
    let r = newHand([1000, 1000, 130], { bigBlind: 10 })
    r = startRound(r, 0)
    r = play(r, R(100)) // 0 베팅 100
    r = play(r, C) // 1 콜
    r = play(r, R(130)) // 2 올인 130 (레이즈 30 < 100: 숏)
    expect(r.turn).toBe(0)
    let l = legalActions(r)
    expect(l.raise).toBeNull()
    expect(l.callAmount).toBe(30)
    r = play(r, C)
    l = legalActions(r)
    expect(r.turn).toBe(1)
    expect(l.raise).toBeNull()
    r = play(r, C)
    expect(r.turn).toBe(-1)
  })

  it('a player who has not acted yet may still raise', () => {
    let r = newHand([1000, 1000, 130], { bigBlind: 10 })
    r = startRound(r, 2)
    r = play(r, R(100)) // 2가 먼저 100 베팅
    r = play(r, R(130)) // 0이 130으로 레이즈 시도 → 최소 레이즈 200으로 보정
    expect(r.seats[0].bet).toBe(200)
    expect(r.turn).toBe(1)
    expect(legalActions(r).raise!.min).toBe(300)
  })

  it('a full raise after a short all-in reopens betting', () => {
    let r = newHand([1000, 1000, 130, 1000], { bigBlind: 10 })
    r = startRound(r, 0)
    r = play(r, R(100), C, R(130)) // 2 숏 올인 → 0·1 잠김
    expect(r.turn).toBe(3)
    expect(legalActions(r).raise!.min).toBe(230)
    r = play(r, R(300)) // 3 풀 레이즈
    expect(r.turn).toBe(0)
    expect(legalActions(r).raise).not.toBeNull()
  })

  it('everyone who acted is locked after a short all-in', () => {
    let r = newHand([1000, 1000, 1000, 130], { bigBlind: 10 })
    r = startRound(r, 0)
    r = play(r, R(100), C, C, R(130))
    expect(r.turn).toBe(0)
    expect(legalActions(r).raise).toBeNull()
    r = play(r, C)
    // 1은 잠겨 있음
    expect(legalActions(r).raise).toBeNull()
    r = play(r, C, C)
    expect(r.turn).toBe(-1)
  })
})

describe('side pots', () => {
  it('uncalled excess is returned to the biggest bettor', () => {
    expect(uncalled([500, 200, 100])).toEqual([300, 0, 0])
    expect(uncalled([200, 200, 100])).toEqual([0, 0, 0])
    expect(uncalled([0, 0])).toEqual([0, 0])
  })

  it('builds main and side pots from all-in levels', () => {
    const pots = buildPots([100, 300, 300], [true, true, true])
    expect(pots).toEqual([
      { amount: 300, eligible: [0, 1, 2] },
      { amount: 400, eligible: [1, 2] },
    ])
  })

  it('folded chips stay in the pot without eligibility', () => {
    const pots = buildPots([50, 100, 300, 300], [false, true, true, true])
    expect(pots).toEqual([
      { amount: 350, eligible: [1, 2, 3] },
      { amount: 400, eligible: [2, 3] },
    ])
    expect(sum(pots.map((p) => p.amount))).toBe(750)
  })

  it('three different all-ins → three pots', () => {
    const pots = buildPots([50, 150, 400, 400], [true, true, true, true])
    expect(pots.map((p) => p.amount)).toEqual([200, 300, 500])
    expect(pots.map((p) => p.eligible)).toEqual([
      [0, 1, 2, 3],
      [1, 2, 3],
      [2, 3],
    ])
  })

  it('short stack wins main pot, side pot to the best of the rest', () => {
    const pots = buildPots([100, 300, 300], [true, true, true])
    const { winnings } = awardPots(pots, [9, 5, 7], [0, 1, 2])
    expect(winnings).toEqual([300, 0, 400])
  })

  it('splits a tied pot and gives the odd chip by seat order', () => {
    const pots = buildPots([25, 25, 25], [true, true, true]) // 75
    const { winnings } = awardPots(pots, [5, 5, 1], [1, 2, 0])
    expect(winnings).toEqual([37, 38, 0]) // 1이 버튼 왼쪽 → 남는 1칩
  })

  it('ties only in the side pot', () => {
    const pots = buildPots([100, 300, 300], [true, true, true])
    const { winnings } = awardPots(pots, [9, 5, 5], [0, 1, 2])
    expect(winnings).toEqual([300, 200, 200])
  })

  it('three-way tie with two odd chips', () => {
    const pots = buildPots([33, 34, 34], [true, true, true]) // 101 → 99 main + 2 side
    expect(pots).toEqual([
      { amount: 99, eligible: [0, 1, 2] },
      { amount: 2, eligible: [1, 2] },
    ])
    const { winnings } = awardPots(pots, [3, 3, 3], [2, 0, 1])
    expect(winnings).toEqual([33, 34, 34])
    expect(sum(winnings)).toBe(101)
  })

  it('odd chips across multiple winners: order is respected', () => {
    const { winnings } = awardPots([{ amount: 100, eligible: [0, 1, 2] }], [7, 7, 7], [2, 0, 1])
    expect(winnings).toEqual([33, 33, 34])
  })

  it('full hand: multi-way all-in with side pots settles exactly', () => {
    // 0: 버튼 1000, 1: SB 200, 2: BB 500, 3: 50
    let r = newHand([1000, 200, 500, 50], { bigBlind: 10 })
    r = postBlind(r, 1, 5)
    r = postBlind(r, 2, 10)
    r = startRound(r, 3)
    r = play(r, R(50)) // 3 올인 50
    r = play(r, R(1000)) // 0 올인 1000
    r = play(r, C) // 1 올인 콜 200
    r = play(r, C) // 2 올인 콜 500
    expect(r.turn).toBe(-1)
    // 점수: 3 최고, 1 둘째, 2 셋째, 0 꼴찌
    const s = settle(r, [1, 3, 2, 4], seatOrderFrom(0, 4))
    expect(s.refunds).toEqual([500, 0, 0, 0])
    expect(s.awards.map((a) => a.amount)).toEqual([200, 450, 600])
    expect(s.winnings).toEqual([0, 450, 600, 200])
    expect(s.stacks).toEqual([500, 450, 600, 200])
    expect(sum(s.stacks)).toBe(1750)
    expect(sum(s.net)).toBe(0)
  })

  it('folded big bettor: their chips are won by the remaining players', () => {
    let r = newHand([1000, 1000, 100], { bigBlind: 10 })
    r = startRound(r, 0)
    r = play(r, R(200), C, C) // 2는 100 올인 콜
    r = nextStreet(r, 0)
    r = play(r, R(500)) // 0 베팅
    r = play(r, F) // 1 폴드
    expect(r.turn).toBe(-1)
    const s = settle(r, [1, 9, 5], seatOrderFrom(2, 3))
    // 메인 300 → 2, 사이드(0·1 200씩 = 200) → 0 (1 폴드), 0의 500은 반환
    expect(s.refunds[0]).toBe(500)
    expect(s.winnings).toEqual([200, 0, 300])
    expect(sum(s.stacks)).toBe(2100)
  })

  it('split pot with all-in player tied with a bigger stack', () => {
    let r = newHand([100, 500, 500], { bigBlind: 10 })
    r = startRound(r, 0)
    r = play(r, R(100), R(300), C)
    expect(r.turn).toBe(-1)
    const s = settle(r, [8, 8, 2], seatOrderFrom(0, 3))
    // 메인 300 → 0·1 반씩 150, 사이드 400 → 1
    expect(s.winnings).toEqual([150, 550, 0])
    expect(sum(s.stacks)).toBe(1100)
  })

  it('chips are conserved across random scenarios', () => {
    let seed = 7
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let t = 0; t < 300; t++) {
      const n = 2 + Math.floor(rnd() * 7)
      const stacks = Array.from({ length: n }, () => 20 + Math.floor(rnd() * 500))
      let r = newHand(stacks, { bigBlind: 10 })
      r = postBlind(r, 1 % n, 5)
      r = postBlind(r, 2 % n, 10)
      r = startRound(r, 3 % n)
      for (let street = 0; street < 4; street++) {
        let guard = 0
        while (r.turn >= 0 && guard++ < 200) {
          const l = legalActions(r)
          const x = rnd()
          if (x < 0.15) r = act(r, F)
          else if (x < 0.6 || !l.raise) r = act(r, l.canCheck ? X : C)
          else r = act(r, R(l.raise.min + Math.floor(rnd() * (l.raise.max - l.raise.min + 1))))
        }
        expect(guard).toBeLessThan(200)
        r = nextStreet(r, 1 % n)
      }
      const scores = stacks.map(() => Math.floor(rnd() * 4))
      const s = settle(r, scores, seatOrderFrom(0, n))
      expect(sum(s.stacks)).toBe(sum(stacks))
      expect(sum(s.net)).toBe(0)
      expect(s.stacks.every((x) => x >= 0)).toBe(true)
    }
  })
})
