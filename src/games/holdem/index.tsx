import { useEffect, useMemo, useState } from 'react'
import { CardSlot, PlayingCard, bestHand, describeHand, type Card } from '../../cards'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { formatChips, legalActions, potTotal, toCall, type BetAction } from '../poker-core'
import { BankPanel, Chips, PassCover, type ChipBank } from '../poker-core/ui'
import {
  CASH_BUYIN,
  HANDS_PER_LEVEL,
  STREET_LABEL,
  TOURNEY_STACK,
  advance,
  aiAction,
  alive,
  applyAction,
  createTable,
  isRunout,
  potSizedRaise,
  preflopPercentile,
  startHand,
  type Mode,
  type Table,
} from './logic'
import './holdem.css'

interface Session {
  id: number
  configs: PlayerConfig[]
  difficulty: Difficulty
  mode: Mode
  blindsUp: boolean
}

export default function Holdem() {
  const [bank, setBank] = useStored<ChipBank>('holdem:chips', {})
  const [mode, setMode] = useStored<Mode>('holdem:mode', 'cash')
  const [blindsUp, setBlindsUp] = useStored('holdem:blindsUp', true)
  const [session, setSession] = useState<Session | null>(null)

  if (!session) {
    return (
      <PlayerSetup
        gameId="holdem"
        min={2}
        max={9}
        defaultCount={6}
        showDifficulty
        startLabel="테이블에 앉기"
        onStart={(configs, difficulty) => setSession({ id: Date.now(), configs, difficulty, mode, blindsUp })}
        extra={
          <div className="holdem-setup-extra">
            <div className="setup-row">
              <span>방식</span>
              <div className="segmented">
                <button className={mode === 'cash' ? 'active' : ''} onClick={() => setMode('cash')}>
                  캐시 게임
                </button>
                <button className={mode === 'tournament' ? 'active' : ''} onClick={() => setMode('tournament')}>
                  토너먼트
                </button>
              </div>
            </div>
            {mode === 'tournament' ? (
              <>
                <label className="holdem-check">
                  <input type="checkbox" checked={blindsUp} onChange={(e) => setBlindsUp(e.target.checked)} />
                  블라인드 상승 ({HANDS_PER_LEVEL}판마다)
                </label>
                <p className="muted holdem-note">모두 {formatChips(TOURNEY_STACK)}칩으로 시작해 한 명이 남을 때까지 겨뤄요.</p>
              </>
            ) : (
              <BankPanel bank={bank} start={CASH_BUYIN} onReset={() => setBank({})} note={`블라인드 5/10. 칩이 바닥나면 ${formatChips(CASH_BUYIN)}칩으로 다시 채울 수 있어요. 진짜 돈은 쓰지 않아요.`} />
            )}
          </div>
        }
      />
    )
  }
  return (
    <Game
      key={session.id}
      session={session}
      bank={bank}
      setBank={setBank}
      onExit={() => setSession(null)}
      onAgain={() => setSession({ ...session, id: Date.now() })}
    />
  )
}

function initialTable(s: Session, bank: ChipBank): Table {
  const players = s.configs.map((c) => ({
    name: c.name,
    isAI: c.isAI,
    stack: s.mode === 'tournament' ? TOURNEY_STACK : c.isAI ? CASH_BUYIN : (bank[c.name] ?? 0) > 0 ? bank[c.name] : CASH_BUYIN,
  }))
  return startHand(createTable(players, s.mode, s.blindsUp, Math.floor(Math.random() * players.length)))
}

function Game({
  session,
  bank,
  setBank,
  onExit,
  onAgain,
}: {
  session: Session
  bank: ChipBank
  setBank: (v: ChipBank | ((b: ChipBank) => ChipBank)) => void
  onExit: () => void
  onAgain: () => void
}) {
  const { difficulty, mode } = session
  const [t, setT] = useState<Table>(() => initialTable(session, bank))
  const [startStacks] = useState(() => t.players.map((p) => p.stack))
  const [refills, setRefills] = useState<number[]>(() => t.players.map(() => 0))
  const [revealed, setRevealed] = useState<number | null>(null)
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raiseTo, setRaiseTo] = useState(0)
  const [stoodUp, setStoodUp] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const { players, bet, phase } = t
  const n = players.length
  const turn = bet.turn
  const current = turn >= 0 ? players[turn] : null
  const humans = players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0)
  const multiHuman = humans.length >= 2
  const humanInHand = humans.some((i) => !bet.seats[i].out && !bet.seats[i].folded)

  // AI 차례
  useEffect(() => {
    if (phase !== 'betting' || !current?.isAI) return
    const snapshot = t
    const delay = (humanInHand ? 700 : 350) + Math.random() * (humanInHand ? 500 : 200)
    const id = setTimeout(() => {
      const a = aiAction(snapshot, difficulty)
      setT((x) => (x === snapshot ? applyAction(x, a) : x))
    }, delay)
    return () => clearTimeout(id)
  }, [t]) // eslint-disable-line react-hooks/exhaustive-deps

  // 다음 스트리트 / 정산
  useEffect(() => {
    if (phase !== 'advance') return
    const snapshot = t
    const id = setTimeout(() => setT((x) => (x === snapshot ? advance(x) : x)), isRunout(t) ? 1300 : 800)
    return () => clearTimeout(id)
  }, [t]) // eslint-disable-line react-hooks/exhaustive-deps

  // 캐시 게임: 판이 끝날 때마다 사람 칩 저장
  useEffect(() => {
    if (phase !== 'done' || mode !== 'cash') return
    setBank((b) => {
      const next = { ...b }
      for (const p of t.players) if (!p.isAI) next[p.name] = p.stack
      return next
    })
  }, [phase, t.handNo]) // eslint-disable-line react-hooks/exhaustive-deps

  const nextHand = () => {
    setRaiseOpen(false)
    setRevealed(null)
    const re = mode === 'cash' ? t.players.filter((p) => p.isAI && p.stack <= 0).map((p) => p.name) : []
    setNote(re.length ? `🤖 ${re.join(', ')} 칩 재충전 (${formatChips(CASH_BUYIN)})` : null)
    setT((x) => {
      if (x.phase !== 'done') return x
      const ps = x.mode === 'cash' ? x.players.map((p) => (p.isAI && p.stack <= 0 ? { ...p, stack: CASH_BUYIN } : p)) : x.players
      return startHand({ ...x, players: ps })
    })
  }

  const refill = (i: number) => {
    setT((x) => ({ ...x, players: x.players.map((p, j) => (j === i ? { ...p, stack: CASH_BUYIN } : p)) }))
    setRefills((r) => r.map((v, j) => (j === i ? v + CASH_BUYIN : v)))
    setBank((b) => ({ ...b, [players[i].name]: CASH_BUYIN }))
  }

  const doAct = (a: BetAction) => {
    setRaiseOpen(false)
    setT((x) => (x.phase === 'betting' && x.bet.turn === turn ? applyAction(x, a) : x))
  }

  // ----- 세션 종료 -----
  const liveIdx = alive(t)
  const tourneyOver = mode === 'tournament' && phase === 'done' && (liveIdx.length < 2 || !humans.some((i) => players[i].stack > 0))
  if (tourneyOver || stoodUp) {
    return <SessionEnd t={t} startStacks={startStacks} refills={refills} humans={humans} onAgain={onAgain} onExit={onExit} />
  }

  // ----- 보는 사람 -----
  const viewer: number | null = !multiHuman
    ? (humans[0] ?? null)
    : phase === 'betting' && current && !current.isAI && revealed === turn
      ? turn
      : null
  const needCover = multiHuman && phase === 'betting' && !!current && !current.isAI && revealed !== turn
  const outcome = t.outcome
  const runout = isRunout(t) || (phase === 'done' && !!outcome?.showdown)
  const isLive = (i: number) => !bet.seats[i].out && !bet.seats[i].folded
  const canSee = (i: number) => i === viewer || (runout && isLive(i))

  const winCards = new Set<string>()
  if (phase === 'done' && outcome?.showdown) {
    for (const w of outcome.winners) outcome.hands[w]?.cards.forEach((c) => winCards.add(c.id))
  }

  const myTurn = phase === 'betting' && current != null && !current.isAI && viewer === turn
  const pot = potTotal(bet)

  return (
    <div className="holdem">
      <div className="holdem-info">
        <span>
          블라인드 <strong>{t.sb}/{t.bb}</strong>
        </span>
        {mode === 'tournament' && t.blindsUp && (
          <span>
            레벨 {t.level + 1} · 다음까지 {HANDS_PER_LEVEL - ((t.handNo - 1) % HANDS_PER_LEVEL)}판
          </span>
        )}
        <span>#{t.handNo}</span>
      </div>
      {note && <div className="holdem-note center">{note}</div>}

      <div className="holdem-table felt">
        <ul className={`holdem-seats ${n <= 4 ? 'few' : ''}`}>
          {players.map((p, i) => {
            const s = bet.seats[i]
            const won = phase === 'done' && (outcome?.winners.includes(i) ?? false)
            const hand = phase === 'done' ? outcome?.hands[i] : null
            return (
              <li
                key={i}
                className={`holdem-seat ${i === turn && phase === 'betting' ? 'turn' : ''} ${s.folded || s.out ? 'folded' : ''} ${won ? 'won' : ''} ${i === viewer ? 'me' : ''}`}
                style={{ ['--seat' as string]: `var(--p${(i % 6) + 1})` }}
              >
                <div className="holdem-seat-name">
                  {i === t.dealer && <span className="holdem-btn" title="딜러 버튼">D</span>}
                  <span className="holdem-name-text">
                    {p.isAI ? '🤖' : ''}
                    {p.name}
                  </span>
                </div>
                <div className="holdem-seat-cards">
                  {s.out ? (
                    <span className="holdem-tag">{mode === 'tournament' ? '탈락' : '쉬는 중'}</span>
                  ) : (
                    t.holes[i].map((c) => (
                      <PlayingCard key={c.id} card={c} faceDown={!canSee(i)} width={28} highlight={winCards.has(c.id)} back="red" />
                    ))
                  )}
                </div>
                <div className="holdem-seat-stack">
                  <Chips amount={s.stack} />
                </div>
                <div className="holdem-seat-tag">
                  {won ? (
                    <span className="holdem-tag win">+{formatChips(outcome!.won[i])}</span>
                  ) : hand ? (
                    <span className="holdem-tag hand">{hand.name}</span>
                  ) : i === turn && phase === 'betting' && p.isAI ? (
                    <span className="holdem-tag thinking">…</span>
                  ) : t.last[i] ? (
                    <span className={`holdem-tag ${s.folded ? 'fold' : ''}`}>{t.last[i]}</span>
                  ) : null}
                </div>
                {s.bet > 0 && phase !== 'done' && <div className="holdem-seat-bet">{formatChips(s.bet)}</div>}
              </li>
            )
          })}
        </ul>

        <div className="holdem-center">
          <div className="holdem-board">
            {Array.from({ length: 5 }, (_, k) =>
              t.board[k] ? (
                <PlayingCard key={t.board[k].id} card={t.board[k]} width={50} highlight={winCards.has(t.board[k].id)} className="holdem-deal" />
              ) : (
                <CardSlot key={k} width={50} className="holdem-slot" />
              ),
            )}
          </div>
          <div className="holdem-pot">
            팟 <Chips amount={pot} />
            <span className="holdem-street">{STREET_LABEL[t.street]}</span>
          </div>
        </div>

        <div className="status holdem-status">
          {phase === 'done'
            ? outcomeHeadline(t)
            : phase === 'advance'
              ? isRunout(t)
                ? '올인! 카드를 펼쳐요…'
                : '…'
              : current?.isAI
                ? `🤖 ${current.name} 고민 중…`
                : `${current?.name} 차례`}
        </div>
      </div>

      {phase === 'done' && outcome && <OutcomeDetail t={t} />}

      {needCover && current ? (
        <PassCover name={current.name} onReveal={() => setRevealed(turn)} />
      ) : (
        viewer != null && !bet.seats[viewer].out && <MyHand t={t} seat={viewer} />
      )}

      {myTurn && (
        <ActionBar
          t={t}
          raiseOpen={raiseOpen}
          setRaiseOpen={(o) => {
            if (o) {
              const l = legalActions(bet)
              setRaiseTo(l.raise ? Math.min(l.raise.max, Math.max(l.raise.min, potSizedRaise(t, 0.5))) : 0)
            }
            setRaiseOpen(o)
          }}
          raiseTo={raiseTo}
          setRaiseTo={setRaiseTo}
          onAct={doAct}
        />
      )}

      {phase === 'done' && (
        <div className="holdem-after">
          {mode === 'cash' && humans.some((i) => players[i].stack <= 0) ? (
            humans
              .filter((i) => players[i].stack <= 0)
              .map((i) => (
                <button key={i} className="btn accent big" onClick={() => refill(i)}>
                  💰 {players[i].name} 칩 충전 ({formatChips(CASH_BUYIN)})
                </button>
              ))
          ) : (
            <button className="btn primary big" onClick={nextHand}>
              다음 판
            </button>
          )}
          {mode === 'cash' && (
            <button className="btn ghost" onClick={() => setStoodUp(true)}>
              자리에서 일어나기
            </button>
          )}
        </div>
      )}
      {mode === 'tournament' && phase !== 'done' && humans.every((i) => bet.seats[i].out || bet.seats[i].folded) && (
        <p className="muted center holdem-note">컴퓨터끼리 마무리하는 중…</p>
      )}
    </div>
  )
}

function outcomeHeadline(t: Table): string {
  const o = t.outcome!
  const names = o.winners.map((w) => t.players[w].name)
  if (!o.showdown) return `🎉 ${names.join(', ')} 팟 획득!`
  const main = o.awards[0]
  if (main && main.winners.length > 1) return `🤝 ${main.winners.map((w) => t.players[w].name).join(', ')} 나눠 가짐`
  const w = main?.winners[0] ?? o.winners[0]
  const h = o.hands[w]
  return `🎉 ${t.players[w].name} 승리${h ? ` — ${describeHand(h)}` : ''}`
}

function OutcomeDetail({ t }: { t: Table }) {
  const o = t.outcome!
  if (!o.showdown || o.awards.length <= 1) return null
  return (
    <ul className="holdem-pots card-panel">
      {o.awards.map((a, k) => (
        <li key={k}>
          <span className="muted">{k === 0 ? '메인 팟' : `사이드 팟 ${k}`}</span> <Chips amount={a.amount} /> →{' '}
          <strong>{a.winners.map((w) => t.players[w].name).join(', ')}</strong>
          {a.winners.length > 1 && <span className="muted"> (나눔)</span>}
        </li>
      ))}
    </ul>
  )
}

function MyHand({ t, seat }: { t: Table; seat: number }) {
  const hole = t.holes[seat]
  const s = t.bet.seats[seat]
  const hint = useMemo(() => {
    if (hole.length < 2) return ''
    if (t.board.length >= 3) return describeHand(bestHand([...hole, ...t.board]))
    const pct = preflopPercentile(hole[0], hole[1])
    const pair = hole[0].rank === hole[1].rank
    const tier = pct < 0.05 ? '프리미엄' : pct < 0.15 ? '아주 좋음' : pct < 0.3 ? '좋음' : pct < 0.55 ? '보통' : '약함'
    return `${pair ? '포켓 페어 · ' : hole[0].suit === hole[1].suit ? '수딧 · ' : ''}시작 패 ${tier}${pct < 0.5 ? ` (상위 ${Math.max(1, Math.round(pct * 100))}%)` : ''}`
  }, [hole, t.board])
  const win = new Set<string>()
  if (t.phase === 'done' && t.outcome?.showdown && t.outcome.winners.includes(seat)) t.outcome.hands[seat]?.cards.forEach((c) => win.add(c.id))
  return (
    <div className={`holdem-me card-panel ${s.folded ? 'folded' : ''}`}>
      <div className="holdem-me-cards">
        {hole.map((c: Card) => (
          <PlayingCard key={c.id} card={c} width={68} highlight={win.has(c.id)} />
        ))}
      </div>
      <div className="holdem-me-info">
        <span className="muted">{t.players[seat].name}님의 패</span>
        <strong>{s.folded ? '폴드했어요' : hint}</strong>
        <span className="holdem-me-stack">
          칩 <Chips amount={s.stack} />
          {s.bet > 0 && t.phase !== 'done' && <span className="muted"> · 베팅 {formatChips(s.bet)}</span>}
        </span>
      </div>
    </div>
  )
}

function ActionBar({
  t,
  raiseOpen,
  setRaiseOpen,
  raiseTo,
  setRaiseTo,
  onAct,
}: {
  t: Table
  raiseOpen: boolean
  setRaiseOpen: (o: boolean) => void
  raiseTo: number
  setRaiseTo: (v: number) => void
  onAct: (a: BetAction) => void
}) {
  const l = legalActions(t.bet)
  const seat = t.bet.seats[t.bet.turn]
  const need = toCall(t.bet, t.bet.turn)
  const callAll = need >= seat.stack
  const betWord = t.bet.currentBet === 0 ? '베팅' : '레이즈'
  const r = l.raise
  const clamp = (v: number) => (r ? Math.max(r.min, Math.min(r.max, Math.round(v))) : 0)
  const quick: [string, number][] = r
    ? [
        ['최소', r.min],
        ['½팟', clamp(potSizedRaise(t, 0.5))],
        ['팟', clamp(potSizedRaise(t, 1))],
        ['올인', r.max],
      ]
    : []
  return (
    <div className="holdem-actions">
      {raiseOpen && r && (
        <div className="holdem-raise card-panel">
          <div className="holdem-raise-amount">
            {betWord} <strong>{formatChips(raiseTo)}</strong>
            {raiseTo >= r.max && <span className="holdem-allin">올인</span>}
          </div>
          <input
            type="range"
            className="holdem-slider"
            min={r.min}
            max={r.max}
            step={Math.max(1, Math.min(t.bb, r.max - r.min))}
            value={raiseTo}
            onChange={(e) => setRaiseTo(clamp(Number(e.target.value)))}
            aria-label="레이즈 금액"
          />
          <div className="holdem-quick">
            {quick.map(([label, v]) => (
              <button key={label} className={`btn small ${raiseTo === v ? 'primary' : ''}`} onClick={() => setRaiseTo(v)}>
                {label}
              </button>
            ))}
          </div>
          <div className="holdem-raise-go">
            <button className="btn ghost" onClick={() => setRaiseOpen(false)}>
              취소
            </button>
            <button className="btn accent" onClick={() => onAct({ kind: 'raise', to: raiseTo })}>
              {raiseTo >= r.max ? '올인' : `${betWord} ${formatChips(raiseTo)}`}
            </button>
          </div>
        </div>
      )}
      <div className="holdem-buttons">
        <button className="btn danger" disabled={l.canCheck} onClick={() => onAct({ kind: 'fold' })}>
          폴드
        </button>
        <button className="btn primary" onClick={() => onAct(l.canCheck ? { kind: 'check' } : { kind: 'call' })}>
          {l.canCheck ? '체크' : callAll ? `올인 ${formatChips(l.callAmount)}` : `콜 ${formatChips(l.callAmount)}`}
        </button>
        <button className="btn accent" disabled={!r} onClick={() => setRaiseOpen(!raiseOpen)}>
          {betWord}
        </button>
      </div>
    </div>
  )
}

function SessionEnd({
  t,
  startStacks,
  refills,
  humans,
  onAgain,
  onExit,
}: {
  t: Table
  startStacks: number[]
  refills: number[]
  humans: number[]
  onAgain: () => void
  onExit: () => void
}) {
  const { players } = t
  if (t.mode === 'tournament') {
    const live = alive(t).sort((a, b) => players[b].stack - players[a].stack)
    const order = [...live, ...t.busted.slice().reverse()]
    const winner = order[0]
    const me = humans.length === 1 ? humans[0] : null
    const myRank = me != null ? order.indexOf(me) + 1 : 0
    const title =
      me != null
        ? winner === me && live.length === 1
          ? '🏆 토너먼트 우승!'
          : `탈락 — ${myRank}위`
        : `🏆 ${players[winner].name} 우승!`
    return (
      <Result title={title} onAgain={onAgain}>
        <p className="muted">{t.handNo}판 진행 · 블라인드 {t.sb}/{t.bb}</p>
        <ol className="holdem-ranking">
          {order.map((i) => (
            <li key={i}>
              {players[i].isAI ? '🤖 ' : ''}
              {players[i].name}
              {players[i].stack > 0 && <> — <Chips amount={players[i].stack} /></>}
            </li>
          ))}
        </ol>
        <button className="btn ghost" onClick={onExit}>
          설정으로
        </button>
      </Result>
    )
  }
  return (
    <Result title="자리에서 일어났어요" onAgain={onAgain} againLabel="다시 앉기">
      <ul className="holdem-ranking plain">
        {humans.map((i) => {
          const net = players[i].stack - startStacks[i] - refills[i]
          return (
            <li key={i}>
              {players[i].name}: <Chips amount={players[i].stack} />{' '}
              <span className={net >= 0 ? 'holdem-plus' : 'holdem-minus'}>
                ({net >= 0 ? '+' : ''}
                {formatChips(net)})
              </span>
            </li>
          )
        })}
      </ul>
      <p className="muted">{t.handNo}판을 했어요. 칩은 이름별로 저장됐어요.</p>
      <button className="btn ghost" onClick={onExit}>
        설정으로
      </button>
    </Result>
  )
}
