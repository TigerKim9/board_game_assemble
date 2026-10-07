import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { HwatuStyleToggle } from '../../hwatu'
import { sleep } from '../../lib/random'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  aiChoose,
  aiPlay,
  chooseFlip,
  chooseHand,
  deal,
  flip,
  matchesOnFloor,
  playCard,
  ranking,
  type MState,
} from './logic'
import { Captured, HandCards, MinhwatuTable, OpponentRow } from './parts'
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
        extra={<HwatuStyleToggle />}
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

      <MinhwatuTable
        s={s}
        deckCount={s.deck.length}
        message={s.message}
        highlight={[...choosing, ...selMatches]}
        clickable={[...choosing, ...(myTurn ? selMatches : [])]}
        onPick={onFloor}
      />

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
            <HandCards
              title={`${players[viewer].name}님의 손패`}
              hand={players[viewer].hand}
              floor={s.floor}
              live={myTurn && phase.kind === 'play'}
              selected={selected}
              onHand={onHand}
            />
            <Captured name="내가 먹은 패" captured={players[viewer].captured} />
          </>
        )
      )}
    </div>
  )
}
