import { useEffect, useState } from 'react'
import { sortCards, type Card } from '../../cards'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { PassCover } from '../poker-core/ui'
import {
  aiAction,
  aiWantsThankYou,
  applyHula,
  attach,
  attachTargets,
  bestPartition,
  canTakeDiscard,
  cardText,
  claimThankYou,
  discardCard,
  drawCard,
  handPoints,
  isGameOver,
  isValidMeld,
  newGame,
  nextRound,
  passThankYou,
  register,
  takeDiscard,
  topDiscard,
  type HulaState,
} from './logic'
import { Hand, HulaPlayers, HulaTable, RoundSummary } from './parts'
import './hula.css'

interface Session {
  id: number
  configs: PlayerConfig[]
  difficulty: Difficulty
  rounds: number
}

export default function Hula() {
  const [rounds, setRounds] = useStored('hula:rounds', 3)
  const [session, setSession] = useState<Session | null>(null)
  if (!session) {
    return (
      <PlayerSetup
        gameId="hula"
        min={2}
        max={4}
        defaultCount={3}
        showDifficulty
        onStart={(configs, difficulty) => setSession({ id: Date.now(), configs, difficulty, rounds })}
        extra={
          <div className="setup-row">
            <span>라운드</span>
            <div className="segmented">
              {[1, 3, 5].map((r) => (
                <button key={r} className={rounds === r ? 'active' : ''} onClick={() => setRounds(r)}>
                  {r}판
                </button>
              ))}
            </div>
          </div>
        }
      />
    )
  }
  return <Game key={session.id} session={session} onExit={() => setSession(null)} onAgain={() => setSession({ ...session, id: Date.now() })} />
}

function Game({ session, onExit, onAgain }: { session: Session; onExit: () => void; onAgain: () => void }) {
  const { difficulty } = session
  const [s, setS] = useState<HulaState>(() =>
    newGame(
      session.configs.map((c) => ({ name: c.name, isAI: c.isAI })),
      session.rounds,
      Math.floor(Math.random() * session.configs.length),
    ),
  )
  const [sel, setSel] = useState<string[]>([])
  const [bySuit, setBySuit] = useStored('hula:bySuit', true)
  const [revealed, setRevealed] = useState<number | null>(null)
  const [undo, setUndo] = useState<HulaState | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)

  const { players, phase } = s
  const n = players.length
  const active = phase === 'thankyou' ? s.thankQueue[0] : s.turn
  const activeP = players[active]
  const humans = players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0)
  const multiHuman = humans.length >= 2

  // 차례가 바뀌면 선택·되돌리기 초기화
  const turnKey = `${s.round}-${phase === 'thankyou' ? 't' : 'p'}-${active}`
  const [lastKey, setLastKey] = useState(turnKey)
  if (lastKey !== turnKey) {
    setLastKey(turnKey)
    setSel([])
    if (phase !== 'play') setUndo(null)
  }

  // AI 진행
  useEffect(() => {
    if (phase === 'roundEnd' || !activeP.isAI) return
    const snapshot = s
    const delay = phase === 'thankyou' ? 650 : phase === 'draw' ? 700 : 600
    const id = setTimeout(() => {
      setS((x) => {
        if (x !== snapshot) return x
        if (x.phase === 'thankyou') {
          const seat = x.thankQueue[0]
          return aiWantsThankYou(x, seat, difficulty) ? claimThankYou(x, seat) : passThankYou(x)
        }
        return applyHula(x, aiAction(x, difficulty))
      })
    }, delay)
    return () => clearTimeout(id)
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast])

  // ----- 게임 끝 -----
  if (isGameOver(s) && finished) {
    const ranking = players.map((p, i) => ({ p, i, sc: s.scores[i] })).sort((a, b) => a.sc - b.sc)
    const top = ranking.filter((r) => r.sc === ranking[0].sc)
    const me = humans.length === 1 ? humans[0] : null
    const title =
      top.length > 1
        ? `🤝 공동 우승: ${top.map((r) => r.p.name).join(', ')}`
        : me != null
          ? top[0].i === me
            ? '🏆 우승!'
            : `${ranking.findIndex((r) => r.i === me) + 1}위 — ${top[0].p.name} 우승`
          : `🏆 ${top[0].p.name} 우승!`
    return (
      <Result title={title} onAgain={onAgain}>
        <ol className="hula-ranking">
          {ranking.map(({ p, i, sc }) => (
            <li key={i}>
              {p.isAI ? '🤖 ' : ''}
              {p.name} — 벌점 <strong>{sc}</strong>
            </li>
          ))}
        </ol>
        <button className="btn ghost" onClick={onExit}>
          설정으로
        </button>
      </Result>
    )
  }

  // ----- 보는 사람 -----
  let viewer: number | null = null
  let coverFor: number | null = null
  if (!multiHuman) viewer = humans[0] ?? null
  else if (phase !== 'roundEnd' && !activeP.isAI) {
    if (revealed === active) viewer = active
    else coverFor = active
  }
  const myTurn = viewer != null && viewer === active && phase !== 'roundEnd'
  const hand = viewer != null ? s.hands[viewer] : []
  const shown = sortCards(hand, { bySuit })
  const selCards = sel.map((id) => hand.find((c) => c.id === id)).filter((c): c is Card => !!c)
  const canRegister = myTurn && phase === 'play' && selCards.length > 0 && isValidMeld(selCards)
  const canDiscard = myTurn && phase === 'play' && selCards.length === 1 && !s.mustUse
  const attachable = new Set(
    myTurn && phase === 'play' && selCards.length === 1 && s.registered[viewer!] ? attachTargets(s.melds, selCards[0]) : [],
  )
  const top = topDiscard(s)
  const hulaChance =
    myTurn && phase === 'play' && !s.registered[viewer!] && hand.length - bestPartition(hand).reduce((a, m) => a + m.length, 0) <= 1

  const toggle = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))

  const doTake = () => {
    if (!myTurn || phase !== 'draw') return
    if (!canTakeDiscard(s)) {
      setToast('버린 카드는 바로 등록·붙이기할 수 있을 때만 가져올 수 있어요')
      return
    }
    setUndo(s)
    setS(takeDiscard(s))
  }
  const doDraw = () => {
    if (!myTurn || phase !== 'draw') return
    setUndo(null)
    setS(drawCard(s))
  }
  const doRegister = () => {
    if (!canRegister) return
    setS(register(s, sel))
    setSel([])
    setUndo(null)
  }
  const doAttach = (meldId: number) => {
    if (!attachable.has(meldId)) return
    setS(attach(s, sel[0], meldId))
    setSel([])
    setUndo(null)
  }
  const doDiscard = () => {
    if (!canDiscard) return
    setS(discardCard(s, sel[0]))
    setSel([])
    setUndo(null)
  }

  const statusText = (() => {
    if (phase === 'roundEnd') return s.log[s.log.length - 1]
    if (phase === 'thankyou') return activeP.isAI ? `🤖 ${activeP.name}: 땡큐 할까…?` : `${activeP.name}님, 땡큐 하시겠어요?`
    if (activeP.isAI) return `🤖 ${activeP.name} 차례…`
    if (!myTurn) return `${activeP.name}님 차례`
    if (phase === 'draw') return '더미에서 뽑거나 버린 카드를 가져오세요'
    if (s.mustUse) return `가져온 ${cardText(hand.find((c) => c.id === s.mustUse)!)}를 꼭 등록하거나 붙이세요`
    return '등록·붙이기 후 카드 1장을 버리세요'
  })()

  return (
    <div className="hula">
      <HulaPlayers s={s} active={phase !== 'roundEnd' ? [active] : []} />

      <HulaTable s={s} canDraw={myTurn && phase === 'draw'} onDraw={doDraw} onTake={doTake} status={statusText} attachable={attachable} onAttach={doAttach} />

      {toast && <div className="hula-toast">{toast}</div>}

      {phase === 'roundEnd' ? (
        <RoundSummary s={s}>
          <button
            className="btn primary big"
            onClick={() => {
              if (isGameOver(s)) setFinished(true)
              else {
                setRevealed(null)
                setS(nextRound(s))
              }
            }}
          >
            {isGameOver(s) ? '최종 결과 보기' : '다음 라운드'}
          </button>
        </RoundSummary>
      ) : coverFor != null ? (
        <PassCover
          name={players[coverFor].name}
          hint={phase === 'thankyou' ? '땡큐 기회예요! 다른 사람이 손패를 보지 않도록 화면을 넘겨주세요.' : undefined}
          onReveal={() => setRevealed(coverFor)}
        />
      ) : (
        viewer != null && (
          <div className="hula-me card-panel">
            <div className="hula-me-head">
              <span>
                <strong>{players[viewer].name}</strong> <span className="muted">손패 {handPoints(hand)}점</span>
              </span>
              <button className="btn small ghost" onClick={() => setBySuit(!bySuit)}>
                {bySuit ? '숫자순' : '무늬순'} 정렬
              </button>
            </div>
            {hulaChance && <div className="hula-chance">🌺 지금 한 번에 다 내면 훌라!</div>}
            <Hand cards={shown} sel={sel} mustUse={s.mustUse} onTap={myTurn && phase === 'play' ? toggle : undefined} />
            {myTurn && phase === 'thankyou' && top && (
              <div className="hula-thank">
                <span>
                  방금 버린 <strong>{cardText(top)}</strong> 를 땡큐 할까요?
                </span>
                <div className="hula-buttons">
                  <button className="btn ghost" onClick={() => setS(passThankYou(s))}>
                    넘기기
                  </button>
                  <button
                    className="btn accent"
                    onClick={() => {
                      setUndo(s)
                      setS(claimThankYou(s, viewer!))
                    }}
                  >
                    땡큐!
                  </button>
                </div>
              </div>
            )}
            {myTurn && phase === 'play' && (
              <div className="hula-buttons">
                {undo && s.mustUse && (
                  <button
                    className="btn ghost"
                    onClick={() => {
                      setS(undo)
                      setUndo(null)
                    }}
                  >
                    되돌리기
                  </button>
                )}
                <button className="btn primary" disabled={!canRegister} onClick={doRegister}>
                  등록
                </button>
                <button className="btn accent" disabled={!canDiscard} onClick={doDiscard}>
                  버리기
                </button>
              </div>
            )}
            {myTurn && phase === 'play' && selCards.length === 1 && attachable.size > 0 && (
              <p className="hula-hint">빛나는 등록 카드를 누르면 붙일 수 있어요</p>
            )}
            {myTurn && phase === 'play' && selCards.length === 1 && !s.registered[viewer] && (
              <p className="hula-hint muted">붙이기는 한 번 등록한 뒤에 할 수 있어요</p>
            )}
          </div>
        )
      )}
      <p className="muted hula-foot">{n}명 · 덱이 떨어지면 스톱</p>
    </div>
  )
}
