import { useEffect, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { formatChips } from '../poker-core'
import { BankPanel, Chips, PassCover, type ChipBank } from '../poker-core/ui'
import {
  ANTE,
  START_CHIPS,
  advance,
  aiBet,
  aiChoice,
  applyBet,
  boss,
  choose,
  createTable,
  isRunout,
  solvent,
  startHand,
  type SPlayer,
  type Table,
} from './logic'
import { BetButtons, ChoicePanel, MyCards, PotsDetail, SevenTable, headline, winningCards } from './parts'
import './sevenpoker.css'

interface Session {
  id: number
  configs: PlayerConfig[]
  difficulty: Difficulty
}

export default function SevenPoker() {
  const [bank, setBank] = useStored<ChipBank>('sevenpoker:chips', {})
  const [session, setSession] = useState<Session | null>(null)
  if (!session) {
    return (
      <PlayerSetup
        gameId="sevenpoker"
        min={2}
        max={7}
        defaultCount={4}
        showDifficulty
        onStart={(configs, difficulty) => setSession({ id: Date.now(), configs, difficulty })}
        extra={<BankPanel bank={bank} start={START_CHIPS} onReset={() => setBank({})} />}
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

function seatPlayers(configs: PlayerConfig[], bank: ChipBank): { players: SPlayer[]; refilled: string[] } {
  const refilled: string[] = []
  const players = configs.map((c) => {
    let stack = bank[c.name] ?? START_CHIPS
    if (stack < ANTE) {
      if (bank[c.name] != null) refilled.push(c.name)
      stack = START_CHIPS
    }
    return { name: c.name, isAI: c.isAI, stack }
  })
  return { players, refilled }
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
  const { difficulty } = session
  const [init] = useState(() => seatPlayers(session.configs, bank))
  const [t, setT] = useState<Table>(() => startHand(createTable(init.players, Math.floor(Math.random() * init.players.length))))
  const [revealed, setRevealed] = useState<number | null>(null)
  const [quit, setQuit] = useState(false)
  const [startStacks] = useState(() => init.players.map((p) => p.stack))

  const { players, bet, phase } = t
  const turn = bet.turn
  const current = turn >= 0 ? players[turn] : null
  const humans = players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0)
  const multiHuman = humans.length >= 2
  const humanInHand = humans.some((i) => !bet.seats[i].out && !bet.seats[i].folded)

  // AI 초이스
  useEffect(() => {
    if (phase !== 'choice') return
    const pending = players.map((p, i) => (p.isAI && !t.chosen[i] ? i : -1)).filter((i) => i >= 0)
    if (!pending.length) return
    const snapshot = t
    const id = setTimeout(() => {
      setT((x) => {
        if (x !== snapshot) return x
        let y = x
        for (const i of pending) {
          const c = aiChoice(
            y.cards[i].map((s) => s.card),
            difficulty,
          )
          y = choose(y, i, c.discard, c.open)
        }
        return y
      })
    }, 500)
    return () => clearTimeout(id)
  }, [t]) // eslint-disable-line react-hooks/exhaustive-deps

  // AI 베팅
  useEffect(() => {
    if (phase !== 'betting' || !current?.isAI) return
    const snapshot = t
    const delay = (humanInHand ? 750 : 380) + Math.random() * (humanInHand ? 450 : 200)
    const id = setTimeout(() => {
      const b = aiBet(snapshot, difficulty)
      setT((x) => (x === snapshot ? applyBet(x, b) : x))
    }, delay)
    return () => clearTimeout(id)
  }, [t]) // eslint-disable-line react-hooks/exhaustive-deps

  // 카드 돌리기 / 정산
  useEffect(() => {
    if (phase !== 'advance') return
    const snapshot = t
    const id = setTimeout(() => setT((x) => (x === snapshot ? advance(x) : x)), isRunout(t) ? 1200 : 750)
    return () => clearTimeout(id)
  }, [t]) // eslint-disable-line react-hooks/exhaustive-deps

  // 칩 저장
  useEffect(() => {
    if (phase !== 'done') return
    setBank((b) => ({ ...b, ...Object.fromEntries(t.players.map((p) => [p.name, p.stack])) }))
  }, [phase, t.handNo]) // eslint-disable-line react-hooks/exhaustive-deps

  const nextHand = () => {
    setRevealed(null)
    setT((x) => (x.phase === 'done' ? startHand(x) : x))
  }

  const humanSolvent = humans.some((i) => players[i].stack > 0)
  const over = phase === 'done' && (solvent(t).length < 2 || !humanSolvent)
  if (quit || over) {
    const ranking = players.map((p, i) => ({ p, i })).sort((a, b) => b.p.stack - a.p.stack)
    const me = humans.length === 1 ? humans[0] : null
    const title = quit
      ? '게임을 마쳤어요'
      : me != null
        ? players[me].stack > 0
          ? `🏆 ${players[me].name} 싹쓸이!`
          : '💸 칩을 모두 잃었어요'
        : `🏆 ${ranking[0].p.name} 최종 승리!`
    return (
      <Result title={title} onAgain={onAgain}>
        <ol className="sevenpoker-ranking">
          {ranking.map(({ p, i }) => {
            const net = p.stack - startStacks[i]
            return (
              <li key={i}>
                {p.isAI ? '🤖 ' : ''}
                {p.name} — <Chips amount={p.stack} />{' '}
                <span className={net >= 0 ? 'sevenpoker-plus' : 'sevenpoker-minus'}>
                  ({net >= 0 ? '+' : ''}
                  {formatChips(net)})
                </span>
              </li>
            )
          })}
        </ol>
        <p className="muted">{t.handNo}판을 했어요. 칩은 이름별로 저장됐어요.</p>
        <button className="btn ghost" onClick={onExit}>
          인원 바꾸기
        </button>
      </Result>
    )
  }

  // ----- 누가 보는가 -----
  const choiceSeat = phase === 'choice' ? (humans.find((i) => !t.chosen[i]) ?? null) : null
  let viewer: number | null = null
  let coverFor: number | null = null
  if (!multiHuman) viewer = humans[0] ?? null
  else if (phase === 'choice' && choiceSeat != null) {
    if (revealed === choiceSeat) viewer = choiceSeat
    else coverFor = choiceSeat
  } else if (phase === 'betting' && current && !current.isAI) {
    if (revealed === turn) viewer = turn
    else coverFor = turn
  }
  const outcome = t.outcome
  const showAll = phase === 'done' && !!outcome?.showdown
  const isLive = (i: number) => !bet.seats[i].out && !bet.seats[i].folded
  const canSee = (i: number) => i === viewer || (showAll && isLive(i))
  const winCards = winningCards(t)
  const bossSeat = phase === 'betting' || phase === 'advance' ? boss(t) : -1
  const myTurn = phase === 'betting' && current != null && !current.isAI && viewer === turn

  return (
    <div className="sevenpoker">
      {init.refilled.length > 0 && t.handNo === 1 && (
        <div className="sevenpoker-note">💰 {init.refilled.join(', ')}님 칩을 {formatChips(START_CHIPS)}개로 다시 채웠어요.</div>
      )}
      <SevenTable
        t={t}
        canSee={canSee}
        bossSeat={bossSeat}
        status={
          phase === 'done'
            ? headline(t)
            : phase === 'choice'
              ? '초이스: 1장 버리고 1장 공개'
              : phase === 'advance'
                ? isRunout(t)
                  ? '올인! 카드를 마저 돌려요…'
                  : '카드를 돌려요…'
                : current?.isAI
                  ? `🤖 ${current.name} 고민 중…`
                  : `${current?.name} 차례`
        }
      />

      <PotsDetail t={t} />

      {coverFor != null ? (
        <PassCover name={players[coverFor].name} onReveal={() => setRevealed(coverFor)} hint="다른 사람이 히든 카드를 보지 않도록 화면을 넘겨주세요." />
      ) : phase === 'choice' && choiceSeat != null && viewer === choiceSeat ? (
        <ChoicePanel
          key={`${t.handNo}-${choiceSeat}`}
          cards={t.cards[choiceSeat].map((c) => c.card)}
          name={players[choiceSeat].name}
          onDone={(d, o) => setT((x) => choose(x, choiceSeat, d, o))}
        />
      ) : (
        viewer != null && !bet.seats[viewer].out && <MyCards t={t} seat={viewer} winCards={winCards} />
      )}

      {myTurn && <BetButtons t={t} onBet={(b) => setT((x) => (x.phase === 'betting' && x.bet.turn === turn ? applyBet(x, b) : x))} />}

      {phase === 'done' && (
        <div className="sevenpoker-after">
          <button className="btn primary big" onClick={nextHand}>
            다음 판
          </button>
          <button className="btn ghost" onClick={() => setQuit(true)}>
            그만하기
          </button>
        </div>
      )}
    </div>
  )
}
