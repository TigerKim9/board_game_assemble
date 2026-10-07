import { useEffect, useState } from 'react'
import { PlayingCard, cardNameKo, type Card } from '../../cards'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useBestScore, useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  TARGET,
  aiGuess,
  aiShouldStop,
  bestGuess,
  flip,
  judge,
  newShoe,
  odds,
  type Guess,
  type Outcome,
  type Shoe,
} from './logic'
import './highlow.css'

interface G {
  players: PlayerConfig[]
  diff: Difficulty
  shoe: Shoe
  scores: number[]
  turn: number
  pot: number
  streak: number
  last: {
    guess: Guess
    prev: Card
    card: Card
    outcome: Outcome
    reshuffled: boolean
    who: number
  } | null
  note: string
  over: boolean
}

const fresh = (players: PlayerConfig[], diff: Difficulty): G => ({
  players,
  diff,
  shoe: newShoe(),
  scores: players.map(() => 0),
  turn: 0,
  pot: 0,
  streak: 0,
  last: null,
  note: '',
  over: false,
})

export default function HighLow() {
  const [g, setG] = useState<G | null>(null)
  if (!g) {
    return (
      <PlayerSetup
        gameId="highlow"
        min={1}
        max={6}
        defaultCount={1}
        showDifficulty
        extra={
          <p className="muted highlow-setup-note">
            혼자 하면 연속으로 몇 번 맞히는지 기록에 도전해요. 여럿이면 먼저 {TARGET}점을 모으는 사람이 이겨요.
          </p>
        }
        onStart={(p, d) => setG(fresh(p, d))}
      />
    )
  }
  return <Board g={g} setG={setG} onExit={() => setG(null)} />
}

function Board({ g, setG, onExit }: { g: G; setG: (f: (g: G | null) => G | null) => void; onExit: () => void }) {
  const solo = g.players.length === 1 && !g.players[0].isAI
  const { best, submit } = useBestScore('highlow')
  const [newRecord, setNewRecord] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [helper, setHelper] = useStored('highlow:helper', false)
  const current = g.players[g.turn]

  const guess = (dir: Guess) => {
    setRevealing(true)
    setG((x) => {
      if (!x || x.over) return x
      const { shoe, card, reshuffled } = flip(x.shoe)
      const outcome = judge(dir, x.shoe.current, card)
      const name = x.players[x.turn].name
      const next: G = {
        ...x,
        shoe,
        last: {
          guess: dir,
          prev: x.shoe.current,
          card,
          outcome,
          reshuffled,
          who: x.turn,
        },
      }
      if (solo) {
        if (outcome === 'right') next.streak = x.streak + 1
        if (outcome === 'wrong') next.over = true
        next.note = outcome === 'right' ? '정답! 🎯' : outcome === 'same' ? '같은 숫자 — 통과!' : '아쉬워요! 😢'
        return next
      }
      if (outcome === 'right') {
        next.pot = x.pot + 1
        next.note = `${name} 정답! 이번 차례 ${next.pot}점`
      } else if (outcome === 'same') {
        next.note = '같은 숫자 — 통과!'
      } else {
        next.note = x.pot ? `${name} 틀렸어요! 모은 ${x.pot}점이 날아갔어요` : `${name} 틀렸어요!`
        next.pot = 0
        next.turn = (x.turn + 1) % x.players.length
      }
      return next
    })
    setTimeout(() => setRevealing(false), 550)
  }

  const bank = () =>
    setG((x) => {
      if (!x || x.pot === 0 || x.over) return x
      const scores = x.scores.map((s, i) => (i === x.turn ? s + x.pot : s))
      const won = scores[x.turn] >= TARGET
      return {
        ...x,
        scores,
        pot: 0,
        over: won,
        note: `${x.players[x.turn].name} ${x.pot}점 저장!`,
        turn: won ? x.turn : (x.turn + 1) % x.players.length,
      }
    })

  // solo record
  useEffect(() => {
    if (g.over && solo) setNewRecord(submit(g.streak))
  }, [g.over]) // eslint-disable-line react-hooks/exhaustive-deps

  // AI turns
  useEffect(() => {
    if (g.over || !current.isAI || revealing) return
    const id = setTimeout(() => {
      const { p } = bestGuess(g.shoe.deck, g.shoe.current, g.diff === 'hard')
      if (aiShouldStop(g.pot, g.scores[g.turn], p, g.diff)) bank()
      else guess(aiGuess(g.shoe.deck, g.shoe.current, g.diff))
    }, 950)
    return () => clearTimeout(id)
  }, [g, revealing]) // eslint-disable-line react-hooks/exhaustive-deps

  const humanTurn = !g.over && !current.isAI && !revealing
  const o = odds(g.shoe.deck, g.shoe.current)
  const winner = !solo && g.over ? g.turn : -1
  const recent = g.shoe.seen.slice(-13, -1)

  return (
    <div className="highlow">
      {g.over &&
        (solo ? (
          <Result title={`연속 ${g.streak}번 성공!`} onAgain={() => setG(() => fresh(g.players, g.diff))}>
            <p>{newRecord && g.streak > 0 ? '🎉 새로운 최고 기록!' : best != null ? `최고 기록: ${best}번` : ''}</p>
            <button className="btn ghost" onClick={onExit}>
              설정으로
            </button>
          </Result>
        ) : (
          <Result title={`🏆 ${g.players[winner].name} 승리!`} onAgain={() => setG(() => fresh(g.players, g.diff))}>
            <ol className="highlow-ranking">
              {g.players
                .map((p, i) => ({ p, s: g.scores[i] }))
                .sort((a, b) => b.s - a.s)
                .map(({ p, s }, i) => (
                  <li key={i}>
                    {p.isAI ? '🤖 ' : ''}
                    {p.name} — <strong>{s}점</strong>
                  </li>
                ))}
            </ol>
            <button className="btn ghost" onClick={onExit}>
              설정으로
            </button>
          </Result>
        ))}

      {!solo && (
        <div className="players-bar">
          {g.players.map((p, i) => (
            <span
              key={i}
              className={`player-chip ${i === g.turn && !g.over ? 'active' : ''}`}
              style={{
                borderColor: i === g.turn ? `var(--p${i + 1})` : undefined,
              }}
            >
              {p.isAI ? '🤖 ' : ''}
              {p.name} <strong>{g.scores[i]}</strong>
              {i === g.turn && g.pot > 0 && !g.over && <span className="highlow-pot"> +{g.pot}</span>}
            </span>
          ))}
        </div>
      )}

      <div className="highlow-table felt">
        <div className="status">
          {solo ? (
            <>
              연속 <strong className="highlow-streak">{g.streak}</strong>번
              {best != null && <span className="highlow-best"> · 최고 {best}</span>}
            </>
          ) : g.over ? (
            '게임 끝!'
          ) : current.isAI ? (
            `🤖 ${current.name} 생각 중…`
          ) : (
            `${current.name} 차례 (목표 ${TARGET}점)`
          )}
        </div>
        <div className="highlow-cards">
          <div className="highlow-prev">
            {g.last ? <PlayingCard card={g.last.prev} width={64} disabled /> : <div className="highlow-prev-empty" />}
            {g.last && (
              <span className={`highlow-arrow ${g.last.outcome}`}>{g.last.guess === 'higher' ? '▲' : '▼'}</span>
            )}
          </div>
          <div className={`highlow-current ${revealing ? 'flip' : ''}`} key={g.shoe.current.id + g.shoe.deck.length}>
            <PlayingCard card={g.shoe.current} width={118} variant="full" />
          </div>
        </div>
        <div className={`highlow-note ${g.last?.outcome ?? ''}`} aria-live="polite">
          {g.last?.reshuffled && '🔀 카드를 다시 섞었어요. '}
          {g.note || '다음 카드가 더 높을까요, 낮을까요? (A가 가장 높고 2가 가장 낮아요)'}
        </div>
        {!g.over && (
          <div className="highlow-buttons">
            <button className="btn accent big" disabled={!humanTurn} onClick={() => guess('higher')}>
              ▲ 높다
            </button>
            <button className="btn big highlow-low" disabled={!humanTurn} onClick={() => guess('lower')}>
              ▼ 낮다
            </button>
          </div>
        )}
        {!solo && !g.over && (
          <button className="btn big highlow-bank" disabled={!humanTurn || g.pot === 0} onClick={bank}>
            ✋ 멈추고 {g.pot}점 저장하기
          </button>
        )}
      </div>

      <div className="highlow-info card-panel">
        <div className="highlow-info-row">
          <span>남은 카드 {g.shoe.deck.length}장</span>
          <label className="toggle">
            <input type="checkbox" checked={helper} onChange={(e) => setHelper(e.target.checked)} /> 카운팅 도우미
          </label>
        </div>
        {helper && (
          <p className="highlow-odds">
            {cardNameKo(g.shoe.current)}보다 높은 카드 <strong>{o.higher}</strong>장 · 낮은 카드{' '}
            <strong>{o.lower}</strong>장 · 같은 숫자 <strong>{o.same}</strong>장
          </p>
        )}
        {recent.length > 0 && (
          <div className="highlow-history" aria-label="지나간 카드">
            {recent.map((c) => (
              <PlayingCard key={c.id} card={c} width={30} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
