import type { Difficulty, PlayerConfig } from '../../lib/types'

export type Color = 'green' | 'yellow' | 'red'
export type Face = 'brain' | 'shot' | 'feet'

export const FACES: Record<Color, Face[]> = {
  green: ['brain', 'brain', 'brain', 'shot', 'feet', 'feet'],
  yellow: ['brain', 'brain', 'shot', 'shot', 'feet', 'feet'],
  red: ['brain', 'shot', 'shot', 'shot', 'feet', 'feet'],
}

export const FULL_CUP: Color[] = [
  ...Array<Color>(6).fill('green'),
  ...Array<Color>(4).fill('yellow'),
  ...Array<Color>(3).fill('red'),
]

export const GOAL = 13
export const BUST_SHOTS = 3

export interface ZDie {
  color: Color
  face: Face | null
}

export type Phase = 'start' | 'rolling' | 'decide' | 'bust' | 'over'

export interface ZState {
  players: PlayerConfig[]
  scores: number[]
  turn: number
  phase: Phase
  cup: Color[]
  /** Dice in hand: freshly drawn (face null while rolling) or footprints to re-roll. */
  hand: ZDie[]
  brains: number
  /** Brain dice physically set aside (can be recycled into the cup). */
  brainDice: Color[]
  shots: Color[]
  /** Someone reached the goal; the game ends when the round wraps to seat 0. */
  finalRound: boolean
  winners: number[]
  log: string
}

export function newZombie(players: PlayerConfig[]): ZState {
  return {
    players,
    scores: players.map(() => 0),
    turn: 0,
    phase: 'start',
    cup: FULL_CUP.slice(),
    hand: [],
    brains: 0,
    brainDice: [],
    shots: [],
    finalRound: false,
    winners: [],
    log: '',
  }
}

/** Keep footprints, draw from the cup up to 3 dice (recycling set-aside brains if needed). */
export function drawDice(s: ZState, rng: () => number = Math.random): ZState {
  if (s.phase !== 'start' && s.phase !== 'decide') return s
  let cup = s.cup.slice()
  let brainDice = s.brainDice
  let log = ''
  const hand: ZDie[] = s.hand.filter((d) => d.face !== 'brain' && d.face !== 'shot').map((d) => ({ color: d.color, face: null }))
  while (hand.length < 3) {
    if (cup.length === 0) {
      if (brainDice.length === 0) break
      cup = brainDice.slice()
      brainDice = []
      log = '통이 비어서 뇌 주사위를 다시 넣었어요 (점수는 그대로)'
    }
    const i = Math.floor(rng() * cup.length)
    hand.push({ color: cup[i], face: null })
    cup.splice(i, 1)
  }
  return { ...s, cup, brainDice, hand, phase: 'rolling', log }
}

export function rollFaces(hand: ZDie[], rng: () => number = Math.random): Face[] {
  return hand.map((d) => FACES[d.color][Math.floor(rng() * 6)])
}

/** Apply rolled faces: brains and shots are set aside, footprints stay in hand. */
export function resolveRoll(s: ZState, faces: Face[]): ZState {
  if (s.phase !== 'rolling') return s
  const rolled = s.hand.map((d, i) => ({ color: d.color, face: faces[i] }))
  const newBrains = rolled.filter((d) => d.face === 'brain')
  const newShots = rolled.filter((d) => d.face === 'shot')
  const shots = [...s.shots, ...newShots.map((d) => d.color)]
  const bust = shots.length >= BUST_SHOTS
  return {
    ...s,
    hand: rolled,
    brains: s.brains + newBrains.length,
    brainDice: [...s.brainDice, ...newBrains.map((d) => d.color)],
    shots,
    phase: bust ? 'bust' : 'decide',
    log: bust ? `💥 총에 ${shots.length}번 맞았어요! 이번 차례 뇌를 모두 잃어요` : '',
  }
}

/** Footprint dice still in hand after a roll. */
export const feetInHand = (s: ZState) => s.hand.filter((d) => d.face === 'feet')

/** Prepare the hand for the next roll (keep only footprints). */
export function keepFeet(s: ZState): ZState {
  return { ...s, hand: feetInHand(s) }
}

export function endTurn(s: ZState, bank: boolean): ZState {
  const gained = bank ? s.brains : 0
  const scores = s.scores.map((v, i) => (i === s.turn ? v + gained : v))
  const name = s.players[s.turn].name
  const finalRound = s.finalRound || scores[s.turn] >= GOAL
  let log = bank ? `${name}: 뇌 ${gained}개 획득!` : `${name}: 총에 맞아 뇌를 놓쳤어요`
  if (!s.finalRound && finalRound) log = `🏁 ${name}님이 ${GOAL}개 달성! 이번 바퀴가 끝나면 게임 종료`
  const next = (s.turn + 1) % s.players.length
  const base = { ...s, scores, finalRound, cup: FULL_CUP.slice(), hand: [], brains: 0, brainDice: [], shots: [], log }
  if (finalRound && next === 0) {
    const top = Math.max(...scores)
    return { ...base, phase: 'over', winners: scores.flatMap((v, i) => (v === top ? [i] : [])) }
  }
  return { ...base, turn: next, phase: 'start' }
}

// ---------- AI ----------

/** Monte Carlo estimate of the next roll: bust chance and expected new brains. */
export function estimateNext(s: ZState, samples = 400, rng: () => number = Math.random) {
  let busts = 0
  let gain = 0
  const base = { ...keepFeet(s), phase: 'decide' as Phase }
  for (let i = 0; i < samples; i++) {
    const drawn = drawDice(base, rng)
    const r = resolveRoll(drawn, rollFaces(drawn.hand, rng))
    if (r.phase === 'bust') busts++
    else gain += r.brains - s.brains
  }
  return { bust: busts / samples, gain: gain / samples }
}

export function aiShouldContinue(s: ZState, difficulty: Difficulty, rng: () => number = Math.random): boolean {
  if (s.phase === 'start') return true
  const me = s.scores[s.turn]
  const total = me + s.brains
  const leader = Math.max(...s.scores.filter((_, i) => i !== s.turn))
  // Final round and still not ahead: nothing to lose.
  if (s.finalRound && total <= leader) return true
  if (total >= GOAL) return total <= leader
  if (s.brains === 0) return true
  if (difficulty === 'easy') {
    if (s.shots.length >= 2) return rng() < 0.3
    return s.brains < 3 + Math.floor(rng() * 3)
  }
  const { bust, gain } = estimateNext(s, difficulty === 'hard' ? 500 : 200, rng)
  if (difficulty === 'normal') return bust < 0.25 && s.brains < 5
  // hard: expected-value with a little extra boldness when trailing.
  const behind = leader - me
  const boldness = behind >= 6 ? 1.35 : behind <= -4 ? 0.8 : 1
  return (1 - bust) * gain * boldness > bust * s.brains * 0.85
}
