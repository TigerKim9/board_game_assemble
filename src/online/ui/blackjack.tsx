import { makeCard } from '../../cards'
import '../../games/blackjack/blackjack.css'
import {
  MIN_BET,
  OUTCOME_LABEL,
  handValue,
  legalActions,
  seatNet,
  totalLabel,
  type Action,
  type Table,
} from '../../games/blackjack/logic'
import { CardRow, HandView } from '../../games/blackjack/parts'
import { useKeyedState } from '../../games/onecard/kitHooks'
import { ACTION_KO, type BlackjackAction, type BlackjackView } from '../games/blackjack'
import { nameOf } from './onecard-kit'
import type { OnlineGameProps } from './types'

const CHIPS = [10, 50, 100, 500]
const HOLE = makeCard('S', 1, 99)

export default function OnlineBlackjack({ view: t, seat: me, toAct, seats, act }: OnlineGameProps<BlackjackView, BlackjackAction>) {
  const mine = me !== null && toAct.includes(me)
  const my = me !== null ? t.seats[me] : null
  const [bet, setBet] = useKeyedState<number>(my ? Math.min(50, Math.floor(my.chips / 10) * 10) : 0, `${t.round}`)
  const myTurn = t.phase === 'play' && mine && t.turn?.seat === me
  // legalActions only reads phase/turn/seats, which the view carries unchanged.
  const legal: Action[] = myTurn ? legalActions(t as unknown as Table) : []
  const dealerCards = t.dealerHidden ? [...t.dealer, ...Array(t.dealerHidden).fill(HOLE)] : t.dealer
  const dealerBJ = t.phase === 'done' && t.dealer.length === 2 && handValue(t.dealer).total === 21

  let status = ''
  if (t.over) status = '게임 끝!'
  else if (t.phase === 'bet') {
    const left = toAct.map((i) => nameOf(seats, i))
    status = mine ? '베팅할 칩을 고르고 "베팅"을 눌러요' : `베팅 기다리는 중: ${left.join(', ')}`
  } else if (t.phase === 'play' && t.turn) {
    const s = t.turn.seat
    const multi = t.seats[s].hands.length > 1 ? ` (핸드 ${t.turn.hand + 1})` : ''
    status = myTurn ? `내 차례${multi} — 히트 또는 스탠드` : `${nameOf(seats, s)} 차례${multi}…`
  } else if (t.phase === 'done') status = dealerBJ ? '딜러 블랙잭!' : `${t.round}/${t.rounds}판 끝`

  return (
    <div className="blackjack">
      <div className="blackjack-table felt">
        <div className="blackjack-dealer">
          <div className="blackjack-label">
            딜러 {t.dealer.length > 0 && <span className="blackjack-total">{totalLabel(t.dealer)}</span>}
            {t.phase === 'done' && handValue(t.dealer).total > 21 && <span className="blackjack-badge lose">버스트</span>}
          </div>
          <CardRow cards={dealerCards} hideFrom={t.dealer.length} width={60} />
          <div className="blackjack-shoe">
            {t.round}/{t.rounds}판 · 슈 {t.shoeCount}장{t.shuffled ? ' · 🔀 새로 섞음' : ''}
          </div>
        </div>
        <div className="status blackjack-status">{status}</div>
        <ul className="blackjack-seats">
          {t.seats.map((s, i) => (
            <li
              key={i}
              className={`blackjack-seat ${t.turn?.seat === i || (t.phase === 'bet' && toAct.includes(i)) ? 'active' : ''}`}
              style={{ borderColor: `var(--p${i + 1})` }}
            >
              <div className="blackjack-seat-head">
                <span className="blackjack-name" style={{ color: `var(--p${i + 1})` }}>
                  {seats[i]?.bot ? '🤖 ' : ''}
                  {nameOf(seats, i)}
                  {i === me && ' (나)'}
                  {seats[i]?.connected === false && ' 📴'}
                </span>
                <span className="blackjack-chips">🪙 {s.chips.toLocaleString()}</span>
                {t.notes[i] && t.phase !== 'bet' && <span className="blackjack-ainote">{t.notes[i]}</span>}
                {t.phase === 'done' && s.hands.length > 0 && (
                  <span className={`blackjack-net ${seatNet(s) > 0 ? 'up' : seatNet(s) < 0 ? 'down' : ''}`}>
                    {seatNet(s) > 0 ? '+' : ''}
                    {seatNet(s)}
                  </span>
                )}
              </div>
              {t.phase === 'bet' ? (
                <div className="blackjack-betline">
                  {s.chips < MIN_BET
                    ? '칩이 모두 떨어졌어요 — 구경해요'
                    : t.betDone[i]
                      ? i === me
                        ? `베팅 ${s.bet} ✔`
                        : '베팅 완료 ✔'
                      : '베팅 고르는 중…'}
                </div>
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

      {t.phase === 'bet' && mine && my && (
        <div className="card-panel blackjack-bet">
          <div className="blackjack-betline">
            베팅 <strong>{bet}</strong> <span className="muted">/ {my.chips.toLocaleString()}칩</span>
          </div>
          <div className="blackjack-chip-row">
            {CHIPS.map((c) => (
              <button key={c} className={`blackjack-chip c${c}`} disabled={bet + c > my.chips} onClick={() => setBet(bet + c)}>
                {c}
              </button>
            ))}
            <button className="btn small ghost" onClick={() => setBet(0)} disabled={bet === 0}>
              지우기
            </button>
            <button className="btn small ghost" onClick={() => setBet(my.chips)}>
              올인
            </button>
          </div>
          <button
            className="btn primary big"
            disabled={bet < MIN_BET || bet > my.chips}
            onClick={() => act({ type: 'bet', amount: bet })}
          >
            🃏 {bet < MIN_BET ? `최소 ${MIN_BET}칩` : `${bet}칩 베팅`}
          </button>
        </div>
      )}

      {myTurn && (
        <div className="blackjack-actions blackjack-play">
          {(['hit', 'stand', 'double', 'split'] as const).map((a) => (
            <button
              key={a}
              className={`btn ${a === 'hit' ? 'accent' : a === 'stand' ? 'primary' : ''}`}
              disabled={!legal.includes(a)}
              onClick={() => act({ type: 'act', action: a })}
            >
              {ACTION_KO[a]}
            </button>
          ))}
        </div>
      )}

      {t.phase === 'done' && !t.over && (
        <div className="card-panel">
          <ul className="blackjack-summary">
            {t.seats.map((s, i) =>
              s.hands.length ? (
                <li key={i}>
                  {nameOf(seats, i)}: {s.hands.map((h) => OUTCOME_LABEL[h.outcome!]).join(', ')} ({seatNet(s) > 0 ? '+' : ''}
                  {seatNet(s)})
                </li>
              ) : null,
            )}
          </ul>
          {me !== null && !t.ready[me] ? (
            <button className="btn primary big" onClick={() => act({ type: 'next' })}>
              {t.round >= t.rounds ? '결과 보기' : '다음 판'}
            </button>
          ) : (
            <p className="center muted">
              기다리는 중: {toAct.map((i) => nameOf(seats, i)).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
