import { useEffect, useState } from 'react'
import { PlayingCard, bestHand, describeHand, rankValue, type Card } from '../../cards'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { formatChips, potTotal } from '../poker-core'
import { BankPanel, Chips, PassCover, type ChipBank } from '../poker-core/ui'
import {
  ANTE,
  BET_LABEL,
  ROUND_LABEL,
  START_CHIPS,
  advance,
  aiBet,
  aiChoice,
  applyBet,
  boss,
  choose,
  createTable,
  isRunout,
  namedBets,
  sevenOf,
  solvent,
  startHand,
  type BetName,
  type SPlayer,
  type Table,
} from './logic'
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

/** 5장 미만일 때 대략적인 족보 이름 */
function roughName(cards: Card[]): string {
  if (cards.length >= 5) return describeHand(bestHand(cards))
  const cnt = new Map<number, number>()
  for (const c of cards) cnt.set(c.rank, (cnt.get(c.rank) ?? 0) + 1)
  const counts = [...cnt.values()].sort((a, b) => b - a)
  if (counts[0] === 4) return '포카드'
  if (counts[0] === 3) return '트리플'
  if (counts[0] === 2 && counts[1] === 2) return '투페어'
  if (counts[0] === 2) return '원페어'
  const top = Math.max(...cards.map((c) => rankValue(c.rank, true)))
  const name = top === 14 ? 'A' : top === 13 ? 'K' : top === 12 ? 'Q' : top === 11 ? 'J' : String(top)
  return `${name} 하이`
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
  const winCards = new Set<string>()
  if (showAll) for (const w of outcome!.winners) outcome!.hands[w]?.cards.forEach((c) => winCards.add(c.id))
  const bossSeat = phase === 'betting' || phase === 'advance' ? boss(t) : -1
  const pot = potTotal(bet)
  const myTurn = phase === 'betting' && current != null && !current.isAI && viewer === turn

  return (
    <div className="sevenpoker">
      {init.refilled.length > 0 && t.handNo === 1 && (
        <div className="sevenpoker-note">💰 {init.refilled.join(', ')}님 칩을 {formatChips(START_CHIPS)}개로 다시 채웠어요.</div>
      )}
      <div className="sevenpoker-table felt">
        <div className="sevenpoker-pot">
          <span>
            판돈 <Chips amount={pot} />
          </span>
          <span className="sevenpoker-round">{phase === 'choice' ? '초이스' : (ROUND_LABEL[t.round] ?? '')}</span>
          {t.community && (
            <span className="sevenpoker-community">
              공용 <PlayingCard card={t.community} width={30} highlight={winCards.has(t.community.id)} />
            </span>
          )}
        </div>
        <ul className="sevenpoker-seats">
          {players.map((p, i) => {
            const s = bet.seats[i]
            const won = phase === 'done' && (outcome?.winners.includes(i) ?? false)
            const hand = phase === 'done' ? outcome?.hands[i] : null
            const isTurn = phase === 'betting' && i === turn
            return (
              <li
                key={i}
                className={`sevenpoker-seat ${isTurn ? 'turn' : ''} ${s.folded || s.out ? 'out' : ''} ${won ? 'won' : ''}`}
                style={{ ['--seat' as string]: `var(--p${(i % 6) + 1})` }}
              >
                <div className="sevenpoker-seat-head">
                  <span className="sevenpoker-name">
                    {i === bossSeat && <span title="보스">👑</span>}
                    {p.isAI ? '🤖' : ''}
                    {p.name}
                  </span>
                  <Chips amount={s.stack} className="sevenpoker-stack" />
                  <span className="sevenpoker-tagbox">
                    {won ? (
                      <span className="sevenpoker-tag win">+{formatChips(outcome!.won[i])}</span>
                    ) : hand ? (
                      <span className="sevenpoker-tag hand">{hand.name}</span>
                    ) : isTurn && p.isAI ? (
                      <span className="sevenpoker-tag thinking">…</span>
                    ) : phase === 'choice' && !s.out ? (
                      <span className="sevenpoker-tag">{t.chosen[i] ? '선택 완료' : '고르는 중'}</span>
                    ) : t.last[i] ? (
                      <span className={`sevenpoker-tag ${s.folded ? 'die' : ''}`}>
                        {t.last[i]}
                        {s.bet > 0 && phase !== 'done' ? ` ${formatChips(s.bet)}` : ''}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="sevenpoker-row">
                  {s.out ? (
                    <span className="muted sevenpoker-sitout">쉬는 중</span>
                  ) : (
                    t.cards[i].map(({ card, open }) => (
                      <PlayingCard
                        key={card.id}
                        card={card}
                        faceDown={!open && !canSee(i)}
                        width={30}
                        back="green"
                        highlight={winCards.has(card.id)}
                        className={`${!open ? 'sevenpoker-hidden' : ''} sevenpoker-deal`}
                      />
                    ))
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        <div className="status sevenpoker-status">
          {phase === 'done'
            ? headline(t)
            : phase === 'choice'
              ? '초이스: 1장 버리고 1장 공개'
              : phase === 'advance'
                ? isRunout(t)
                  ? '올인! 카드를 마저 돌려요…'
                  : '카드를 돌려요…'
                : current?.isAI
                  ? `🤖 ${current.name} 고민 중…`
                  : `${current?.name} 차례`}
        </div>
      </div>

      {phase === 'done' && outcome?.showdown && outcome.awards.length > 1 && (
        <ul className="sevenpoker-pots card-panel">
          {outcome.awards.map((a, k) => (
            <li key={k}>
              <span className="muted">{k === 0 ? '메인 팟' : `사이드 팟 ${k}`}</span> <Chips amount={a.amount} /> →{' '}
              <strong>{a.winners.map((w) => players[w].name).join(', ')}</strong>
            </li>
          ))}
        </ul>
      )}

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

function headline(t: Table): string {
  const o = t.outcome!
  if (!o.showdown) return `🎉 ${o.winners.map((w) => t.players[w].name).join(', ')} 판돈 획득!`
  const main = o.awards[0]
  if (main && main.winners.length > 1) return `🤝 ${main.winners.map((w) => t.players[w].name).join(', ')} 나눠 가짐`
  const w = main?.winners[0] ?? o.winners[0]
  const h = o.hands[w]
  return `🎉 ${t.players[w].name} 승리${h ? ` — ${describeHand(h)}` : ''}`
}

function ChoicePanel({ cards, name, onDone }: { cards: Card[]; name: string; onDone: (discard: number, open: number) => void }) {
  const [discard, setDiscard] = useState<number | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const tap = (k: number) => {
    if (k === discard) setDiscard(null)
    else if (k === open) setOpen(null)
    else if (discard == null) setDiscard(k)
    else setOpen(k)
  }
  return (
    <div className="sevenpoker-choice card-panel">
      <div className="sevenpoker-choice-title">
        <strong>{name}님 초이스</strong>
        <span className="muted">
          {discard == null ? '① 버릴 카드를 누르세요' : open == null ? '② 공개할 카드를 누르세요' : '좋아요! 확인을 누르세요'}
        </span>
      </div>
      <div className="sevenpoker-choice-cards">
        {cards.map((c, k) => (
          <div key={c.id} className="sevenpoker-choice-slot">
            <PlayingCard card={c} width={66} selected={k === open} className={k === discard ? 'sevenpoker-discarded' : ''} onClick={() => tap(k)} />
            <span className={`sevenpoker-choice-label ${k === discard ? 'discard' : k === open ? 'open' : ''}`}>
              {k === discard ? '버림' : k === open ? '공개' : '히든'}
            </span>
          </div>
        ))}
      </div>
      <button className="btn primary big" disabled={discard == null || open == null} onClick={() => onDone(discard!, open!)}>
        확인
      </button>
    </div>
  )
}

function MyCards({ t, seat, winCards }: { t: Table; seat: number; winCards: Set<string> }) {
  const s = t.bet.seats[seat]
  const cards = t.cards[seat]
  const all = sevenOf(t, seat)
  const name = all.length ? roughName(all) : ''
  return (
    <div className={`sevenpoker-me card-panel ${s.folded ? 'folded' : ''}`}>
      <div className="sevenpoker-me-cards">
        {cards.map(({ card, open }) => (
          <div key={card.id} className={`sevenpoker-me-slot ${open ? '' : 'hidden'}`}>
            <PlayingCard card={card} width={40} highlight={winCards.has(card.id)} />
            <span>{open ? '공개' : '히든'}</span>
          </div>
        ))}
      </div>
      <div className="sevenpoker-me-info">
        <span className="muted">{t.players[seat].name}님</span>
        <strong>{s.folded ? '다이했어요' : name}</strong>
        <Chips amount={s.stack} />
      </div>
    </div>
  )
}

const ORDER: BetName[] = ['die', 'check', 'call', 'bbing', 'ddadang', 'half', 'full']

function BetButtons({ t, onBet }: { t: Table; onBet: (b: BetName) => void }) {
  const bets = namedBets(t)
  return (
    <div className="sevenpoker-bets">
      {ORDER.map((name) => {
        const b = bets.find((x) => x.name === name)
        return (
          <button
            key={name}
            className={`btn ${name === 'die' ? 'danger' : name === 'call' || name === 'check' ? 'primary' : name === 'half' || name === 'full' ? 'accent' : ''}`}
            disabled={!b}
            onClick={() => b && onBet(name)}
          >
            <span>{b?.allIn && name !== 'die' && name !== 'check' ? '올인' : BET_LABEL[name]}</span>
            {b && b.pay > 0 && <small>{formatChips(b.pay)}</small>}
          </button>
        )
      })}
    </div>
  )
}
