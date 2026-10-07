import { useEffect, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { PlayerConfig } from '../../lib/types'
import {
  CUT,
  MIN_BET,
  OUTCOME_LABEL,
  START_CHIPS,
  act,
  aiAction,
  canStart,
  currentHand,
  dealStep,
  dealerStep,
  handValue,
  legalActions,
  newTable,
  nextRound,
  seatNet,
  startRound,
  totalLabel,
  type Action,
  type Table,
} from './logic'
import { CardRow, HandView } from './parts'
import './blackjack.css'

type Bank = Record<string, number>

export default function Blackjack() {
  const [players, setPlayers] = useState<PlayerConfig[] | null>(null)
  const [bank, setBank] = useStored<Bank>('blackjack:chips', {})

  if (!players) {
    const saved = Object.entries(bank)
    return (
      <PlayerSetup
        gameId="blackjack"
        min={1}
        max={5}
        defaultCount={2}
        startLabel="테이블에 앉기"
        extra={
          <div className="blackjack-bank">
            <p className="muted">가상 칩만 사용해요. 사람 자리의 칩은 이름별로 저장돼요 (처음엔 {START_CHIPS}칩).</p>
            {saved.length > 0 && (
              <div className="blackjack-bank-row">
                <span>
                  {saved
                    .slice(0, 4)
                    .map(([n, c]) => `${n} ${c.toLocaleString()}칩`)
                    .join(' · ')}
                </span>
                <button className="btn small ghost" onClick={() => setBank({})}>
                  칩 초기화
                </button>
              </div>
            )}
          </div>
        }
        onStart={(p) => setPlayers(p)}
      />
    )
  }
  return <Game players={players} bank={bank} setBank={setBank} onExit={() => setPlayers(null)} />
}

const ACTION_LABEL: Record<Action, string> = {
  hit: '히트',
  stand: '스탠드',
  double: '더블',
  split: '스플릿',
}
const CHIPS = [10, 50, 100, 500]

function Game({
  players,
  bank,
  setBank,
  onExit,
}: {
  players: PlayerConfig[]
  bank: Bank
  setBank: (v: Bank | ((b: Bank) => Bank)) => void
  onExit: () => void
}) {
  const [t, setT] = useState<Table>(() =>
    newTable(
      players.map((p) => ({
        name: p.name,
        isAI: p.isAI,
        chips: p.isAI ? START_CHIPS : (bank[p.name] ?? START_CHIPS),
      })),
    ),
  )
  const [aiNote, setAiNote] = useState<Record<number, string>>({})
  const cur = currentHand(t)
  const curSeat = t.turn ? t.seats[t.turn.seat] : null

  // Opening deal, AI turns and dealer play, one step at a time (timer cleared on every change).
  useEffect(() => {
    let delay = 0
    let step: (() => Table) | null = null
    if (t.phase === 'dealing') {
      delay = t.step === 0 ? (t.shuffled ? 900 : 300) : 260
      step = () => dealStep(t)
    } else if (t.phase === 'dealer') {
      delay = t.holeUp ? 700 : 500
      step = () => dealerStep(t)
    } else if (t.phase === 'play' && curSeat?.isAI) {
      delay = 750
      step = () => {
        const a = aiAction(t)
        const seat = t.turn!.seat
        setAiNote((n) => ({ ...n, [seat]: ACTION_LABEL[a] }))
        return act(t, a)
      }
    }
    if (!step) return
    const run = step
    const id = setTimeout(() => setT(run()), delay)
    return () => clearTimeout(id)
  }, [t, curSeat])

  // Persist human chips after each round.
  useEffect(() => {
    if (t.phase !== 'done') return
    setBank((b) => {
      const n = { ...b }
      for (const s of t.seats) if (!s.isAI) n[s.name] = s.chips
      return n
    })
  }, [t.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const setBet = (i: number, bet: number) =>
    setT((x) => ({
      ...x,
      seats: x.seats.map((s, j) => (j === i ? { ...s, bet: Math.max(0, Math.min(bet, s.chips)) } : s)),
    }))
  const refill = (i: number) => {
    setT((x) => ({
      ...x,
      seats: x.seats.map((s, j) => (j === i ? { ...s, chips: START_CHIPS, bet: 50 } : s)),
    }))
    setBank((b) => ({ ...b, [t.seats[i].name]: START_CHIPS }))
  }
  const deal = () => {
    setAiNote({})
    setT((x) => startRound(x))
  }
  const doAction = (a: Action) => setT((x) => act(x, a))

  const legal = legalActions(t)
  const humanTurn = t.phase === 'play' && curSeat && !curSeat.isAI
  const humans = t.seats.filter((s) => !s.isAI)
  const dealerShown = t.holeUp ? t.dealer : t.dealer.slice(0, 1)

  let status = ''
  if (t.phase === 'bet') status = '베팅할 칩을 고르고 딜을 눌러요'
  else if (t.phase === 'dealing') status = t.shuffled && t.step === 0 ? '🔀 새 슈로 셔플 중…' : '카드를 나눠요…'
  else if (t.phase === 'play' && curSeat)
    status = curSeat.isAI
      ? `🤖 ${curSeat.name} 생각 중…`
      : `${curSeat.name} 차례${curSeat.hands.length > 1 ? ` (핸드 ${t.turn!.hand + 1})` : ''}`
  else if (t.phase === 'dealer') status = '딜러 차례'
  else if (t.phase === 'done')
    status = handValue(t.dealer).total === 21 && t.dealer.length === 2 ? '딜러 블랙잭!' : '라운드 끝'

  return (
    <div className="blackjack">
      <div className="blackjack-table felt">
        <div className="blackjack-dealer">
          <div className="blackjack-label">
            딜러{' '}
            {t.dealer.length > 0 && (
              <span className="blackjack-total">{t.holeUp ? totalLabel(t.dealer) : totalLabel(dealerShown)}</span>
            )}
            {t.phase === 'done' && handValue(t.dealer).total > 21 && (
              <span className="blackjack-badge lose">버스트</span>
            )}
          </div>
          <CardRow cards={t.dealer} hideFrom={t.holeUp ? 99 : 1} width={60} />
          <div className="blackjack-shoe">
            슈 {t.shoe.length}장 {t.shoe.length < CUT && t.phase === 'bet' ? '· 다음 판에 셔플' : ''}
          </div>
        </div>
        <div className="status blackjack-status">{status}</div>
        <ul className="blackjack-seats">
          {t.seats.map((s, i) => (
            <li
              key={i}
              className={`blackjack-seat ${t.turn?.seat === i ? 'active' : ''}`}
              style={{ borderColor: `var(--p${i + 1})` }}
            >
              <div className="blackjack-seat-head">
                <span className="blackjack-name" style={{ color: `var(--p${i + 1})` }}>
                  {s.isAI ? '🤖 ' : ''}
                  {s.name}
                </span>
                <span className="blackjack-chips">🪙 {s.chips.toLocaleString()}</span>
                {aiNote[i] && t.phase !== 'bet' && <span className="blackjack-ainote">{aiNote[i]}</span>}
                {t.phase === 'done' && s.hands.length > 0 && (
                  <span className={`blackjack-net ${seatNet(s) > 0 ? 'up' : seatNet(s) < 0 ? 'down' : ''}`}>
                    {seatNet(s) > 0 ? '+' : ''}
                    {seatNet(s)}
                  </span>
                )}
              </div>
              {t.phase === 'bet' ? (
                s.isAI ? (
                  <div className="blackjack-betline">베팅 {s.bet}</div>
                ) : s.chips < MIN_BET ? (
                  <div className="blackjack-betline">
                    칩이 모두 떨어졌어요.{' '}
                    <button className="btn small accent" onClick={() => refill(i)}>
                      {START_CHIPS}칩 다시 받기
                    </button>
                  </div>
                ) : (
                  <div className="blackjack-bet">
                    <div className="blackjack-betline">
                      베팅 <strong>{s.bet}</strong>
                      {s.bet === 0 && <span className="muted"> (이번 판 쉬기)</span>}
                    </div>
                    <div className="blackjack-chip-row">
                      {CHIPS.map((c) => (
                        <button
                          key={c}
                          className={`blackjack-chip c${c}`}
                          disabled={s.bet + c > s.chips}
                          onClick={() => setBet(i, s.bet + c)}
                        >
                          {c}
                        </button>
                      ))}
                      <button className="btn small ghost" onClick={() => setBet(i, 0)} disabled={s.bet === 0}>
                        지우기
                      </button>
                      <button className="btn small ghost" onClick={() => setBet(i, Math.floor(s.chips / 10) * 10)}>
                        올인
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div className="blackjack-hands">
                  {s.hands.length === 0 && <span className="muted blackjack-sitout">이번 판은 쉬어요</span>}
                  {s.hands.map((h, hi) => (
                    <HandView key={hi} hand={h} active={t.turn?.seat === i && t.turn.hand === hi} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {t.phase === 'bet' && (
        <div className="blackjack-actions">
          <button className="btn primary big" disabled={!canStart(t)} onClick={deal}>
            🃏 딜하기
          </button>
          <button className="btn ghost small" onClick={onExit}>
            자리 바꾸기
          </button>
        </div>
      )}

      {humanTurn && cur && (
        <div className="blackjack-actions blackjack-play">
          {(['hit', 'stand', 'double', 'split'] as const).map((a) => (
            <button
              key={a}
              className={`btn ${a === 'hit' ? 'accent' : a === 'stand' ? 'primary' : ''}`}
              disabled={!legal.includes(a)}
              onClick={() => doAction(a)}
            >
              {ACTION_LABEL[a]}
            </button>
          ))}
        </div>
      )}

      {t.phase === 'done' && (
        <Result title={resultTitle(t, humans.length)} onAgain={() => setT((x) => nextRound(x))} againLabel="다음 판">
          <ul className="blackjack-summary">
            {t.seats
              .filter((s) => s.hands.length)
              .map((s, i) => (
                <li key={i}>
                  {s.isAI ? '🤖 ' : ''}
                  {s.name}: {s.hands.map((h) => OUTCOME_LABEL[h.outcome!]).join(', ')} ({seatNet(s) > 0 ? '+' : ''}
                  {seatNet(s)})
                </li>
              ))}
          </ul>
          <button className="btn ghost" onClick={onExit}>
            자리 바꾸기
          </button>
        </Result>
      )}
    </div>
  )
}

function resultTitle(t: Table, humanCount: number): string {
  const humans = t.seats.filter((s) => !s.isAI && s.hands.length)
  if (humanCount === 1 && humans.length === 1) {
    const net = seatNet(humans[0])
    if (humans[0].hands.some((h) => h.outcome === 'blackjack')) return `🎉 블랙잭! +${net}`
    return net > 0 ? `🎉 승리! +${net}` : net < 0 ? `😢 ${net}칩` : '🤝 무승부'
  }
  return '라운드 결과'
}
