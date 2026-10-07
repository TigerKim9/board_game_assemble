import { useEffect, useRef, useState } from 'react'
import { Die } from '../../components/Die'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { rollDie } from '../../lib/random'
import { useStored } from '../../lib/storage'
import type { PlayerConfig } from '../../lib/types'
import {
  MAX_ROLLS,
  MIN_BET,
  START_CHIPS,
  aiBet,
  applyPayout,
  dealerInstant,
  evalHand,
  handLabel,
  isFinal,
  playerVsDealer,
  type Hand,
} from './logic'
import './chinchirorin.css'

type Chips = Record<string, number>
const CHIPS_KEY = 'chinchirorin:chips'

export default function Chinchirorin() {
  const [players, setPlayers] = useState<PlayerConfig[] | null>(null)
  const [, setChips] = useStored<Chips>(CHIPS_KEY, {})
  const [confirmReset, setConfirmReset] = useState(false)
  if (!players) {
    return (
      <PlayerSetup
        gameId="chinchirorin"
        min={1}
        max={6}
        defaultCount={1}
        startLabel="테이블에 앉기"
        extra={
          <div className="setup-row">
            <span className="muted cc-setup-note">가상 칩은 이름별로 저장돼요</span>
            <button
              className={`btn small ${confirmReset ? 'danger' : 'ghost'}`}
              onClick={() => {
                if (!confirmReset) return setConfirmReset(true)
                setChips({})
                setConfirmReset(false)
              }}
            >
              {confirmReset ? '정말 초기화?' : '칩 초기화'}
            </button>
          </div>
        }
        onStart={(p) => setPlayers(p)}
      />
    )
  }
  return <Table players={players} onReset={() => setPlayers(null)} />
}

interface Round {
  phase: 'bet' | 'roll' | 'settle'
  bets: number[]
  /** index 0 = dealer, i + 1 = player i */
  dice: number[][]
  rolls: number[]
  hands: (Hand | null)[]
  active: number
  rolling: boolean
  instant: number | null
  deltas: number[]
}

function newRound(players: PlayerConfig[], chipsOf: (n: string) => number, prevBets?: number[]): Round {
  return {
    phase: 'bet',
    bets: players.map((p, i) => {
      const c = chipsOf(p.name)
      if (p.isAI) return aiBet(c)
      const want = prevBets?.[i] || 50
      return c < MIN_BET ? 0 : Math.min(c, Math.max(MIN_BET, want))
    }),
    dice: Array.from({ length: players.length + 1 }, () => [1, 2, 3]),
    rolls: Array(players.length + 1).fill(0),
    hands: Array(players.length + 1).fill(null),
    active: 0,
    rolling: false,
    instant: null,
    deltas: players.map(() => 0),
  }
}

function Table({ players, onReset }: { players: PlayerConfig[]; onReset: () => void }) {
  const [chips, setChips] = useStored<Chips>(CHIPS_KEY, {})
  const chipsOf = (name: string) => chips[name] ?? START_CHIPS
  const [r, setR] = useState<Round>(() => newRound(players, chipsOf))
  const settledRef = useRef<Round | null>(null)

  const actorIsAuto = r.active === 0 || players[r.active - 1]?.isAI

  useEffect(() => {
    if (r.phase !== 'roll') return
    let t: ReturnType<typeof setTimeout> | undefined
    const later = (ms: number, f: (p: Round) => Round) => {
      t = setTimeout(() => setR(f), ms)
    }
    if (r.rolling) {
      const v = [rollDie(), rollDie(), rollDie()]
      later(600, (p) => {
        const a = p.active
        const h = evalHand(v)
        const rolls = p.rolls.map((x, i) => (i === a ? x + 1 : x))
        const done = isFinal(h) || rolls[a] >= MAX_ROLLS
        return {
          ...p,
          rolling: false,
          rolls,
          dice: p.dice.map((d, i) => (i === a ? v : d)),
          hands: done ? p.hands.map((x, i) => (i === a ? h : x)) : p.hands,
        }
      })
    } else if (r.hands[r.active]) {
      later(1400, advance)
    } else if (actorIsAuto) {
      later(r.rolls[r.active] === 0 ? 600 : 900, (p) => ({ ...p, rolling: true }))
    }
    return () => clearTimeout(t)
  }, [r]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pay out exactly once per round.
  useEffect(() => {
    if (r.phase !== 'settle' || settledRef.current === r) return
    settledRef.current = r
    setChips((prev) => {
      const next = { ...prev }
      players.forEach((p, i) => {
        if (r.bets[i] > 0) next[p.name] = applyPayout(next[p.name] ?? START_CHIPS, r.bets[i], r.deltas[i] / r.bets[i])
      })
      return next
    })
  }, [r]) // eslint-disable-line react-hooks/exhaustive-deps

  const nextBettor = (bets: number[], from: number) => {
    for (let i = from; i < players.length; i++) if (bets[i] > 0) return i + 1
    return -1
  }

  function settle(p: Round, instant: number | null): Round {
    const dealer = p.hands[0]!
    const deltas = players.map((_, i) => {
      if (p.bets[i] === 0) return 0
      const mult = instant ?? (p.hands[i + 1] ? playerVsDealer(p.hands[i + 1]!, dealer) : 0)
      return p.bets[i] * mult
    })
    return { ...p, phase: 'settle', instant, deltas }
  }

  function advance(p: Round): Round {
    if (p.active === 0) {
      const inst = dealerInstant(p.hands[0]!)
      if (inst != null) return settle(p, inst)
    }
    const nxt = nextBettor(p.bets, p.active)
    if (nxt < 0) return settle(p, null)
    return { ...p, active: nxt }
  }

  const setBet = (i: number, v: number) =>
    setR((p) => ({ ...p, bets: p.bets.map((b, j) => (j === i ? Math.max(MIN_BET, Math.min(chipsOf(players[i].name), v)) : b)) }))

  const refill = (i: number) => {
    setChips((prev) => ({ ...prev, [players[i].name]: START_CHIPS }))
    setR((p) => ({ ...p, bets: p.bets.map((b, j) => (j === i ? 50 : b)) }))
  }

  // ---------- settle screen ----------
  if (r.phase === 'settle') {
    const dealer = r.hands[0]!
    const title =
      r.instant == null
        ? '이번 판 결과'
        : r.instant < 0
          ? `딜러 ${handLabel(dealer)}! 😱`
          : `딜러 ${handLabel(dealer)}! 🎉`
    return (
      <Result
        title={title}
        againLabel="다음 판"
        onAgain={() => setR(newRound(players, chipsOf, r.bets))}
      >
        <div className="cc-dealer-mini">
          🎩 딜러:{' '}
          {r.dice[0].map((d, i) => (
            <Die key={i} value={d} size={26} />
          ))}{' '}
          <strong>{handLabel(dealer)}</strong>
        </div>
        {r.instant != null && (
          <p className="muted">{r.instant < 0 ? `모든 참가자가 베팅의 ${-r.instant}배를 잃어요` : `모든 참가자가 베팅의 ${r.instant}배를 받아요`}</p>
        )}
        <ul className="cc-settle">
          {players.map((p, i) => {
            const d = r.deltas[i]
            return (
              <li key={i}>
                <span className="cc-settle-name">
                  {p.isAI ? '🤖 ' : ''}
                  {p.name}
                </span>
                <span className="cc-settle-hand">
                  {r.bets[i] === 0 ? '쉬어감' : r.hands[i + 1] ? handLabel(r.hands[i + 1]!) : '딜러 패로 결정'}
                </span>
                <strong className={d > 0 ? 'win' : d < 0 ? 'lose' : ''}>
                  {d > 0 ? `+${d}` : d < 0 ? d : '±0'}
                </strong>
                <span className="cc-settle-chips">🪙 {chipsOf(p.name).toLocaleString()}</span>
              </li>
            )
          })}
        </ul>
        <button className="btn ghost" onClick={onReset}>
          인원 바꾸기
        </button>
      </Result>
    )
  }

  // ---------- bet screen ----------
  if (r.phase === 'bet') {
    const anyBet = r.bets.some((b) => b > 0)
    return (
      <div className="cc-bet card-panel">
        <h2>💰 베팅하세요</h2>
        <p className="muted cc-small">딜러(컴퓨터)와 승부해요. 최소 {MIN_BET}칩.</p>
        <ul className="cc-bet-list">
          {players.map((p, i) => {
            const c = chipsOf(p.name)
            return (
              <li key={i} className="cc-bet-row" style={{ '--c': `var(--p${(i % 6) + 1})` } as React.CSSProperties}>
                <div className="cc-bet-head">
                  <span className="cc-bet-name">
                    {p.isAI ? '🤖 ' : ''}
                    {p.name}
                  </span>
                  <span className="cc-bet-chips">🪙 {c.toLocaleString()}</span>
                </div>
                {c < MIN_BET ? (
                  p.isAI ? (
                    <span className="muted">칩이 없어 쉬어요</span>
                  ) : (
                    <button className="btn small accent" onClick={() => refill(i)}>
                      칩 충전 ({START_CHIPS.toLocaleString()})
                    </button>
                  )
                ) : p.isAI ? (
                  <div className="cc-bet-ai">베팅 {r.bets[i]}</div>
                ) : (
                  <div className="cc-stepper">
                    <button className="btn small" onClick={() => setBet(i, r.bets[i] - 50)} disabled={r.bets[i] <= MIN_BET}>
                      −50
                    </button>
                    <button className="btn small" onClick={() => setBet(i, r.bets[i] - 10)} disabled={r.bets[i] <= MIN_BET}>
                      −10
                    </button>
                    <strong>{r.bets[i]}</strong>
                    <button className="btn small" onClick={() => setBet(i, r.bets[i] + 10)} disabled={r.bets[i] >= c}>
                      +10
                    </button>
                    <button className="btn small" onClick={() => setBet(i, r.bets[i] + 50)} disabled={r.bets[i] >= c}>
                      +50
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <button className="btn primary big" disabled={!anyBet} onClick={() => setR((p) => ({ ...p, phase: 'roll', active: 0 }))}>
          🎲 승부!
        </button>
        <button className="btn ghost" onClick={onReset}>
          인원 바꾸기
        </button>
      </div>
    )
  }

  // ---------- roll screen ----------
  const a = r.active
  const actorName = a === 0 ? '딜러' : players[a - 1].name
  const hand = r.hands[a]
  const humanTurn = !actorIsAuto && !hand && !r.rolling
  let status = a === 0 ? '🎩 딜러가 굴려요…' : players[a - 1].isAI ? `🤖 ${actorName} 차례…` : `${actorName} 차례`
  if (hand) status = `${actorName}: ${handLabel(hand)}`
  else if (r.rolls[a] > 0 && !r.rolling) status = `${actorName}: 꽝… 다시 굴려요 (${r.rolls[a]}/${MAX_ROLLS})`

  return (
    <>
      <div className="cc-table felt">
        <div className="status">{status}</div>
        <div className="cc-bowl">
          {r.dice[a].map((d, i) => (
            <Die key={i} value={d} size={62} rolling={r.rolling} />
          ))}
        </div>
        <div className="cc-tries">
          {Array.from({ length: MAX_ROLLS }, (_, i) => (
            <span key={i} className={i < r.rolls[a] ? 'used' : ''} />
          ))}
        </div>
        {humanTurn && (
          <button className="btn accent big cc-roll" onClick={() => setR((p) => ({ ...p, rolling: true }))}>
            🎲 굴리기 ({r.rolls[a] + 1}/{MAX_ROLLS})
          </button>
        )}
        {r.hands[0] && a !== 0 && (
          <div className="cc-dealer-mini">
            🎩 딜러 패: <strong>{handLabel(r.hands[0])}</strong>
          </div>
        )}
      </div>
      <ul className="cc-seats">
        {players.map((p, i) => (
          <li key={i} className={`cc-seat ${a === i + 1 ? 'active' : ''} ${r.bets[i] === 0 ? 'out' : ''}`}>
            <span className="cc-seat-name">
              {p.isAI ? '🤖 ' : ''}
              {p.name}
            </span>
            <span className="cc-seat-bet">{r.bets[i] ? `🪙 ${r.bets[i]}` : '쉬어감'}</span>
            <span className="cc-seat-hand">{r.hands[i + 1] ? handLabel(r.hands[i + 1]!) : a === i + 1 ? '굴리는 중' : ''}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
