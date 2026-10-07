import { useEffect, useMemo, useState } from 'react'
import { cardLabel, isJoker, type Card } from '../../cards'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { HandFan, PassCover, Seats, Toasts, type SeatInfo } from '../onecard/kit'
import { useHotSeat, useKeyedState } from '../onecard/kitHooks'
import {
  TITLE_EMOJI,
  TITLE_KO,
  aiMove,
  analyze,
  beats,
  giveBack,
  newGame,
  pass,
  play,
  rankName,
  standings,
  startRound,
  type Options,
  type PRState,
} from './logic'
import { PresidentTrick, ScoreTable as SharedScoreTable } from './parts'
import './president.css'

interface Config {
  players: PlayerConfig[]
  difficulty: Difficulty
  opts: Options
}

const COUNT_NAME = ['', '한 장', '두 장(페어)', '세 장(트리플)', '네 장(포카드)']

export default function President() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [opts, setOpts] = useStored<Options>('president:opts', { jokers: false, revolution: true, rounds: 5 })
  if (!cfg) {
    return (
      <PlayerSetup
        gameId="president"
        min={3}
        max={6}
        defaultCount={4}
        showDifficulty
        extra={
          <div className="president-opts">
            <div className="setup-row">
              <span>라운드</span>
              <div className="segmented">
                {[3, 5, 7].map((r) => (
                  <button key={r} className={opts.rounds === r ? 'active' : ''} onClick={() => setOpts({ ...opts, rounds: r })}>
                    {r}판
                  </button>
                ))}
              </div>
            </div>
            <label className="president-check">
              <input type="checkbox" checked={opts.jokers} onChange={(e) => setOpts({ ...opts, jokers: e.target.checked })} />
              조커 2장 넣기 (만능 카드)
            </label>
            <label className="president-check">
              <input
                type="checkbox"
                checked={opts.revolution}
                onChange={(e) => setOpts({ ...opts, revolution: e.target.checked })}
              />
              혁명 규칙 (4장 내면 순서 뒤집기)
            </label>
          </div>
        }
        onStart={(players, difficulty) => setCfg({ players, difficulty, opts })}
      />
    )
  }
  return <Game key={JSON.stringify(cfg)} cfg={cfg} onExit={() => setCfg(null)} />
}

function Game({ cfg, onExit }: { cfg: Config; onExit: () => void }) {
  const { players, difficulty, opts } = cfg
  const humanSeats = useMemo(() => players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0), [players])
  const fresh = () =>
    newGame(
      players.map((p) => p.name),
      opts,
    )
  const [s, setS] = useState<PRState>(fresh)
  const actor = s.phase === 'play' ? s.turn : s.phase === 'exchange' ? (s.pendingGive[0]?.from ?? null) : null
  const hs = useHotSeat(players, actor)
  const me = hs.shown
  const [sel, setSel] = useKeyedState<string[]>([], `${actor}|${s.phase}|${s.round}|${s.plays}`)

  useEffect(() => {
    if (s.phase === 'play' && players[s.turn].isAI) {
      const id = setTimeout(
        () => {
          const m = aiMove(s, s.turn, difficulty)
          setS(m.type === 'pass' ? pass(s, s.turn) : play(s, s.turn, m.cardIds))
        },
        humanSeats.some((h) => s.hands[h].length > 0) ? 850 + Math.random() * 350 : 450,
      )
      return () => clearTimeout(id)
    }
    if (s.phase === 'roundEnd' && humanSeats.length === 0) {
      const id = setTimeout(() => setS(startRound(s, humanSeats)), 2500)
      return () => clearTimeout(id)
    }
  }, [s, players, difficulty, humanSeats])

  const myTurn = me !== null && actor === me && !hs.cover
  const myHand = me === null ? [] : s.hands[me]
  const selCards = myHand.filter((c) => sel.includes(c.id))
  const combo = analyze(selCards)
  const giving = s.phase === 'exchange' && myTurn ? s.pendingGive.find((g) => g.from === me) : undefined
  const canPlay = s.phase === 'play' && myTurn && !!combo && beats(combo, s.current, s.revolution)

  const tap = (c: Card) => {
    if (!myTurn) return
    if (sel.includes(c.id)) return setSel(sel.filter((x) => x !== c.id))
    if (giving) return setSel(sel.length >= giving.count ? [...sel.slice(1), c.id] : [...sel, c.id])
    const need = s.current?.count ?? 0
    if (sel.length === 0 && need > 1 && !isJoker(c)) {
      const same = myHand.filter((x) => x.rank === c.rank)
      if (same.length >= need) {
        const rest = same.filter((x) => x.id !== c.id).slice(0, need - 1)
        return setSel([c.id, ...rest.map((x) => x.id)])
      }
    }
    setSel([...sel, c.id])
  }

  if (s.phase === 'over') {
    const order = standings(s)
    const solo = humanSeats.length === 1 ? humanSeats[0] : -1
    const title =
      solo >= 0 ? (order[0] === solo ? '👑 최종 대통령!' : `최종 ${order.indexOf(solo) + 1}위`) : `👑 ${players[order[0]].name} 우승!`
    return (
      <div className="president">
        <Result title={title} onAgain={() => setS(fresh())}>
          <ScoreTable s={s} players={players} order={order} />
          <button className="btn ghost" onClick={onExit}>
            설정 바꾸기
          </button>
        </Result>
      </div>
    )
  }

  if (s.phase === 'roundEnd') {
    return (
      <div className="president">
        <Result title={`${s.round}라운드 결과`} onAgain={() => setS(startRound(s, humanSeats))} againLabel="다음 라운드">
          <ScoreTable s={s} players={players} order={s.finished} />
          <p className="muted president-note">
            다음 라운드: 노예는 가장 센 카드 2장을 대통령에게 바치고{players.length >= 4 ? ', 부국민은 부통령에게 1장을' : ''}{' '}
            주고 받아요.
          </p>
        </Result>
      </div>
    )
  }

  const seatOrder = Array.from({ length: players.length }, (_, k) => ((me ?? -1) + 1 + k) % players.length).filter(
    (i) => i !== me,
  )
  const seats: SeatInfo[] = seatOrder.map((i) => {
    const t = s.titles[i]
    const fin = s.finished.indexOf(i)
    return {
      index: i,
      name: players[i].name,
      isAI: players[i].isAI,
      count: s.hands[i].length,
      active: actor === i,
      out: fin >= 0,
      badge: fin >= 0 ? `${fin + 1}등 탈출` : t ? `${TITLE_EMOJI[t]} ${TITLE_KO[t]}` : `${s.scores[i]}점`,
      note: s.passed[i] && s.current ? '패스' : fin < 0 && t ? `${s.scores[i]}점` : undefined,
    }
  })

  let status: string
  if (s.phase === 'exchange') {
    const g = s.pendingGive[0]
    status = giving
      ? `${players[g.to].name}에게 돌려줄 카드 ${g.count}장을 고르세요`
      : `${players[g.from].name}가 돌려줄 카드를 고르는 중…`
  } else if (players[s.turn].isAI) status = `🤖 ${players[s.turn].name} 생각 중…`
  else if (!myTurn) status = `${players[s.turn].name} 차례`
  else if (!s.current) status = '선 차례! 아무 조합이나 내세요'
  else status = `${COUNT_NAME[s.current.count]}로 ${rankName(s.current.level)}보다 ${s.revolution ? '약한(혁명)' : '센'} 카드!`

  const myExchanges = me === null ? [] : s.exchanges.filter((e) => e.from === me || e.to === me)

  return (
    <div className="president">
      {hs.cover && <PassCover name={hs.coverName} onReady={hs.reveal} />}
      <Seats seats={seats} />
      <div className={`president-table felt ${s.revolution ? 'revo' : ''}`}>
        <Toasts log={s.log} />
        <div className="president-info">
          <span>
            {s.round}/{opts.rounds} 라운드
          </span>
          {s.revolution && <span className="president-revo">✊ 혁명 중 — 3이 가장 세요</span>}
        </div>
        <PresidentTrick
          current={s.current}
          byName={s.current ? players[s.current.by].name : ''}
          plays={s.plays}
          emptyText={s.phase === 'exchange' ? '카드 교환 중' : '새 판 — 자유롭게 내기'}
        />
        <div className={`status president-status ${myTurn ? 'mine' : ''}`}>{status}</div>
      </div>

      <div className="president-me card-panel">
        {me === null ? (
          <p className="muted center president-wait">{hs.multi ? '사람 차례가 오면 화면을 넘겨요' : '관전 중'}</p>
        ) : (
          <>
            <div className="president-me-head">
              <strong>
                {players[me].name} · {myHand.length}장
              </strong>
              {s.titles[me] && (
                <span className="president-title">
                  {TITLE_EMOJI[s.titles[me]!]} {TITLE_KO[s.titles[me]!]}
                </span>
              )}
              <span className="muted">{s.scores[me]}점</span>
            </div>
            {myExchanges.length > 0 && s.plays === 0 && (
              <div className="president-ex">
                {myExchanges.map((e, i) => (
                  <span key={i}>
                    {e.from === me ? `→ ${players[e.to].name}에게 줌: ` : `← ${players[e.from].name}에게 받음: `}
                    <b>{e.cards.map(cardLabel).join(' ')}</b>
                  </span>
                ))}
              </div>
            )}
            <HandFan
              cards={myHand}
              selected={new Set(sel)}
              onTap={myTurn ? tap : undefined}
              cardWidth={60}
            />
            {myHand.length === 0 ? (
              <p className="center president-done">🎉 탈출! 다른 사람들을 기다려요</p>
            ) : giving ? (
              <div className="president-actions one">
                <button
                  className="btn primary"
                  disabled={sel.length !== giving.count}
                  onClick={() => setS(giveBack(s, me, sel))}
                >
                  {giving.count}장 돌려주기 ({sel.length}/{giving.count})
                </button>
              </div>
            ) : (
              <div className="president-actions">
                <button className="btn primary" disabled={!canPlay} onClick={() => setS(play(s, me, sel))}>
                  {sel.length ? `${sel.length}장 내기` : '내기'}
                </button>
                <button className="btn" disabled={!myTurn || !s.current} onClick={() => setS(pass(s, me))}>
                  패스
                </button>
                <button className="btn ghost" disabled={!sel.length} onClick={() => setSel([])}>
                  선택 해제
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ScoreTable({ s, players, order }: { s: PRState; players: PlayerConfig[]; order: number[] }) {
  return (
    <SharedScoreTable
      titles={s.titles}
      scores={s.scores}
      order={order}
      label={(p) => `${players[p].isAI ? '🤖' : '🙂'} ${players[p].name}`}
    />
  )
}
