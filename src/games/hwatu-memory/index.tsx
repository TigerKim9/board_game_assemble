import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { HwatuCard } from '../../hwatu'
import { sleep } from '../../lib/random'
import { useBestScore, useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { aiPick, decay, flipCard, isOver, isPair, newGame, observe, settle, type MemState, type Memory, type Size } from './logic'
import './hwatu-memory.css'

interface Setup {
  players: PlayerConfig[]
  difficulty: Difficulty
  size: Size
  round: number
}

export default function HwatuMemory() {
  const [setup, setSetup] = useState<Setup | null>(null)
  const [size, setSize] = useStored<Size>('hwatu-memory:size', 24)
  if (!setup) {
    return (
      <PlayerSetup
        gameId="hwatu-memory"
        min={1}
        max={4}
        defaultCount={1}
        showDifficulty
        extra={
          <div className="setup-row">
            <span>카드 수</span>
            <div className="segmented">
              {([24, 48] as const).map((n) => (
                <button key={n} className={size === n ? 'active' : ''} onClick={() => setSize(n)}>
                  {n === 24 ? '24장 (6달)' : '48장 (전부)'}
                </button>
              ))}
            </div>
          </div>
        }
        onStart={(players, difficulty) => setSetup({ players, difficulty, size, round: 1 })}
      />
    )
  }
  return <Game key={setup.round} setup={setup} onAgain={() => setSetup({ ...setup, round: setup.round + 1 })} onReset={() => setSetup(null)} />
}

interface World {
  s: MemState
  mems: Memory[]
}

function Game({ setup, onAgain, onReset }: { setup: Setup; onAgain: () => void; onReset: () => void }) {
  const { players, difficulty, size } = setup
  const [w, setW] = useState<World>(() => ({ s: newGame(players.length, size), mems: players.map(() => ({})) }))
  const { best, submit } = useBestScore(`hwatu-memory-${size}`, true)
  const [newRecord, setNewRecord] = useState(false)
  const busy = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const { s } = w
  const over = isOver(s)
  const current = players[s.turn]
  const solo = players.length === 1 && !players[0].isAI

  const doFlip = (pos: number) =>
    setW((cur) => {
      const s2 = flipCard(cur.s, pos)
      if (s2 === cur.s) return cur
      const mems = cur.mems.map((m, i) => (players[i].isAI ? observe(m, s2, pos, difficulty, Math.random) : m))
      return { s: s2, mems }
    })

  // 자동 진행: 두 장 확인 후 정리, AI 차례
  useEffect(() => {
    if (over || busy.current) return
    const two = s.up.length === 2
    if (!two && !current.isAI) return
    busy.current = true
    ;(async () => {
      await sleep(two ? (isPair(s) ? 750 : 1100) : 600)
      if (!alive.current) return
      busy.current = false
      if (two) {
        setW((cur) => {
          if (cur.s !== s) return cur
          const s2 = settle(cur.s)
          return { s: s2, mems: cur.mems.map((m, i) => (players[i].isAI ? decay(m, s2, difficulty, Math.random) : m)) }
        })
      } else {
        const pos = aiPick(s, w.mems[s.turn])
        setW((cur) => {
          if (cur.s !== s) return cur
          const s2 = flipCard(cur.s, pos)
          return { s: s2, mems: cur.mems.map((m, i) => (players[i].isAI ? observe(m, s2, pos, difficulty, Math.random) : m)) }
        })
      }
    })()
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (over && solo) setNewRecord(submit(s.turns[0]))
  }, [over]) // eslint-disable-line react-hooks/exhaustive-deps

  if (over) {
    const order = players.map((p, i) => ({ p, i })).sort((a, b) => s.scores[b.i] - s.scores[a.i])
    const top = s.scores[order[0].i]
    const winners = order.filter(({ i }) => s.scores[i] === top)
    return (
      <Result
        title={solo ? `${s.turns[0]}번 만에 완성!` : winners.length > 1 ? '🤝 공동 우승!' : `🏆 ${winners[0].p.name} 승리!`}
        onAgain={onAgain}
      >
        {solo ? (
          <p>{newRecord ? '🎉 새로운 최고 기록!' : best != null ? `최고 기록: ${best}번` : ''}</p>
        ) : (
          <ol className="ranking">
            {order.map(({ p, i }) => (
              <li key={i}>
                {p.isAI ? '🤖 ' : ''}
                {p.name} — <strong>{s.scores[i]}쌍</strong>
              </li>
            ))}
          </ol>
        )}
        <button className="btn ghost" onClick={onReset}>
          설정 바꾸기
        </button>
      </Result>
    )
  }

  const humanTurn = !current.isAI && s.up.length < 2
  const remaining = s.gone.filter((g) => !g).length / 2

  return (
    <div className="hwm">
      {solo ? (
        <div className="status">
          시도 {s.turns[0]}번 · 남은 짝 {remaining}
          {best != null && <span className="hwm-best"> · 최고 {best}번</span>}
        </div>
      ) : (
        <>
          <div className="players-bar">
            {players.map((p, i) => (
              <span key={i} className={`player-chip ${i === s.turn ? 'active' : ''}`} style={{ borderLeft: `6px solid var(--p${i + 1})` }}>
                {p.isAI ? '🤖 ' : ''}
                {p.name} {s.scores[i]}쌍
              </span>
            ))}
          </div>
          <div className="status">
            {s.up.length === 2 ? (isPair(s) ? '🎉 짝!' : '아쉽다…') : current.isAI ? `🤖 ${current.name} 차례…` : `${current.name} 차례 · 같은 달 두 장을 찾으세요`}
          </div>
        </>
      )}
      <div className={`hwm-grid size-${size}`}>
        {s.cards.map((id, pos) => {
          if (s.gone[pos]) {
            const o = s.owner[pos]
            return <span key={pos} className="hwm-gone" style={o != null && !solo ? { background: `color-mix(in srgb, var(--p${o + 1}) 25%, transparent)` } : undefined} />
          }
          const up = s.up.includes(pos)
          return (
            <HwatuCard
              key={pos + (up ? 'u' : 'd')}
              card={id}
              faceDown={!up}
              width={60}
              highlight={up && s.up.length === 2 && isPair(s)}
              className={up ? 'hw-flip' : ''}
              onClick={humanTurn && !up ? () => doFlip(pos) : undefined}
            />
          )
        })}
      </div>
      {solo && <p className="hwm-hint muted">같은 달(같은 그림의 꽃) 카드 두 장을 찾아요. 한 달에 4장씩 있어요.</p>}
    </div>
  )
}
