import { useEffect, useMemo, useState } from 'react'
import { sortCards } from '../../cards'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { OneCardCenter, SuitPicker } from './Center'
import { HandFan, PassCover, Seats, Toasts, type SeatInfo } from './kit'
import { useHotSeat, useKeyedState } from './kitHooks'
import {
  BUST_LIMIT,
  aiCatches,
  aiMove,
  canPlay,
  catchOne,
  declare,
  drawTurn,
  isActive,
  newGame,
  play,
  ranking,
  top,
  type OCState,
} from './logic'
import './onecard.css'

interface Config {
  players: PlayerConfig[]
  difficulty: Difficulty
}

export default function OneCard() {
  const [cfg, setCfg] = useState<Config | null>(null)
  if (!cfg) {
    return (
      <PlayerSetup
        gameId="onecard"
        min={2}
        max={6}
        defaultCount={4}
        showDifficulty
        onStart={(players, difficulty) => setCfg({ players, difficulty })}
      />
    )
  }
  return <Game key={JSON.stringify(cfg)} cfg={cfg} onExit={() => setCfg(null)} />
}

const start = (players: PlayerConfig[]) =>
  newGame(
    players.map((p) => p.name),
    players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0),
  )

function Game({ cfg, onExit }: { cfg: Config; onExit: () => void }) {
  const { players, difficulty } = cfg
  const [s, setS] = useState<OCState>(() => start(players))
  const hs = useHotSeat(players, s.over ? null : s.turn)
  const humans = players.filter((p) => !p.isAI).length
  const me = hs.shown
  const actorIsHuman = !s.over && !players[s.turn].isAI
  const selKey = String(s.log[s.log.length - 1]?.id ?? 0)
  const [sel, setSel] = useKeyedState<string | null>(null, selKey)
  const [pick7, setPick7] = useKeyedState<string | null>(null, selKey)

  // AI turns (and AI "원카드" calls). The timer is cleared on every state change / unmount.
  useEffect(() => {
    if (s.over) return
    const p = s.turn
    const v = s.vulnerable
    if (!players[p].isAI) {
      // A forgetful AI sitting on one card: other AIs may call it while a human is thinking.
      if (v === null || !players[v].isAI) return
      const id = setTimeout(() => {
        const callers = players.map((_, i) => i).filter((i) => i !== v && players[i].isAI && isActive(s, i))
        for (const c of callers) if (aiCatches(s, c, difficulty)) return setS(catchOne(s, c))
      }, 2600)
      return () => clearTimeout(id)
    }
    const humanVulnerable = v !== null && !players[v].isAI
    const delay = humanVulnerable ? 2000 : 750 + Math.random() * 400
    const id = setTimeout(() => {
      if (v !== null && v !== p && aiCatches(s, p, difficulty)) return setS(catchOne(s, p))
      const m = aiMove(s, p, difficulty)
      setS(m.type === 'draw' ? drawTurn(s, p) : play(s, p, m.cardId, m.suit, m.declare))
    }, delay)
    return () => clearTimeout(id)
  }, [s, players, difficulty])

  const myTurn = me !== null && actorIsHuman && s.turn === me && !hs.cover
  const myHand = useMemo(
    () => (me === null ? [] : sortCards(s.hands[me], { suitOrder: ['S', 'H', 'C', 'D'] })),
    [s.hands, me],
  )
  const playable = (cid: string) => {
    const c = myHand.find((x) => x.id === cid)
    return !!c && myTurn && canPlay(s, c)
  }
  const hasLegal = myTurn && myHand.some((c) => canPlay(s, c))

  const doPlay = (cid: string) => {
    if (!myTurn || me === null) return
    const c = myHand.find((x) => x.id === cid)
    if (!c || !canPlay(s, c)) return
    if (c.rank === 7) {
      setPick7(cid)
      return
    }
    setS(play(s, me, cid))
  }

  const t = top(s)
  const curName = players[s.turn].name

  // "원카드" buttons
  const v = s.vulnerable
  const humanVulnerable = v !== null && !players[v].isAI && !s.over
  const canPredeclare = myTurn && me !== null && s.hands[me].length === 2 && !s.predeclared[me]
  const catcher =
    v !== null && !s.over
      ? actorIsHuman && s.turn !== v
        ? s.turn
        : players.findIndex((p, i) => !p.isAI && i !== v && isActive(s, i))
      : -1
  const showCatch = v !== null && !s.over && catcher >= 0 && (players[v].isAI || humans >= 2)

  if (s.over) {
    const order = ranking(s)
    const solo = humans === 1 ? players.findIndex((p) => !p.isAI) : -1
    const place = solo >= 0 ? order.indexOf(solo) + 1 : 0
    const title =
      solo >= 0
        ? s.busted.includes(solo)
          ? '💥 파산했어요…'
          : place === 1
            ? '🎉 1등! 원카드 왕!'
            : `${place}등!`
        : `🏆 ${players[order[0]].name} 1등!`
    return (
      <div className="onecard">
        <Result title={title} onAgain={() => setS(start(players))}>
          <ol className="onecard-rank">
            {order.map((p, i) => (
              <li key={p}>
                <strong>{i + 1}등</strong> {players[p].isAI ? '🤖' : '🙂'} {players[p].name}
                <span className="muted">
                  {s.done.includes(p) ? ' — 탈출' : s.busted.includes(p) ? ' — 파산' : ` — ${s.hands[p].length}장 남음`}
                </span>
              </li>
            ))}
          </ol>
          <button className="btn ghost" onClick={onExit}>
            인원 바꾸기
          </button>
        </Result>
      </div>
    )
  }

  const order = Array.from({ length: players.length }, (_, k) => ((me ?? -1) + 1 + k) % players.length).filter(
    (i) => i !== me,
  )
  const seats: SeatInfo[] = order.map((i) => ({
    index: i,
    name: players[i].name,
    isAI: players[i].isAI,
    count: s.hands[i].length,
    active: s.turn === i,
    out: !isActive(s, i),
    badge: s.done.includes(i)
      ? `${s.done.indexOf(i) + 1}등`
      : s.busted.includes(i)
        ? '파산'
        : s.hands[i].length === 1
          ? '☝️ 1장'
          : undefined,
  }))

  let status: string
  if (players[s.turn].isAI) status = `🤖 ${curName} 생각 중…`
  else if (!myTurn) status = `${curName} 차례`
  else if (s.attack > 0) status = hasLegal ? `⚔️ +${s.attack} 공격! 막거나 받으세요` : `⚔️ +${s.attack} 공격! 막을 카드가 없어요`
  else status = hasLegal ? `${curName} 차례 — 카드를 고르세요` : '낼 카드가 없어요 — 한 장 뽑으세요'

  return (
    <div className="onecard">
      {hs.cover && <PassCover name={hs.coverName} onReady={hs.reveal} />}
      <Seats seats={seats} />
      <div className="onecard-table felt">
        <Toasts log={s.log} />
        <OneCardCenter
          top={t}
          pileCount={s.pile.length}
          suit={s.suit}
          dir={s.dir}
          attack={s.attack}
          flip={s.last?.kind === 'play'}
        />
        <div className={`status onecard-status ${myTurn ? 'mine' : ''}`}>{status}</div>
        {(humanVulnerable || showCatch) && (
          <div className="onecard-calls">
            {humanVulnerable && v !== null && (
              <button className="btn accent onecard-call" onClick={() => setS(declare(s, v))}>
                ☝️ {humans > 1 ? `${players[v].name} ` : ''}원카드!
              </button>
            )}
            {showCatch && v !== null && (
              <button className="btn danger onecard-call" onClick={() => setS(catchOne(s, catcher))}>
                🚨 {players[v].name} 원카드 안 외침! 잡기
              </button>
            )}
          </div>
        )}
      </div>

      <div className="onecard-me card-panel">
        {me === null ? (
          <p className="muted center onecard-wait">
            {hs.multi ? '사람 차례가 오면 화면을 넘겨요' : '관전 중'}
          </p>
        ) : (
          <>
            <div className="onecard-me-head">
              <strong>
                {players[me].name} · {s.hands[me].length}장
              </strong>
              {s.hands[me].length >= BUST_LIMIT - 5 && (
                <span className="onecard-warn">⚠️ {BUST_LIMIT}장이면 파산</span>
              )}
              {s.predeclared[me] && <span className="onecard-ready">☝️ 원카드 준비</span>}
            </div>
            <HandFan
              cards={myHand}
              selected={sel ? new Set([sel]) : undefined}
              isPlayable={myTurn ? (c) => canPlay(s, c) : undefined}
              onTap={
                myTurn
                  ? (c) => {
                      if (sel === c.id) doPlay(c.id)
                      else setSel(c.id)
                    }
                  : undefined
              }
              cardWidth={60}
            />
            {pick7 ? (
              <SuitPicker
                onPick={(su) => {
                  setS(play(s, me, pick7, su))
                  setPick7(null)
                }}
                onCancel={() => setPick7(null)}
              />
            ) : (
              <div className="onecard-actions">
                <button
                  className="btn primary"
                  disabled={!myTurn || !sel || !playable(sel)}
                  onClick={() => sel && doPlay(sel)}
                >
                  내기
                </button>
                <button className={`btn ${s.attack > 0 ? 'danger' : ''}`} disabled={!myTurn} onClick={() => setS(drawTurn(s, me))}>
                  {s.attack > 0 ? `공격 받기 (+${s.attack}장)` : '한 장 뽑기'}
                </button>
                <button className="btn accent" disabled={!canPredeclare} onClick={() => setS(declare(s, me))}>
                  ☝️ 원카드
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
