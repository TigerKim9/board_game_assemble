import { useEffect, useState } from 'react'
import { PlayingCard, cardLabel, sortCards } from '../../cards'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import type { PlayerConfig } from '../../lib/types'
import { OldMaidCenter } from './Center'
import { HandFan, PassCover, Seats, Toasts, type SeatInfo } from '../onecard/kit'
import { useHotSeat } from '../onecard/kitHooks'
import { aiPick, drawFrom, newGame, ranking, shuffleHand, targetOf, type OMState } from './logic'
import './oldmaid.css'

export default function OldMaid() {
  const [players, setPlayers] = useState<PlayerConfig[] | null>(null)
  if (!players) {
    return <PlayerSetup gameId="oldmaid" min={2} max={6} defaultCount={4} onStart={(p) => setPlayers(p)} />
  }
  return <Game key={JSON.stringify(players)} players={players} onExit={() => setPlayers(null)} />
}

const start = (players: PlayerConfig[]) =>
  newGame(
    players.map((p) => p.name),
    players.map((p) => p.isAI),
  )

interface Aim {
  phase: 'shuffle' | 'aim'
  idx: number
}

function Game({ players, onExit }: { players: PlayerConfig[]; onExit: () => void }) {
  const [s, setS] = useState<OMState>(() => start(players))
  const [aim, setAim] = useState<Aim | null>(null)
  const hs = useHotSeat(players, s.over ? null : s.turn)
  const me = hs.shown
  const humansLeft = players.some((p, i) => !p.isAI && s.hands[i].length > 0)

  // AI draws. Drawing from a human is staged: their hand wiggles, a card gets "aimed at", then taken.
  useEffect(() => {
    if (s.over || !players[s.turn].isAI) return
    const p = s.turn
    const from = targetOf(s, p)
    const timers: ReturnType<typeof setTimeout>[] = []
    const at = (ms: number, f: () => void) => timers.push(setTimeout(f, ms))
    if (!players[from].isAI) {
      const n = s.hands[from].length
      const first = aiPick(s, p)
      const final = n > 1 && Math.random() < 0.5 ? (first + 1 + Math.floor(Math.random() * (n - 1))) % n : first
      at(250, () => setAim({ phase: 'shuffle', idx: -1 }))
      at(1100, () => setAim({ phase: 'aim', idx: first }))
      if (final !== first) at(1650, () => setAim({ phase: 'aim', idx: final }))
      at(final !== first ? 2300 : 1850, () => {
        setAim(null)
        setS(drawFrom(s, p, final))
      })
    } else {
      at(humansLeft ? 1000 : 450, () => setS(drawFrom(s, p, aiPick(s, p))))
    }
    return () => timers.forEach(clearTimeout)
  }, [s, players, humansLeft])

  if (s.over) {
    const order = ranking(s)
    const humanIdx = players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0)
    const solo = humanIdx.length === 1 ? humanIdx[0] : -1
    const title =
      s.loser === null
        ? '무승부?'
        : solo >= 0
          ? s.loser === solo
            ? '🃏 도둑이 됐어요…'
            : `🎉 탈출 성공! (${s.out.indexOf(solo) + 1}번째)`
          : `🃏 도둑은 ${players[s.loser].name}!`
    return (
      <div className="oldmaid">
        <Result title={title} onAgain={() => setS(start(players))}>
          {s.loser !== null && (
            <div className="oldmaid-joker">
              <PlayingCard card={s.hands[s.loser][0]} width={70} />
            </div>
          )}
          <ol className="oldmaid-rank">
            {order.map((p, i) => (
              <li key={p}>
                {p === s.loser ? '🃏' : `${i + 1}.`} {players[p].isAI ? '🤖' : '🙂'} {players[p].name}
                {p === s.loser ? <strong> — 도둑!</strong> : <span className="muted"> — 탈출</span>}
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

  const drawer = s.turn
  const target = targetOf(s, drawer)
  const myTurn = me !== null && drawer === me && !hs.cover
  const seatsOrder = Array.from({ length: players.length }, (_, k) => ((me ?? -1) + 1 + k) % players.length).filter(
    (i) => i !== me,
  )
  const seats: SeatInfo[] = seatsOrder.map((i) => ({
    index: i,
    name: players[i].name,
    isAI: players[i].isAI,
    count: s.hands[i].length,
    active: drawer === i,
    out: s.hands[i].length === 0,
    badge: s.hands[i].length === 0 ? '탈출' : i === target ? '🎯 뽑힐 차례' : undefined,
  }))
  const beingRobbed = me !== null && target === me && players[drawer].isAI
  const lastMine = s.last && me !== null && s.last.by === me ? s.last : null
  const lostMine = s.last && me !== null && s.last.from === me && players[s.last.by].isAI ? s.last : null

  let status: string
  if (players[drawer].isAI) status = `🤖 ${players[drawer].name}가 ${players[target].name}의 카드를 뽑는 중…`
  else if (myTurn) status = `${players[target].name}의 카드 중 한 장을 골라 뽑으세요!`
  else status = `${players[drawer].name} 차례`

  return (
    <div className="oldmaid">
      {hs.cover && <PassCover name={hs.coverName} onReady={hs.reveal} />}
      <Seats seats={seats} />
      <div className="oldmaid-table felt">
        <Toasts log={s.log} />
        <div className={`status oldmaid-status ${myTurn ? 'mine' : ''}`}>{status}</div>
        {myTurn ? (
          <div className="oldmaid-target" key={`t${drawer}-${s.hands[target].length}`}>
            <div className="oldmaid-target-name">
              {players[target].isAI ? '🤖' : '🙂'} {players[target].name} · {s.hands[target].length}장
            </div>
            <HandFan
              cards={s.hands[target]}
              faceDown
              back="red"
              cardWidth={62}
              onTap={(_, i) => setS(drawFrom(s, drawer, i))}
              className="oldmaid-shuffle-in"
            />
          </div>
        ) : (
          <OldMaidCenter
            lastPair={s.lastPair}
            pairs={s.pairs}
            drawn={
              lastMine
                ? {
                    card: lastMine.card,
                    lost: false,
                    text: (
                      <>
                        뽑은 카드 {cardLabel(lastMine.card)}
                        <br />
                        {lastMine.paired ? '짝 맞춤! 🎯' : lastMine.card.rank === 0 ? '앗, 도둑이다! 😱' : '짝 없음'}
                      </>
                    ),
                  }
                : lostMine
                  ? {
                      card: lostMine.card,
                      lost: true,
                      text: (
                        <>
                          {players[lostMine.by].name}가
                          <br />
                          {lostMine.card.rank === 0 ? '도둑을 가져갔어요! 😆' : '가져갔어요'}
                        </>
                      ),
                    }
                  : null
            }
          />
        )}
      </div>

      <div className="oldmaid-me card-panel">
        {me === null ? (
          <p className="muted center oldmaid-wait">{hs.multi ? '사람 차례가 오면 화면을 넘겨요' : '관전 중'}</p>
        ) : (
          <>
            <div className="oldmaid-me-head">
              <strong>
                {players[me].name} · {s.hands[me].length}장
              </strong>
              {beingRobbed && <span className="oldmaid-alert">😬 {players[drawer].name}가 내 카드를 노려요!</span>}
              <span className="oldmaid-tools">
                <button
                  className="btn small ghost"
                  disabled={beingRobbed}
                  onClick={() => setS({ ...s, hands: s.hands.map((h, i) => (i === me ? sortCards(h) : h)) })}
                >
                  정렬
                </button>
                <button className="btn small ghost" disabled={beingRobbed} onClick={() => setS(shuffleHand(s, me))}>
                  섞기
                </button>
              </span>
            </div>
            <HandFan
              cards={s.hands[me]}
              cardWidth={60}
              aimed={beingRobbed && aim?.phase === 'aim' ? aim.idx : null}
              className={beingRobbed && aim?.phase === 'shuffle' ? 'oldmaid-wiggle' : ''}
            />
            {s.hands[me].length === 0 && <p className="center oldmaid-escaped">🎉 탈출했어요! 끝까지 지켜봐요</p>}
          </>
        )}
      </div>
    </div>
  )
}
