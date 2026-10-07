import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { sleep } from '../../lib/random'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  aiShouldTake,
  canPass,
  cardPoints,
  isOver,
  marginalCost,
  newGame,
  pass,
  runs,
  scores,
  take,
  type NTState,
} from './logic'
import './no-thanks.css'

interface Game {
  players: PlayerConfig[]
  difficulty: Difficulty
}

export default function NoThanks() {
  const [game, setGame] = useState<Game | null>(null)
  const [round, setRound] = useState(0)
  if (!game) {
    return (
      <PlayerSetup
        gameId="no-thanks"
        min={3}
        max={7}
        defaultCount={4}
        showDifficulty
        onStart={(players, difficulty) => setGame({ players, difficulty })}
      />
    )
  }
  return <Table key={round} game={game} onAgain={() => setRound((r) => r + 1)} onReset={() => setGame(null)} />
}

interface Log {
  who: number
  kind: 'pass' | 'take'
  card: number
  pot: number
}

function Table({ game, onAgain, onReset }: { game: Game; onAgain: () => void; onReset: () => void }) {
  const { players, difficulty } = game
  const [s, setS] = useState<NTState>(() => newGame(players.length))
  const [log, setLog] = useState<Log | null>(null)
  const [flipKey, setFlipKey] = useState(0)
  const [step, setStep] = useState(0)
  const aiRunning = useRef(false)
  const alive = useRef(true)
  const over = isOver(s)
  const current = players[s.turn]

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const act = (kind: 'pass' | 'take') => {
    if (s.card == null) return
    setLog({ who: s.turn, kind, card: s.card, pot: s.pot })
    if (kind === 'take') setFlipKey((k) => k + 1)
    setStep((n) => n + 1)
    setS(kind === 'take' ? take(s) : pass(s))
  }

  // AI turns: re-run after every action.
  useEffect(() => {
    if (over || !current.isAI || aiRunning.current) return
    aiRunning.current = true
    ;(async () => {
      await sleep(log?.kind === 'take' ? 1100 : 800)
      aiRunning.current = false
      if (!alive.current) return
      act(aiShouldTake(s, difficulty) ? 'take' : 'pass')
    })()
  }, [step, over]) // eslint-disable-line react-hooks/exhaustive-deps

  const sc = scores(s)
  const humanTurn = !over && !current.isAI

  if (over) {
    const ranking = players.map((p, i) => ({ p, i, t: sc[i] })).sort((a, b) => a.t - b.t)
    const winners = ranking.filter((r) => r.t === ranking[0].t)
    return (
      <>
        <Result
          title={
            winners.length > 1
              ? `🤝 ${winners.map((w) => w.p.name).join(', ')} 공동 우승!`
              : `🏆 ${winners[0].p.name} 승리!`
          }
          onAgain={onAgain}
        >
          <p className="muted">점수가 낮을수록 좋아요</p>
          <ol className="nt-ranking">
            {ranking.map(({ p, i, t }) => (
              <li key={i}>
                {p.isAI ? '🤖 ' : ''}
                {p.name} — <strong>{t}점</strong>{' '}
                <small className="muted">
                  (카드 {cardPoints(s.hands[i])} − 칩 {s.chips[i]})
                </small>
              </li>
            ))}
          </ol>
          <button className="btn ghost" onClick={onReset}>
            인원 바꾸기
          </button>
        </Result>
        <Seats players={players} s={s} sc={sc} over />
      </>
    )
  }

  const card = s.card as number
  const myCost = marginalCost(s.hands[s.turn], card)
  return (
    <>
      <div className="nt-table felt">
        <div className="status">
          {current.isAI ? `🤖 ${current.name} 고민 중…` : `${current.name} 차례`}
        </div>
        <div className="nt-center">
          <div className="nt-deck" aria-label={`남은 카드 ${s.deck.length}장`}>
            <span className="nt-deck-card" />
            <span className="nt-deck-count">{s.deck.length}</span>
          </div>
          <div key={flipKey} className="nt-offer">
            <NumberCard value={card} big />
          </div>
          <div className="nt-pot" aria-label={`칩 ${s.pot}개`}>
            <ChipStack n={s.pot} />
            <span className="nt-pot-count">🪙 {s.pot}</span>
          </div>
        </div>
        <div className="nt-log">
          {log ? (
            log.kind === 'pass' ? (
              <span>
                {players[log.who].name}: <strong>노 땡큐!</strong> 🙅
              </span>
            ) : (
              <span>
                {players[log.who].name} → <strong>{log.card}</strong> 가져감 (+🪙{log.pot})
              </span>
            )
          ) : (
            <span>첫 카드가 나왔어요!</span>
          )}
        </div>
        {humanTurn && (
          <>
            <p className="nt-hint">
              가져가면 카드 점수 +{myCost}
              {s.pot > 0 ? `, 칩 +${s.pot}` : ''} → 순 {myCost - s.pot >= 0 ? '+' : ''}
              {myCost - s.pot}점
            </p>
            <div className="nt-actions">
              <button className="btn accent big" disabled={!canPass(s)} onClick={() => act('pass')}>
                🙅 노 땡큐 <small>(칩 1개)</small>
              </button>
              <button className="btn primary big" onClick={() => act('take')}>
                ✋ 가져가기
              </button>
            </div>
            {!canPass(s) && <p className="nt-hint">칩이 없어서 가져가야 해요!</p>}
          </>
        )}
      </div>
      <Seats players={players} s={s} sc={sc} />
      <p className="nt-removed muted">빠진 카드 9장은 끝날 때까지 비밀이에요 🤫</p>
    </>
  )
}

function Seats({ players, s, sc, over }: { players: PlayerConfig[]; s: NTState; sc: number[]; over?: boolean }) {
  return (
    <>
      <ul className="nt-seats">
        {players.map((p, i) => (
          <li key={i} className={`nt-seat ${!over && i === s.turn ? 'active' : ''}`} style={{ ['--pc' as string]: `var(--p${(i % 6) + 1})` }}>
            <div className="nt-seat-head">
              <span className="nt-name">
                {p.isAI ? '🤖 ' : ''}
                {p.name}
              </span>
              <span className="nt-chips">🪙 {s.chips[i]}</span>
              <span className="nt-score">{sc[i]}점</span>
            </div>
            <div className="nt-hand">
              {s.hands[i].length === 0 && <span className="muted nt-empty">아직 카드 없음</span>}
              {runs(s.hands[i]).map((r) => (
                <span key={r[0]} className="nt-run">
                  {r.map((c, j) => (
                    <NumberCard key={c} value={c} dim={j > 0} />
                  ))}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {over && (
        <p className="nt-removed muted">
          빠졌던 카드: {s.removed.join(', ')}
        </p>
      )}
    </>
  )
}

function NumberCard({ value, big, dim }: { value: number; big?: boolean; dim?: boolean }) {
  const hue = Math.round(((value - 3) / 32) * 300)
  return (
    <span
      className={`nt-card ${big ? 'big' : ''} ${dim ? 'dim' : ''}`}
      style={{ ['--hue' as string]: hue }}
    >
      {value}
    </span>
  )
}

function ChipStack({ n }: { n: number }) {
  const shown = Math.min(n, 12)
  return (
    <span className="nt-chipstack">
      {Array.from({ length: shown }, (_, i) => (
        <i key={i} className="nt-chip" style={{ bottom: i * 4, left: (i % 2) * 3 }} />
      ))}
    </span>
  )
}
