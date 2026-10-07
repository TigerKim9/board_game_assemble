import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { HwatuCard, HwatuPile, KIND_NAMES, KIND_ORDER, getCard } from '../../hwatu'
import { sleep } from '../../lib/random'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  YAKS,
  aiChoose,
  aiPlay,
  chooseFlip,
  chooseHand,
  deal,
  flip,
  matchesOnFloor,
  playCard,
  ranking,
  scoreOf,
  type MState,
} from './logic'
import './minhwatu.css'

interface Setup {
  players: PlayerConfig[]
  difficulty: Difficulty
  round: number
}

export default function Minhwatu() {
  const [setup, setSetup] = useState<Setup | null>(null)
  if (!setup) {
    return (
      <PlayerSetup
        gameId="minhwatu"
        min={2}
        max={3}
        defaultCount={2}
        showDifficulty
        onStart={(players, difficulty) => setSetup({ players, difficulty, round: 1 })}
      />
    )
  }
  return (
    <Game
      key={setup.round}
      setup={setup}
      onAgain={() => setSetup({ ...setup, round: setup.round + 1 })}
      onReset={() => setSetup(null)}
    />
  )
}

function Game({ setup, onAgain, onReset }: { setup: Setup; onAgain: () => void; onReset: () => void }) {
  const [s, setS] = useState<MState>(() => deal(setup.players, Math.random, (setup.round - 1) % setup.players.length))
  const [selected, setSelected] = useState<number | null>(null)
  const [revealed, setRevealed] = useState<number | null>(null)
  const busy = useRef(false)
  const alive = useRef(true)
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

  // 자동 진행: 뒤집기, AI 차례
  useEffect(() => {
    if (over || busy.current) return
    const k = phase.kind
    const auto = k === 'flip' || (current.isAI && (k === 'play' || k === 'chooseHand' || k === 'chooseFlip'))
    if (!auto) return
    busy.current = true
    ;(async () => {
      await sleep(k === 'flip' ? 650 : k === 'play' ? 900 : 700)
      if (!alive.current) return
      busy.current = false
      setS((st) => {
        if (st !== s) return st
        if (k === 'flip') return flip(st)
        if (k === 'play') return playCard(st, aiPlay(st, setup.difficulty))
        if (k === 'chooseHand') return chooseHand(st, aiChoose(st, setup.difficulty))
        return chooseFlip(st, aiChoose(st, setup.difficulty))
      })
    })()
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps

  // 차례가 바뀌면 선택 해제 / 가림막
  useEffect(() => {
    setSelected(null)
    if (multiHuman && revealed !== turn) setRevealed(null)
  }, [turn]) // eslint-disable-line react-hooks/exhaustive-deps

  if (over) {
    const r = ranking(s)
    const tie = r.length > 1 && r[0].score.total === r[1].score.total
    const me = humans.length === 1 ? humans[0] : null
    const title = tie
      ? '🤝 무승부!'
      : me != null
        ? r[0].i === me
          ? '🎉 이겼어요!'
          : `😢 ${players[r[0].i].name} 승리`
        : `🏆 ${players[r[0].i].name} 승리!`
    return (
      <Result title={title} onAgain={onAgain}>
        <ol className="ranking minhwatu-rank">
          {r.map(({ i, score }) => (
            <li key={i}>
              {players[i].isAI ? '🤖 ' : ''}
              {players[i].name} — <strong>{score.total}점</strong>
              <div className="muted minhwatu-rank-detail">
                패 {score.base}점{score.yaks.map((y) => ` + ${y.name} ${y.bonus}`).join('')}
              </div>
            </li>
          ))}
        </ol>
        <button className="btn ghost" onClick={onReset}>
          인원 바꾸기
        </button>
      </Result>
    )
  }

  const needCover = multiHuman && !current.isAI && revealed !== turn
  const viewer = !multiHuman ? humans[0] : !current.isAI && revealed === turn ? turn : null
  const myTurn = viewer === turn && !current.isAI
  const opponents = players.map((p, i) => ({ p, i })).filter(({ i }) => i !== viewer)

  const selMatches = selected != null ? matchesOnFloor(s.floor, selected) : []
  const choosing = (phase.kind === 'chooseHand' || phase.kind === 'chooseFlip') && myTurn ? phase.options : []

  const onHand = (id: number) => {
    if (!myTurn || phase.kind !== 'play') return
    if (selected === id) {
      setSelected(null)
      setS((st) => playCard(st, id))
    } else setSelected(id)
  }
  const onFloor = (id: number) => {
    if (choosing.includes(id)) {
      setS((st) => (st.phase.kind === 'chooseHand' ? chooseHand(st, id) : chooseFlip(st, id)))
    } else if (myTurn && phase.kind === 'play' && selected != null && selMatches.includes(id)) {
      setSelected(null)
      setS((st) => playCard(st, selected, selMatches.length === 2 ? id : undefined))
    }
  }

  // 바닥을 달 순서로 묶어 보여줌
  const floorSorted = s.floor.slice().sort((a, b) => a - b)
  const pending = phase.kind === 'chooseHand' || phase.kind === 'chooseFlip' ? phase.card : null

  let status: string
  if (phase.kind === 'chooseHand' || phase.kind === 'chooseFlip') {
    status = myTurn ? '같은 달 카드가 두 장! 가져올 카드를 고르세요' : `🤖 ${current.name} 고르는 중…`
  } else if (phase.kind === 'flip') status = '더미에서 한 장 뒤집는 중…'
  else if (current.isAI) status = `🤖 ${current.name} 차례…`
  else if (myTurn) status = selected != null ? (selMatches.length ? '한 번 더 누르거나 바닥 카드를 누르면 내요' : '짝이 없어요. 한 번 더 누르면 바닥에 내요') : '낼 카드를 고르세요'
  else status = `${current.name} 차례`

  return (
    <div className="minhwatu">
      <div className="minhwatu-opps">
        {opponents.map(({ p, i }) => (
          <OpponentRow key={i} name={p.name} isAI={p.isAI} hand={p.hand.length} captured={p.captured} active={i === turn} />
        ))}
      </div>

      <div className="minhwatu-table felt">
        <div className="minhwatu-center">
          <HwatuPile count={s.deck.length} width={40} />
          <div className="minhwatu-flip">
            {pending != null && <HwatuCard card={pending} width={44} className="hw-deal" />}
            {pending == null && s.flipped != null && phase.kind === 'play' && (
              <HwatuCard key={s.flipped} card={s.flipped} width={44} dim className="hw-flip" title="방금 뒤집은 카드" />
            )}
          </div>
          <div className="minhwatu-msg">{s.message || '같은 달 카드를 맞춰 가져오세요'}</div>
        </div>
        <div className="minhwatu-floor">
          {floorSorted.map((id) => {
            const hl = choosing.includes(id) || selMatches.includes(id)
            const clickable = choosing.includes(id) || (selMatches.includes(id) && myTurn)
            return (
              <HwatuCard
                key={id}
                card={id}
                width={44}
                highlight={hl}
                className={id === s.played || id === s.flipped ? 'hw-deal' : ''}
                onClick={clickable ? () => onFloor(id) : undefined}
              />
            )
          })}
          {floorSorted.length === 0 && <span className="minhwatu-empty">바닥이 비었어요</span>}
        </div>
      </div>

      <div className="status">{status}</div>

      {needCover ? (
        <div className="minhwatu-cover card-panel">
          <div className="minhwatu-cover-emoji">🙈</div>
          <h2>{current.name}님 차례</h2>
          <p className="muted">다른 사람이 패를 보지 않도록 화면을 넘겨주세요.</p>
          <button className="btn primary big" onClick={() => setRevealed(turn)}>
            내 패 보기
          </button>
        </div>
      ) : (
        viewer != null && (
          <>
            <div className="minhwatu-hand card-panel">
              <div className="minhwatu-hand-head">
                <strong>{players[viewer].name}님의 손패</strong>
                <span className="muted">{players[viewer].hand.length}장</span>
              </div>
              <div className="minhwatu-hand-cards">
                {players[viewer].hand.map((id) => {
                  const canMatch = matchesOnFloor(s.floor, id).length > 0
                  return (
                    <HwatuCard
                      key={id}
                      card={id}
                      width={54}
                      selected={selected === id}
                      dim={myTurn && phase.kind === 'play' && !canMatch && selected !== id}
                      onClick={myTurn && phase.kind === 'play' ? () => onHand(id) : undefined}
                    />
                  )
                })}
              </div>
            </div>
            <Captured name="내가 먹은 패" captured={players[viewer].captured} />
          </>
        )
      )}
    </div>
  )
}

function OpponentRow({ name, isAI, hand, captured, active }: { name: string; isAI: boolean; hand: number; captured: number[]; active: boolean }) {
  const sc = scoreOf(captured)
  const [open, setOpen] = useState(false)
  return (
    <div className={`minhwatu-opp ${active ? 'active' : ''}`}>
      <button className="minhwatu-opp-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="minhwatu-opp-name">
          {isAI ? '🤖 ' : ''}
          {name}
        </span>
        <span className="minhwatu-opp-hand">손패 {hand}</span>
        <span className="minhwatu-opp-score">
          {sc.total}점{sc.yaks.length > 0 && <small> ({sc.yaks.map((y) => y.name).join('·')})</small>}
        </span>
        <span className="minhwatu-opp-toggle">{open ? '▲' : '▼'}</span>
      </button>
      {open && <CapturedRows captured={captured} width={28} />}
    </div>
  )
}

function Captured({ name, captured }: { name: string; captured: number[] }) {
  const sc = scoreOf(captured)
  return (
    <div className="minhwatu-captured card-panel">
      <div className="minhwatu-hand-head">
        <strong>{name}</strong>
        <span>
          <strong className="minhwatu-score">{sc.total}점</strong>
          {sc.yaks.length > 0 && <span className="minhwatu-yaks"> {sc.yaks.map((y) => `${y.name}+${y.bonus}`).join(' ')}</span>}
        </span>
      </div>
      {captured.length === 0 ? <p className="muted minhwatu-none">아직 없어요</p> : <CapturedRows captured={captured} width={34} />}
      <YakProgress captured={captured} />
    </div>
  )
}

function CapturedRows({ captured, width }: { captured: number[]; width: number }) {
  const sorted = captured.slice().sort((a, b) => a - b)
  return (
    <div className="minhwatu-rows">
      {KIND_ORDER.map((k) => {
        const cs = sorted.filter((id) => getCard(id).kind === k)
        if (!cs.length) return null
        return (
          <div key={k} className="minhwatu-row">
            <span className="minhwatu-kind">
              {KIND_NAMES[k]} {cs.length}
            </span>
            <span className="hw-stack">
              {cs.map((id) => (
                <HwatuCard key={id} card={id} width={width} showMonth={false} />
              ))}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function YakProgress({ captured }: { captured: number[] }) {
  const set = new Set(captured)
  const near = YAKS.map((y) => ({ y, have: y.ids.filter((id) => set.has(id)).length }))
    .filter(({ y, have }) => have > 0 && have < y.ids.length)
    .sort((a, b) => b.have / b.y.ids.length - a.have / a.y.ids.length)
    .slice(0, 3)
  if (!near.length) return null
  return (
    <div className="minhwatu-progress">
      {near.map(({ y, have }) => (
        <span key={y.key} className="minhwatu-chip">
          {y.name} {have}/{y.ids.length}
        </span>
      ))}
    </div>
  )
}

