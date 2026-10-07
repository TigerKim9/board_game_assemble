import { useEffect, useMemo, useState } from 'react'
import { PlayingCard } from '../../cards'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { HandFan, MiniBack, PassCover, Toasts } from '../onecard/kit'
import { useHotSeat, useKeyedState } from '../onecard/kitHooks'
import {
  PASS_KO,
  PASS_OFFSET,
  TARGET,
  aiPass,
  aiPlay,
  choosePass,
  collect,
  deal,
  handPoints,
  legalCards,
  newGame,
  passDir,
  playCard,
  standings,
  trickWinner,
  winners,
  type HState,
} from './logic'
import './hearts.css'

interface Config {
  players: PlayerConfig[]
  difficulty: Difficulty
}

export default function Hearts() {
  const [cfg, setCfg] = useState<Config | null>(null)
  if (!cfg) {
    return (
      <PlayerSetup
        gameId="hearts"
        min={4}
        max={4}
        showDifficulty
        onStart={(players, difficulty) => setCfg({ players, difficulty })}
      />
    )
  }
  return <Game key={JSON.stringify(cfg)} cfg={cfg} onExit={() => setCfg(null)} />
}

const POS = ['bottom', 'left', 'top', 'right'] as const

function Game({ cfg, onExit }: { cfg: Config; onExit: () => void }) {
  const { players, difficulty } = cfg
  const names = useMemo(() => players.map((p) => p.name), [players])
  const [s, setS] = useState<HState>(() => newGame(names))
  const passer = s.phase === 'pass' ? s.passSel.findIndex((x, i) => !x && !players[i].isAI) : -1
  const actor = s.phase === 'pass' ? (passer >= 0 ? passer : null) : s.phase === 'play' && s.turn >= 0 ? s.turn : null
  const hs = useHotSeat(players, actor)
  const me = hs.shown
  const [sel, setSel] = useKeyedState<string[]>([], `${actor}|${s.phase}|${s.handNo}|${s.played.length}`)
  const view = me ?? players.findIndex((p) => !p.isAI)
  const base = view >= 0 ? view : 0

  useEffect(() => {
    if (s.phase === 'pass' && players.some((p, i) => p.isAI && !s.passSel[i])) {
      const id = setTimeout(() => {
        let n = s
        players.forEach((p, i) => {
          if (p.isAI && !n.passSel[i]) n = choosePass(n, i, aiPass(n.hands[i], difficulty))
        })
        setS(n)
      }, 300)
      return () => clearTimeout(id)
    }
    if (s.phase !== 'play') return
    if (s.trick.length === 4) {
      const id = setTimeout(() => setS(collect(s)), 1300)
      return () => clearTimeout(id)
    }
    if (s.turn >= 0 && players[s.turn].isAI) {
      const id = setTimeout(() => setS(playCard(s, s.turn, aiPlay(s, s.turn, difficulty))), 650 + Math.random() * 300)
      return () => clearTimeout(id)
    }
  }, [s, players, difficulty])

  const myTurn = me !== null && actor === me && !hs.cover
  const myHand = me === null ? [] : s.hands[me]
  const legal = myTurn && s.phase === 'play' ? legalCards(s, me!) : []
  const legalIds = new Set(legal.map((c) => c.id))
  const dir = passDir(s.handNo)

  const tap = (id: string) => {
    if (!myTurn || me === null) return
    if (s.phase === 'pass') {
      if (sel.includes(id)) setSel(sel.filter((x) => x !== id))
      else setSel(sel.length >= 3 ? [...sel.slice(1), id] : [...sel, id])
      return
    }
    if (!legalIds.has(id)) return
    if (sel[0] === id) setS(playCard(s, me, id))
    else setSel([id])
  }

  if (s.phase === 'over' || s.phase === 'handEnd') {
    const over = s.phase === 'over'
    const order = standings(s)
    const win = winners(s)
    const humans = players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0)
    const solo = humans.length === 1 ? humans[0] : -1
    const title = !over
      ? `${s.handNo}번째 판 결과`
      : solo >= 0
        ? win.includes(solo)
          ? win.length > 1
            ? '🤝 공동 우승!'
            : '🎉 우승! 가장 적은 점수!'
          : `${order.indexOf(solo) + 1}위 — 아쉬워요`
        : `🏆 ${win.map((i) => players[i].name).join(', ')} 우승!`
    return (
      <div className="hearts">
        <Result title={title} onAgain={() => setS(over ? newGame(names) : deal(s))} againLabel={over ? '다시 하기' : '다음 판'}>
          {s.moon !== null && <p className="hearts-moon">🌙 {players[s.moon].name} 문 슛 성공! 다른 사람 모두 +26</p>}
          <table className="hearts-scores">
            <thead>
              <tr>
                <th>이름</th>
                <th>이번 판</th>
                <th>총점</th>
              </tr>
            </thead>
            <tbody>
              {order.map((p) => (
                <tr key={p} className={win.includes(p) && over ? 'win' : ''}>
                  <td>
                    {players[p].isAI ? '🤖' : '🙂'} {players[p].name}
                  </td>
                  <td>+{s.lastHand?.[p] ?? 0}</td>
                  <td>
                    <strong>{s.scores[p]}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!over && <p className="muted hearts-note">누군가 {TARGET}점이 되면 끝나요. 점수가 가장 낮은 사람이 이겨요.</p>}
          <button className="btn ghost" onClick={onExit}>
            설정 바꾸기
          </button>
        </Result>
      </div>
    )
  }

  const trickDone = s.trick.length === 4
  const winnerNow = trickDone ? trickWinner(s.trick) : -1

  let status: string
  if (s.phase === 'pass') {
    status =
      passer >= 0
        ? myTurn
          ? `${PASS_KO[dir]}(${players[(me! + PASS_OFFSET[dir]) % 4].name})에게 넘길 카드 3장을 고르세요`
          : `${players[passer].name} 카드 고르는 중…`
        : '카드를 넘기는 중…'
  } else if (trickDone) status = `${players[winnerNow].name}가 가져가요`
  else if (players[s.turn].isAI) status = `🤖 ${players[s.turn].name} 차례…`
  else if (!myTurn) status = `${players[s.turn].name} 차례`
  else if (s.trick.length === 0)
    status = s.trickNo === 0 ? '♣2로 시작하세요' : s.heartsBroken ? '선이에요! 아무 카드나' : '선이에요! (하트는 아직 못 내요)'
  else status = '같은 무늬가 있으면 따라 내야 해요'

  const seatBox = (p: number) => {
    const rel = (p - base + 4) % 4
    const pts = handPoints(s.taken[p])
    return (
      <div
        key={p}
        className={`hearts-seat ${POS[rel]} ${actor === p || (s.phase === 'play' && s.turn === p) ? 'active' : ''}`}
        style={{ borderColor: `var(--p${p + 1})` }}
      >
        <span className="hearts-seat-name">
          {players[p].isAI ? '🤖' : '🙂'} {players[p].name}
        </span>
        <span className="hearts-seat-stats">
          <MiniBack count={s.hands[p].length} />
          <span className="hearts-pts" title="이번 판 점수">
            ♥{pts}
          </span>
          <span className="hearts-total" title="총점">
            총{s.scores[p]}
          </span>
        </span>
      </div>
    )
  }

  return (
    <div className="hearts">
      {hs.cover && <PassCover name={hs.coverName} onReady={hs.reveal} />}
      <div className="hearts-table felt">
        <Toasts log={s.log} />
        <div className="hearts-board">
          {[0, 1, 2, 3].filter((p) => p !== me).map(seatBox)}
          <div className="hearts-trick">
            {s.trick.map((t) => {
              const rel = (t.p - base + 4) % 4
              return (
                <div key={t.card.id} className={`hearts-tcard ${POS[rel]} ${t.p === winnerNow ? 'win' : ''}`}>
                  <PlayingCard card={t.card} width={48} />
                </div>
              )
            })}
            {s.trick.length === 0 && (
              <div className="hearts-center-info">
                {s.phase === 'pass' ? (
                  <>
                    <b>{dir === 'none' ? '넘기기 없음' : `${PASS_KO[dir]}으로`}</b>
                    <span>{dir !== 'none' && '3장 넘기기'}</span>
                  </>
                ) : (
                  <>
                    <b>{s.trickNo + 1}/13</b>
                    <span>{s.heartsBroken ? '💔 하트 깨짐' : '♥ 아직 안 깨짐'}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className={`status hearts-status ${myTurn ? 'mine' : ''}`}>{status}</div>
      </div>

      <div className="hearts-me card-panel">
        {me === null ? (
          <p className="muted center hearts-wait">{hs.multi ? '사람 차례가 오면 화면을 넘겨요' : '관전 중'}</p>
        ) : (
          <>
            <div className="hearts-me-head">
              <strong>{players[me].name}</strong>
              <span className="hearts-pts">이번 판 ♥{handPoints(s.taken[me])}</span>
              <span className="muted">총점 {s.scores[me]}</span>
              {s.phase === 'play' && s.trickNo === 0 && s.received[me].length > 0 && (
                <span className="hearts-recv">✨ 받은 카드</span>
              )}
            </div>
            <HandFan
              cards={myHand}
              selected={new Set(sel)}
              isPlayable={myTurn && s.phase === 'play' ? (c) => legalIds.has(c.id) : undefined}
              onTap={myTurn ? (c) => tap(c.id) : undefined}
              highlight={s.phase === 'play' && s.trickNo === 0 ? new Set(s.received[me].map((c) => c.id)) : undefined}
              cardWidth={60}
            />
            {s.phase === 'pass' ? (
              <div className="hearts-actions">
                <button
                  className="btn primary"
                  disabled={!myTurn || sel.length !== 3}
                  onClick={() => setS(choosePass(s, me, sel))}
                >
                  {s.passSel[me] ? '다른 사람 기다리는 중…' : `3장 넘기기 (${sel.length}/3)`}
                </button>
              </div>
            ) : (
              <div className="hearts-actions">
                <button
                  className="btn primary"
                  disabled={!myTurn || !sel[0] || !legalIds.has(sel[0])}
                  onClick={() => setS(playCard(s, me, sel[0]))}
                >
                  {myTurn ? (sel[0] ? '내기 (한 번 더 눌러도 돼요)' : '낼 카드를 고르세요') : '기다리는 중…'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
