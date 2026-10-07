import { useEffect, useMemo, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { HwatuStyleToggle } from '../../hwatu'
import { sleep } from '../../lib/random'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  MODES,
  WON_PER_POINT,
  aiStep,
  advance,
  canBomb,
  canShake,
  choose,
  clone,
  decideGo,
  finishWin,
  matchesOnFloor,
  newRound,
  play,
  type GState,
  type Mode,
  type PlayAction,
  type RoundResult,
} from './logic'
import { GoStopPanel, GostopTable, HandPanel, PlayerPanel, RoundBreakdown, moneyDelta, won, type Toast } from './parts'
import './gostop.css'

export { moneyDelta, won }

type Wallet = Record<string, number>
/** 맞고·고스톱이 함께 쓰는 가상 머니 지갑 */
export const WALLET_KEY = 'gostop:money'

interface Session {
  players: PlayerConfig[]
  difficulty: Difficulty
  round: number
  first: number
  nagariMult: number
}

export function GostopGame({ mode }: { mode: Mode }) {
  const cfg = MODES[mode]
  const [session, setSession] = useState<Session | null>(null)
  const [wallet, setWallet] = useStored<Wallet>(WALLET_KEY, {})

  if (!session) {
    const saved = Object.entries(wallet).sort((a, b) => b[1] - a[1])
    return (
      <PlayerSetup
        gameId={mode}
        min={cfg.players}
        max={cfg.players}
        showDifficulty
        onStart={(players, difficulty) =>
          setSession({ players, difficulty, round: 1, first: Math.floor(Math.random() * players.length), nagariMult: 1 })
        }
        extra={
          <>
          <HwatuStyleToggle />
          <div className="gostop-wallet">
            <div className="gostop-wallet-head">
              <span>💰 누적 손익 (가상 머니 · 점당 {WON_PER_POINT}원)</span>
              {saved.length > 0 && (
                <button className="btn small ghost" onClick={() => setWallet({})}>
                  초기화
                </button>
              )}
            </div>
            {saved.length === 0 ? (
              <p className="muted gostop-wallet-empty">아직 기록이 없어요. 진짜 돈은 오가지 않아요!</p>
            ) : (
              <ul className="gostop-wallet-list">
                {saved.map(([name, v]) => (
                  <li key={name}>
                    <span>{name}</span>
                    <strong className={v >= 0 ? 'plus' : 'minus'}>{won(v)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </>
        }
      />
    )
  }
  return (
    <Game
      key={session.round}
      mode={mode}
      session={session}
      wallet={wallet}
      setWallet={setWallet}
      onNext={(r) =>
        setSession({
          ...session,
          round: session.round + 1,
          first: r.winner ?? session.first,
          nagariMult: r.kind === 'nagari' ? r.nextMult : 1,
        })
      }
      onReset={() => setSession(null)}
    />
  )
}

const DELAY: Record<string, number> = { play: 850, chooseHand: 650, chooseFlip: 650, flip: 600, resolve: 700, goStop: 900 }

function Game({
  mode,
  session,
  wallet,
  setWallet,
  onNext,
  onReset,
}: {
  mode: Mode
  session: Session
  wallet: Wallet
  setWallet: (v: Wallet | ((p: Wallet) => Wallet)) => void
  onNext: (r: RoundResult) => void
  onReset: () => void
}) {
  const [s, setS] = useState<GState>(() => newRound(session.players, mode, { first: session.first, nagariMult: session.nagariMult }))
  const [selected, setSelected] = useState<number | null>(null)
  const [revealed, setRevealed] = useState<number | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [showResult, setShowResult] = useState(false)
  const busy = useRef(false)
  const alive = useRef(true)
  const settled = useRef(false)
  const toastId = useRef(0)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const { players, turn, phase } = s
  const current = players[turn]
  const humans = players.map((_, i) => i).filter((i) => !players[i].isAI)
  const multiHuman = humans.length >= 2
  const over = phase.kind === 'over'

  // 자동 진행: 뒤집기·정리, AI 차례
  useEffect(() => {
    if (over || busy.current) return
    const k = phase.kind
    const auto = k === 'flip' || k === 'resolve' || current.isAI
    if (!auto) return
    busy.current = true
    ;(async () => {
      await sleep(DELAY[k] ?? 700)
      busy.current = false
      if (!alive.current) return
      setS((st) => {
        if (st !== s) return st
        return st.phase.kind === 'flip' || st.phase.kind === 'resolve' ? advance(st) : aiStep(st, session.difficulty)
      })
    })()
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps

  // 사건 토스트
  useEffect(() => {
    if (!s.events.length) return
    const add = s.events.map((e) => ({ id: ++toastId.current, text: e.text, type: e.type, who: players[e.player].name }))
    setToasts((t) => [...t, ...add].slice(-4))
    const ids = add.map((a) => a.id)
    setTimeout(() => alive.current && setToasts((t) => t.filter((x) => !ids.includes(x.id))), 1900)
  }, [s.eventSeq]) // eslint-disable-line react-hooks/exhaustive-deps

  // 판이 끝나면 정산 (한 번만)
  useEffect(() => {
    if (!over || settled.current) return
    settled.current = true
    const r = s.result!
    const delta = moneyDelta(r, players.length)
    setWallet((w) => {
      const next = { ...w }
      players.forEach((p, i) => {
        if (delta[i]) next[p.name] = (next[p.name] ?? 0) + delta[i]
      })
      return next
    })
    const t = setTimeout(() => alive.current && setShowResult(true), r.kind === 'chongtong' ? 900 : 1500)
    return () => clearTimeout(t)
  }, [over]) // eslint-disable-line react-hooks/exhaustive-deps

  // 차례가 바뀌면 선택 해제 / 가림막
  useEffect(() => {
    setSelected(null)
    if (multiHuman && revealed !== turn) setRevealed(null)
  }, [turn]) // eslint-disable-line react-hooks/exhaustive-deps

  const viewer = !multiHuman ? (humans[0] ?? null) : !current.isAI && revealed === turn ? turn : null
  const needCover = !over && multiHuman && !current.isAI && revealed !== turn
  const myTurn = !over && viewer === turn && !current.isAI
  const me = viewer != null ? players[viewer] : null

  const stopPreview = useMemo(() => {
    if (phase.kind !== 'goStop') return null
    const r = finishWin(clone(s), s.turn).result!
    return r.payments.reduce((a, p) => a + p.points, 0)
  }, [s, phase.kind])

  if (over && showResult) {
    return <RoundEnd s={s} viewer={humans.length === 1 ? humans[0] : null} wallet={wallet} onNext={() => onNext(s.result!)} onReset={onReset} />
  }

  const doPlay = (a: PlayAction) => {
    setSelected(null)
    setS((st) => play(st, a))
  }
  const canPlay = myTurn && phase.kind === 'play'
  const choosing = myTurn && (phase.kind === 'chooseHand' || phase.kind === 'chooseFlip') ? phase.options : []
  const selMatches = selected != null && me?.hand.includes(selected) ? matchesOnFloor(s, selected) : []

  const onHand = (id: number) => {
    if (!canPlay) return
    if (selected === id && !canBomb(s, id) && !canShake(s, id)) doPlay({ type: 'card', card: id })
    else setSelected(id)
  }
  const onFloor = (id: number) => {
    if (choosing.includes(id)) setS((st) => choose(st, id))
    else if (canPlay && selected != null && selMatches.includes(id)) doPlay({ type: 'card', card: selected })
  }

  // 상태 문구
  let status: string
  if (over) status = s.result?.kind === 'nagari' ? '나가리!' : `${players[s.result!.winner!].name} 승리!`
  else if (phase.kind === 'goStop') status = myTurn ? `${phase.score}점! 고 할까요, 스톱 할까요?` : `🤖 ${current.name} 고민 중… (${phase.score}점)`
  else if (phase.kind === 'chooseHand' || phase.kind === 'chooseFlip')
    status = myTurn ? '같은 달이 두 장! 가져올 카드를 누르세요' : `${current.isAI ? '🤖 ' : ''}${current.name} 고르는 중…`
  else if (phase.kind === 'flip') status = '더미에서 한 장 뒤집는 중…'
  else if (phase.kind === 'resolve') status = '…'
  else if (current.isAI) status = `🤖 ${current.name} 차례…`
  else if (myTurn)
    status = selected != null ? (selMatches.length ? '한 번 더 누르거나 빛나는 바닥 카드를 누르세요' : '짝이 없어요. 한 번 더 누르면 바닥에 내려놔요') : '낼 카드를 고르세요'
  else status = `${current.name} 차례`

  const opponents = players.map((p, i) => ({ p, i })).filter(({ i }) => i !== viewer)
  const pendingOptions = (phase.kind === 'chooseHand' || phase.kind === 'chooseFlip') ? phase.options : []

  return (
    <div className={`gostop gostop-${mode}`}>
      <div className="gostop-opps">
        {opponents.map(({ p, i }) => (
          <PlayerPanel key={i} p={p} active={i === turn && !over} threshold={s.cfg.threshold} compact defaultOpen={players.length === 2} />
        ))}
      </div>

      <GostopTable
        s={s}
        deckCount={s.deck.length}
        message={s.message}
        toasts={toasts}
        highlight={[...choosing, ...selMatches, ...(myTurn ? [] : pendingOptions)]}
        clickable={[...choosing, ...(canPlay ? selMatches : [])]}
        onPick={onFloor}
      />

      <div className="status gostop-status">{status}</div>

      {myTurn && phase.kind === 'goStop' && (
        <GoStopPanel score={phase.score} goCount={current.goCount} stopPreview={stopPreview} onDecide={(go) => setS((st) => decideGo(st, go))} />
      )}

      {needCover ? (
        <div className="gostop-cover card-panel">
          <div className="gostop-cover-emoji">🙈</div>
          <h2>{current.name}님 차례</h2>
          <p className="muted">다른 사람이 패를 보지 않도록 화면을 넘겨주세요.</p>
          <button className="btn primary big" onClick={() => setRevealed(turn)}>
            내 패 보기
          </button>
        </div>
      ) : (
        me &&
        viewer != null && (
          <>
            <PlayerPanel p={me} active={viewer === turn && !over} threshold={s.cfg.threshold} mine />
            <HandPanel s={s} me={me} canPlay={canPlay} selected={selected} onHand={onHand} onPlay={doPlay} />
          </>
        )
      )}
    </div>
  )
}

function RoundEnd({
  s,
  viewer,
  wallet,
  onNext,
  onReset,
}: {
  s: GState
  viewer: number | null
  wallet: Wallet
  onNext: () => void
  onReset: () => void
}) {
  const r = s.result!
  const { players } = s
  const delta = moneyDelta(r, players.length)
  let title: string
  if (r.kind === 'nagari') title = '🤝 나가리!'
  else if (viewer != null) title = r.winner === viewer ? `🎉 승리! ${won(delta[viewer])}` : `😢 ${players[r.winner!].name} 승리`
  else title = `🏆 ${players[r.winner!].name} 승리!`
  return (
    <Result title={title} onAgain={onNext} againLabel={r.kind === 'nagari' ? `다음 판 (판돈 ×${r.nextMult})` : '다음 판'}>
      <RoundBreakdown r={r} mode={s.mode} names={players.map((p) => `${p.isAI ? '🤖 ' : ''}${p.name}`)} />
      <ul className="gostop-wallet-list gostop-wallet-now">
        {players.map((p, i) => (
          <li key={i}>
            <span>
              {p.isAI ? '🤖 ' : ''}
              {p.name}
              {delta[i] !== 0 && <small className={delta[i] > 0 ? 'plus' : 'minus'}> {won(delta[i])}</small>}
            </span>
            <strong className={(wallet[p.name] ?? 0) >= 0 ? 'plus' : 'minus'}>{won(wallet[p.name] ?? 0)}</strong>
          </li>
        ))}
      </ul>
      <button className="btn ghost" onClick={onReset}>
        처음으로
      </button>
    </Result>
  )
}
