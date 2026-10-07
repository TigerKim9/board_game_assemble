import { useEffect, useState } from 'react'
import { Die } from '../../components/Die'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  aiAction,
  challenge,
  countMatching,
  currentBid,
  facesFor,
  isHigher,
  minRaise,
  newLiar,
  nextRound,
  placeBid,
  totalDice,
  type Bid,
  type LiarState,
} from './logic'
import './liars-dice.css'

interface Setup {
  players: PlayerConfig[]
  difficulty: Difficulty
  wild: boolean
}

export default function LiarsDice() {
  const [setup, setSetup] = useState<Setup | null>(null)
  const [round, setRound] = useState(0)
  const [wild, setWild] = useStored('liars-dice:wild', true)
  if (!setup) {
    return (
      <PlayerSetup
        gameId="liars-dice"
        min={2}
        max={6}
        defaultCount={4}
        showDifficulty
        extra={
          <label className="setup-row ld-option">
            <span>1은 만능(와일드)</span>
            <input type="checkbox" checked={wild} onChange={(e) => setWild(e.target.checked)} />
          </label>
        }
        onStart={(players, difficulty) => setSetup({ players, difficulty, wild })}
      />
    )
  }
  return <Board key={round} setup={setup} onAgain={() => setRound((r) => r + 1)} onReset={() => setSetup(null)} />
}

function BidView({ bid, size = 30 }: { bid: Bid; size?: number }) {
  return (
    <span className="ld-bid">
      <strong>{bid.qty}</strong>
      <span className="ld-x">×</span>
      <Die value={bid.face} size={size} />
    </span>
  )
}

function Board({ setup, onAgain, onReset }: { setup: Setup; onAgain: () => void; onReset: () => void }) {
  const [s, setS] = useState<LiarState>(() => newLiar(setup.players, setup.wild))
  /** Which human has dismissed the cover screen for the current turn. */
  const [seenBy, setSeenBy] = useState<number | null>(null)
  const humans = s.players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0)
  const multiHuman = humans.length >= 2
  const current = s.players[s.turn]
  const cur = currentBid(s)
  const total = totalDice(s)
  const [draft, setDraft] = useState<Bid>(() => minRaise(null, setup.wild))
  const humansAlive = humans.some((i) => s.hands[i].length > 0)

  // Reset the bid draft to the minimal raise whenever a new turn begins.
  useEffect(() => {
    setDraft(minRaise(cur?.bid ?? null, s.wild))
  }, [s.turn, s.bids.length, s.round]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    if (s.phase === 'bid' && current.isAI) {
      const act = aiAction(s.hands[s.turn], total, cur?.bid ?? null, s.wild, setup.difficulty)
      t = setTimeout(() => setS((p) => (act.type === 'challenge' ? challenge(p) : placeBid(p, act.bid))), 1200)
    } else if (s.phase === 'reveal' && !humansAlive) {
      t = setTimeout(() => setS((p) => nextRound(p)), 3500)
    }
    return () => clearTimeout(t)
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps

  if (s.phase === 'over' && s.winner != null) {
    const w = s.players[s.winner]
    return (
      <Result title={w.isAI ? `🤖 ${w.name} 승리!` : `🏆 ${w.name} 승리!`} onAgain={onAgain}>
        <p>마지막까지 주사위를 지킨 사람이 이겼어요. ({s.round - 1}라운드)</p>
        <button className="btn ghost" onClick={onReset}>
          인원 바꾸기
        </button>
      </Result>
    )
  }

  const humanTurn = !current.isAI && s.phase === 'bid'
  const needCover = multiHuman && humanTurn && seenBy !== s.turn

  // Whose dice may be shown face up right now?
  let viewer: number | null = null
  if (!multiHuman && humans.length === 1 && s.hands[humans[0]].length > 0) viewer = humans[0]
  if (multiHuman && humanTurn && seenBy === s.turn) viewer = s.turn

  if (needCover) {
    return (
      <div className="ld-cover card-panel">
        <div className="ld-cover-emoji">🙈</div>
        <h2>{current.name}님 차례</h2>
        <p className="muted">화면을 {current.name}님에게 넘겨주세요. 다른 사람은 보지 마세요!</p>
        {cur && (
          <p>
            현재 베팅: {s.players[cur.player].name} — <BidView bid={cur.bid} size={24} />
          </p>
        )}
        <button className="btn primary big" onClick={() => setSeenBy(s.turn)}>
          제가 {current.name}이에요, 주사위 보기
        </button>
      </div>
    )
  }

  const rv = s.reveal
  const faces = facesFor(s.wild)
  const draftValid = isHigher(draft, cur?.bid ?? null) && draft.qty <= total
  const setFace = (f: number) => {
    let qty = draft.qty
    while (!isHigher({ qty, face: f }, cur?.bid ?? null)) qty++
    setDraft({ qty: Math.min(qty, total), face: f })
  }

  return (
    <>
      <ul className="ld-players">
        {s.players.map((p, i) => (
          <li
            key={i}
            className={`ld-player ${i === s.turn && s.phase === 'bid' ? 'active' : ''} ${s.hands[i].length === 0 ? 'out' : ''} ${rv?.loser === i ? 'loser' : ''}`}
            style={{ '--c': `var(--p${(i % 6) + 1})` } as React.CSSProperties}
          >
            <span className="ld-pname">
              {p.isAI ? '🤖 ' : ''}
              {p.name}
            </span>
            <span className="ld-count">{s.hands[i].length > 0 ? `🎲×${s.hands[i].length}` : '탈락'}</span>
          </li>
        ))}
      </ul>

      <div className="ld-table felt">
        <div className="status">
          {s.phase === 'reveal' && rv
            ? `${s.players[rv.challenger].name}: "거짓말!"`
            : current.isAI
              ? `🤖 ${current.name} 고민 중…`
              : `${current.name} 차례`}
          <div className="ld-sub">
            {s.round}라운드 · 전체 주사위 {total}개{s.wild ? ' · 1은 만능' : ''}
          </div>
        </div>

        <div className="ld-current">
          {cur ? (
            <>
              <span className="ld-current-label">{s.players[cur.player].name}의 베팅</span>
              <BidView bid={cur.bid} size={44} />
              <span className="ld-current-hint">"전체에 {cur.bid.face}{s.wild ? '(또는 1)' : ''}이 {cur.bid.qty}개 이상 있다"</span>
            </>
          ) : (
            <span className="ld-current-label">{current.name}님이 첫 베팅을 해요</span>
          )}
        </div>

        {s.phase === 'reveal' && rv ? (
          <div className="ld-reveal">
            <p className="ld-reveal-result">
              실제로 <strong>{rv.actual}개</strong> → {rv.actual >= rv.bid.qty ? '베팅이 맞았어요!' : '거짓말이었어요!'}
              <br />
              <strong>{s.players[rv.loser].name}</strong>님이 주사위 하나를 잃어요
              {s.hands[rv.loser].length === 1 && ' (탈락!)'}
            </p>
            <ul className="ld-reveal-list">
              {s.players.map((p, i) =>
                s.hands[i].length === 0 ? null : (
                  <li key={i}>
                    <span className="ld-reveal-name">{p.name}</span>
                    <span className="ld-reveal-dice">
                      {s.hands[i].map((d, j) => {
                        const hit = countMatching([d], rv.bid.face, s.wild) > 0
                        return (
                          <span key={j} className={hit ? 'hit' : 'miss'}>
                            <Die value={d} size={30} />
                          </span>
                        )
                      })}
                    </span>
                  </li>
                ),
              )}
            </ul>
            <button className="btn primary big" onClick={() => {
              setSeenBy(null)
              setS((p) => nextRound(p))
            }}>
              다음 라운드
            </button>
          </div>
        ) : (
          <>
            <div className="ld-mine">
              <span className="ld-mine-label">
                {viewer != null ? (viewer === s.turn || !multiHuman ? '내 주사위' : `${s.players[viewer].name}의 주사위`) : '주사위는 컵 속에…'}
              </span>
              <div className="ld-mine-dice">
                {viewer != null
                  ? s.hands[viewer].map((d, i) => <Die key={i} value={d} size={44} />)
                  : Array.from({ length: Math.max(1, humanTurn ? s.hands[s.turn].length : 3) }, (_, i) => (
                      <span key={i} className="ld-cup">🥤</span>
                    ))}
              </div>
            </div>

            {humanTurn && (
              <div className="ld-controls">
                <div className="ld-qty">
                  <button className="btn" onClick={() => setDraft((d) => ({ ...d, qty: Math.max(1, d.qty - 1) }))} disabled={draft.qty <= 1}>
                    −
                  </button>
                  <span>
                    <strong>{draft.qty}</strong>개
                  </span>
                  <button className="btn" onClick={() => setDraft((d) => ({ ...d, qty: Math.min(total, d.qty + 1) }))} disabled={draft.qty >= total}>
                    +
                  </button>
                </div>
                <div className="ld-faces">
                  {faces.map((f) => (
                    <Die key={f} value={f} size={40} held={draft.face === f} onClick={() => setFace(f)} />
                  ))}
                </div>
                <div className="ld-actions">
                  <button className="btn accent big" disabled={!draftValid} onClick={() => setS((p) => placeBid(p, draft))}>
                    베팅: {draft.qty}×{draft.face}
                  </button>
                  <button className="btn danger big" disabled={!cur} onClick={() => setS(challenge)}>
                    거짓말!
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {s.bids.length > 0 && s.phase === 'bid' && (
        <ol className="ld-log card-panel">
          {s.bids
            .slice(-6)
            .reverse()
            .map((b, i) => (
              <li key={s.bids.length - i}>
                <span>{s.players[b.player].name}</span>
                <BidView bid={b.bid} size={22} />
              </li>
            ))}
        </ol>
      )}
    </>
  )
}
