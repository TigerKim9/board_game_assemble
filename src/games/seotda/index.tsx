import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { HwatuStyleToggle } from '../../hwatu'
import { sleep } from '../../lib/random'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  ANTE,
  START_CHIPS,
  aiAction,
  applyAction,
  settle,
  startHand,
  type Action,
  type SPlayer,
  type Table,
} from './logic'
import { BetButtons, SeotdaHand, SeotdaTable, SeotdaTools, showdownText } from './parts'
import './seotda.css'

type ChipBank = Record<string, number>

interface Session {
  configs: PlayerConfig[]
  difficulty: Difficulty
  table: Table
  /** 승부 결과를 칩에 반영했는지 */
  settled: boolean
  winnings: number[]
  refilled: string[]
}

function buildPlayers(configs: PlayerConfig[], bank: ChipBank): { players: SPlayer[]; refilled: string[] } {
  const refilled: string[] = []
  const players = configs.map((c) => {
    let chips = bank[c.name] ?? START_CHIPS
    if (chips < ANTE) {
      chips = START_CHIPS
      if (bank[c.name] != null) refilled.push(c.name)
    }
    return { name: c.name, isAI: c.isAI, chips, bet: 0, folded: false, inHand: true, cards: [] }
  })
  return { players, refilled }
}

export default function Seotda() {
  const [bank, setBank] = useStored<ChipBank>('seotda:chips', {})
  const [session, setSession] = useState<Session | null>(null)

  const begin = (configs: PlayerConfig[], difficulty: Difficulty) => {
    const { players, refilled } = buildPlayers(configs, bank)
    const dealer = Math.floor(Math.random() * players.length)
    setSession({ configs, difficulty, table: startHand(players, dealer), settled: false, winnings: [], refilled })
  }

  if (!session) {
    const saved = Object.entries(bank)
    return (
      <PlayerSetup
        gameId="seotda"
        min={2}
        max={5}
        defaultCount={3}
        showDifficulty
        onStart={begin}
        extra={
          <>
          <HwatuStyleToggle />
          <div className="seotda-bank">
            <div className="seotda-bank-head">
              <span>💰 보유 칩 (가상)</span>
              {saved.length > 0 && (
                <button className="btn small ghost" onClick={() => setBank({})}>
                  칩 초기화
                </button>
              )}
            </div>
            <p className="muted">
              {saved.length === 0
                ? `처음이면 모두 ${START_CHIPS}칩으로 시작해요.`
                : saved
                    .slice(0, 8)
                    .map(([n, c]) => `${n} ${c}`)
                    .join(' · ')}
            </p>
            <p className="muted small-note">칩이 다 떨어진 사람은 다음 게임에서 {START_CHIPS}칩으로 다시 채워 드려요. 진짜 돈은 쓰지 않아요.</p>
          </div>
          </>
        }
      />
    )
  }
  return <Game key={session.configs.map((c) => c.name).join()} session={session} setSession={setSession} setBank={setBank} onReset={() => setSession(null)} onAgain={() => begin(session.configs, session.difficulty)} />
}

function Game({
  session,
  setSession,
  setBank,
  onReset,
  onAgain,
}: {
  session: Session
  setSession: React.Dispatch<React.SetStateAction<Session | null>>
  setBank: (v: ChipBank | ((p: ChipBank) => ChipBank)) => void
  onReset: () => void
  onAgain: () => void
}) {
  const { table, difficulty } = session
  const { players, turn, phase } = table
  const humans = players.map((_, i) => i).filter((i) => !players[i].isAI)
  const multiHuman = humans.length >= 2
  const [revealed, setRevealed] = useState<number | null>(null)
  const aiRunning = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const setTable = (fn: (t: Table) => Table) => setSession((s) => s && { ...s, table: fn(s.table) })
  const current = players[turn]
  const betting = phase !== 'showdown'

  // AI 차례
  useEffect(() => {
    if (!betting || !current.isAI || aiRunning.current) return
    aiRunning.current = true
    ;(async () => {
      await sleep(750 + Math.random() * 450)
      if (!alive.current) return
      aiRunning.current = false
      setTable((t) => (t.phase === 'showdown' || t.turn !== turn ? t : applyAction(t, aiAction(t, t.turn, difficulty))))
    })()
  }, [turn, phase, table.handNo, betting]) // eslint-disable-line react-hooks/exhaustive-deps

  // 승부가 나면 칩 정산 + 저장
  useEffect(() => {
    if (phase !== 'showdown' || session.settled) return
    const s = settle(table)
    setBank((b) => ({ ...b, ...Object.fromEntries(s.players.map((p) => [p.name, p.chips])) }))
    setSession((ss) => ss && { ...ss, settled: true, winnings: s.winnings, table: { ...ss.table, players: s.players } })
  }, [phase, session.settled]) // eslint-disable-line react-hooks/exhaustive-deps

  // 사람 차례가 바뀌면 가림막
  useEffect(() => {
    if (!multiHuman) return
    if (revealed !== turn) setRevealed(null)
  }, [turn, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const nextHand = () => {
    // 칩은 이미 정산됨(재경기면 판돈을 그대로 넘김)
    const redeal = table.result?.kind === 'redeal'
    const ps = table.players.map((p) => ({ ...p }))
    const n = ps.length
    let dealer = table.dealer
    if (!redeal) {
      for (let k = 1; k <= n; k++) {
        const j = (dealer + k) % n
        if (ps[j].chips >= ANTE) {
          dealer = j
          break
        }
      }
    }
    setRevealed(null)
    setSession((ss) => ss && { ...ss, settled: false, winnings: [], refilled: [], table: startHand(ps, dealer, redeal ? table.pot : 0, table.handNo + 1) })
  }

  const act = (a: Action) => {
    if (!betting || current.isAI) return
    setTable((t) => (t.turn !== turn || t.phase === 'showdown' ? t : applyAction(t, a)))
  }

  // ----- 화면 -----
  const settledPlayers = table.players
  const solvent = settledPlayers.filter((p) => p.chips >= ANTE)
  const humanSolvent = settledPlayers.some((p) => !p.isAI && p.chips >= ANTE)
  const redeal = table.result?.kind === 'redeal'
  const sessionOver = phase === 'showdown' && session.settled && !redeal && (solvent.length < 2 || !humanSolvent)

  if (sessionOver) {
    const ranking = settledPlayers.map((p, i) => ({ p, i })).sort((a, b) => b.p.chips - a.p.chips)
    const me = humans.length === 1 ? settledPlayers[humans[0]] : null
    return (
      <Result
        title={me ? (me.chips >= ANTE ? `🏆 ${me.name} 싹쓸이!` : '💸 칩을 모두 잃었어요') : `🏆 ${ranking[0].p.name} 최종 승리!`}
        onAgain={onAgain}
      >
        <ol className="ranking">
          {ranking.map(({ p, i }) => (
            <li key={i}>
              {p.isAI ? '🤖 ' : ''}
              {p.name} — <strong>{p.chips}칩</strong>
            </li>
          ))}
        </ol>
        <p className="muted">칩이 없는 사람은 다시 하기를 누르면 {START_CHIPS}칩으로 채워져요.</p>
        <button className="btn ghost" onClick={onReset}>
          인원 바꾸기
        </button>
      </Result>
    )
  }

  // 누구의 패를 아래에 크게 보여줄지
  const viewer: number | null = !multiHuman
    ? (humans[0] ?? null)
    : betting && !current.isAI && revealed === turn
      ? turn
      : null
  const needCover = multiHuman && betting && !current.isAI && revealed !== turn
  const canSee = (i: number) => (phase === 'showdown' && session.settled ? !players[i].folded && players[i].inHand : i === viewer)

  const myTurn = betting && !current.isAI && viewer === turn

  return (
    <div className="seotda">
      {session.refilled.length > 0 && <div className="seotda-note">💰 {session.refilled.join(', ')}님 칩을 {START_CHIPS}개로 다시 채웠어요.</div>}
      <SeotdaTable
        table={table}
        names={players.map((p) => `${p.isAI ? '🤖 ' : ''}${p.name}`)}
        canSee={canSee}
        showHands={phase === 'showdown' && session.settled}
        winnings={session.winnings}
        thinking={(i) => players[i].isAI}
        status={
          phase === 'showdown'
            ? showdownText(table, players.map((p) => p.name))
            : current.isAI
              ? `🤖 ${current.name} 고민 중…`
              : `${current.name} 차례 · ${phase === 'bet1' ? '첫 장' : '두 장'} 베팅`
        }
      />

      {needCover ? (
        <div className="seotda-cover card-panel">
          <div className="seotda-cover-emoji">🙈</div>
          <h2>{current.name}님 차례</h2>
          <p className="muted">다른 사람이 패를 보지 않도록 화면을 넘겨주세요.</p>
          <button className="btn primary big" onClick={() => setRevealed(turn)}>
            내 패 보기
          </button>
        </div>
      ) : (
        viewer != null &&
        players[viewer].inHand && (
          <SeotdaHand cards={players[viewer].cards} name={players[viewer].name} folded={players[viewer].folded} />
        )
      )}

      {myTurn && <BetButtons table={table} seat={turn} onAct={act} />}

      {phase === 'showdown' && session.settled && (
        <button className="btn primary big" onClick={nextHand}>
          {redeal ? '🔄 재경기' : '다음 판'}
        </button>
      )}

      <SeotdaTools />
    </div>
  )
}
