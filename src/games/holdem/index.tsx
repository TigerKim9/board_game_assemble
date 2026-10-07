import { useEffect, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { formatChips, type BetAction } from '../poker-core'
import { BankPanel, Chips, PassCover, type ChipBank } from '../poker-core/ui'
import {
  CASH_BUYIN,
  HANDS_PER_LEVEL,
  TOURNEY_STACK,
  advance,
  aiAction,
  alive,
  applyAction,
  createTable,
  isRunout,
  startHand,
  type Mode,
  type Table,
} from './logic'
import { ActionBar, HoldemInfo, HoldemTable, MyHand, OutcomeDetail, outcomeHeadline } from './parts'
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
  const [stoodUp, setStoodUp] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const { players, bet, phase } = t
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

  const myTurn = phase === 'betting' && current != null && !current.isAI && viewer === turn

  return (
    <div className="holdem">
      <HoldemInfo t={t} />
      {note && <div className="holdem-note center">{note}</div>}

      <HoldemTable
        t={t}
        viewer={viewer}
        canSee={canSee}
        status={
          phase === 'done'
            ? outcomeHeadline(t)
            : phase === 'advance'
              ? isRunout(t)
                ? '올인! 카드를 펼쳐요…'
                : '…'
              : current?.isAI
                ? `🤖 ${current.name} 고민 중…`
                : `${current?.name} 차례`
        }
      />

      {phase === 'done' && outcome && <OutcomeDetail t={t} />}

      {needCover && current ? (
        <PassCover name={current.name} onReveal={() => setRevealed(turn)} />
      ) : (
        viewer != null && !bet.seats[viewer].out && <MyHand t={t} seat={viewer} />
      )}

      {myTurn && <ActionBar t={t} onAct={doAct} />}

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
