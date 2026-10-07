import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { sleep } from '../../lib/random'
import { useBestScore, useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  SIZES,
  aiFirst,
  aiSecond,
  allMatched,
  fade,
  isMatch,
  makeDeck,
  observe,
  pairCounts,
  pairsFor,
  type Card,
  type GridSize,
  type Memory,
} from './logic'
import './memory.css'

interface Game {
  players: PlayerConfig[]
  difficulty: Difficulty
  size: GridSize
}

export default function MemoryGame() {
  const [game, setGame] = useState<Game | null>(null)
  const [sizeId, setSizeId] = useStored('memory:size', '4x4')
  const [round, setRound] = useState(0)
  if (!game) {
    return (
      <PlayerSetup
        gameId="memory"
        min={1}
        max={4}
        defaultCount={1}
        showDifficulty
        extra={
          <div className="setup-row memory-size-row">
            <span>판 크기</span>
            <div className="segmented memory-sizes">
              {SIZES.map((s) => (
                <button key={s.id} className={sizeId === s.id ? 'active' : ''} onClick={() => setSizeId(s.id)}>
                  {s.cols}×{s.rows}
                </button>
              ))}
            </div>
          </div>
        }
        onStart={(players, difficulty) =>
          setGame({ players, difficulty, size: SIZES.find((s) => s.id === sizeId) ?? SIZES[1] })
        }
      />
    )
  }
  return (
    <Board
      key={round}
      game={game}
      onAgain={() => setRound((r) => r + 1)}
      onReset={() => setGame(null)}
    />
  )
}

function Board({ game, onAgain, onReset }: { game: Game; onAgain: () => void; onReset: () => void }) {
  const { players, difficulty, size } = game
  const [cards, setCards] = useState<Card[]>(() => makeDeck(pairsFor(size)))
  const [flipped, setFlipped] = useState<number[]>([])
  const [turn, setTurn] = useState(0)
  const [moves, setMoves] = useState(0)
  const [lastMatch, setLastMatch] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const memories = useRef<Memory[]>(players.map(() => ({})))
  const alive = useRef(true)
  const aiRunning = useRef(false)
  const solo = players.length === 1 && !players[0].isAI
  const { best, submit } = useBestScore(`memory-${size.id}`, true)
  const [newRecord, setNewRecord] = useState(false)
  const done = allMatched(cards)
  const current = players[turn]

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const seeCard = (idx: number, face: string) => {
    memories.current = memories.current.map((m, i) => (players[i].isAI ? observe(m, idx, face, difficulty) : m))
  }

  /** Resolve a two-card attempt. Returns true when the same player goes again. */
  const resolve = async (a: number, b: number, deck: Card[]): Promise<{ deck: Card[]; again: boolean }> => {
    setBusy(true)
    await sleep(isMatch(deck, a, b) ? 550 : 950)
    if (!alive.current) return { deck, again: false }
    setMoves((m) => m + 1)
    if (isMatch(deck, a, b)) {
      const next = deck.map((c, i) => (i === a || i === b ? { ...c, matched: true, owner: turn } : c))
      setCards(next)
      setFlipped([])
      setLastMatch(a)
      setBusy(false)
      return { deck: next, again: true }
    }
    setFlipped([])
    memories.current = memories.current.map((m, i) => (players[i].isAI ? fade(m, deck, difficulty) : m))
    setBusy(false)
    return { deck, again: false }
  }

  const nextTurn = () => setTurn((t) => (t + 1) % players.length)

  const flipHuman = async (idx: number) => {
    if (busy || current.isAI || done) return
    if (cards[idx].matched || flipped.includes(idx) || flipped.length >= 2) return
    seeCard(idx, cards[idx].face)
    const next = [...flipped, idx]
    setFlipped(next)
    if (next.length === 2) {
      const r = await resolve(next[0], next[1], cards)
      if (!r.again && alive.current) nextTurn()
    }
  }

  // AI turns
  useEffect(() => {
    if (done || !current.isAI || aiRunning.current) return
    aiRunning.current = true
    ;(async () => {
      let deck = cards
      let again = true
      while (again && alive.current && !allMatched(deck)) {
        await sleep(650)
        if (!alive.current) break
        const mem = memories.current[turn]
        const a = aiFirst(deck, mem)
        seeCard(a, deck[a].face)
        setFlipped([a])
        await sleep(700)
        if (!alive.current) break
        const b = aiSecond(deck, memories.current[turn], a)
        seeCard(b, deck[b].face)
        setFlipped([a, b])
        const r = await resolve(a, b, deck)
        deck = r.deck
        again = r.again || players.length === 1
      }
      aiRunning.current = false
      if (alive.current && !allMatched(deck)) nextTurn()
    })()
  }, [turn, done]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (done && solo) {
      const isNew = best == null || moves < best
      submit(moves)
      setNewRecord(isNew)
    }
  }, [done]) // eslint-disable-line react-hooks/exhaustive-deps

  const pairs = pairCounts(cards, players.length)
  const top = Math.max(...pairs)
  const winners = players.filter((_, i) => pairs[i] === top)

  return (
    <>
      {done ? (
        <Result
          title={
            solo
              ? `🎉 ${moves}번 만에 완성!`
              : winners.length > 1
                ? `🤝 ${winners.map((w) => w.name).join(', ')} 공동 우승!`
                : `🏆 ${winners[0].name} 승리!`
          }
          onAgain={onAgain}
        >
          {solo ? (
            <p>{newRecord ? '🌟 새로운 최고 기록!' : best != null ? `최고 기록: ${best}번` : ''}</p>
          ) : (
            <ol className="memory-ranking">
              {players
                .map((p, i) => ({ p, i, n: pairs[i] }))
                .sort((x, y) => y.n - x.n)
                .map(({ p, i, n }) => (
                  <li key={i}>
                    {p.isAI ? '🤖 ' : ''}
                    {p.name} — <strong>{n}쌍</strong>
                  </li>
                ))}
            </ol>
          )}
          <button className="btn ghost" onClick={onReset}>
            설정 바꾸기
          </button>
        </Result>
      ) : (
        <div className="status">
          {solo ? (
            <>
              시도 {moves}번 · 남은 짝 {pairsFor(size) - pairs[0]}
              {best != null && <span className="memory-best"> · 최고 {best}번</span>}
            </>
          ) : current.isAI ? (
            `🤖 ${current.name} 차례…`
          ) : (
            `${current.name} 차례 — 카드 두 장을 뒤집어요`
          )}
        </div>
      )}

      {!solo && (
        <div className="players-bar">
          {players.map((p, i) => (
            <span
              key={i}
              className={`player-chip memory-chip ${i === turn && !done ? 'active' : ''}`}
              style={{ borderColor: i === turn && !done ? `var(--p${i + 1})` : undefined }}
            >
              <i className="memory-dot" style={{ background: `var(--p${i + 1})` }} />
              {p.isAI ? '🤖 ' : ''}
              {p.name} {pairs[i]}
            </span>
          ))}
        </div>
      )}

      <div
        className="memory-grid"
        style={{ gridTemplateColumns: `repeat(${size.cols}, minmax(0, 1fr))`, maxWidth: size.cols * 92 }}
      >
        {cards.map((c, i) => {
          const up = c.matched || flipped.includes(i)
          const justMatched = c.matched && lastMatch != null && cards[lastMatch].face === c.face
          return (
            <button
              key={i}
              className={`memory-card ${up ? 'up' : ''} ${c.matched ? 'matched' : ''} ${justMatched ? 'pop' : ''}`}
              onClick={() => flipHuman(i)}
              disabled={c.matched}
              aria-label={up ? c.face : `카드 ${i + 1}`}
            >
              <span className="memory-inner">
                <span className="memory-back" />
                <span
                  className="memory-front"
                  style={c.owner != null && !solo ? { boxShadow: `inset 0 0 0 3px var(--p${c.owner + 1})` } : undefined}
                >
                  {c.face}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}
