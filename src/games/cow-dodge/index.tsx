import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { sleep } from '../../lib/random'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  END_SCORE,
  HAND_SIZE,
  aiChooseCard,
  aiChooseRow,
  deal,
  placeCard,
  sumHeads,
  takeRow,
  targetRow,
} from './logic'
import { CowCard, CowRows } from './parts'
import './cow-dodge.css'

interface Game {
  players: PlayerConfig[]
  difficulty: Difficulty
}

export default function CowDodge() {
  const [game, setGame] = useState<Game | null>(null)
  const [round, setRound] = useState(0)
  if (!game) {
    return (
      <PlayerSetup
        gameId="cow-dodge"
        min={2}
        max={10}
        defaultCount={4}
        showDifficulty
        onStart={(players, difficulty) => setGame({ players, difficulty })}
      />
    )
  }
  return <Table key={round} game={game} onAgain={() => setRound((r) => r + 1)} onReset={() => setGame(null)} />
}

type Phase = 'choose' | 'resolve' | 'pickRow' | 'roundEnd' | 'over'

interface Play {
  player: number
  card: number
}

interface G {
  rows: number[][]
  hands: number[][]
  total: number[]
  roundPen: number[]
  seen: number[]
  round: number
  turn: number
  phase: Phase
  picks: (number | null)[]
  /** Human seat currently choosing (hot-seat), or -1. */
  chooser: number
  cover: boolean
  reveal: Play[]
  placing: number
  takeMsg: { player: number; cards: number[] } | null
}

function newRound(players: PlayerConfig[], total: number[], round: number): G {
  const d = deal(players.length)
  const humans = players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0)
  return {
    rows: d.rows,
    hands: d.hands,
    total,
    roundPen: players.map(() => 0),
    seen: [],
    round,
    turn: 0,
    phase: 'choose',
    picks: players.map(() => null),
    chooser: humans[0] ?? -1,
    cover: humans.length > 1,
    reveal: [],
    placing: -1,
    takeMsg: null,
  }
}

function Table({ game, onAgain, onReset }: { game: Game; onAgain: () => void; onReset: () => void }) {
  const { players, difficulty } = game
  const humans = players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0)
  const [g, setG] = useState<G>(() => newRound(players, players.map(() => 0), 1))
  const gRef = useRef(g)
  gRef.current = g
  const [selected, setSelected] = useState<number | null>(null)
  const alive = useRef(true)
  const running = useRef(false)
  const rowResolver = useRef<((row: number) => void) | null>(null)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const set = (patch: Partial<G>) => {
    gRef.current = { ...gRef.current, ...patch }
    setG(gRef.current)
  }

  const runTurn = async (picks: number[]) => {
    if (running.current) return
    running.current = true
    let { rows, hands, roundPen, total } = gRef.current
    const plays: Play[] = picks.map((card, player) => ({ player, card })).sort((a, b) => a.card - b.card)
    hands = hands.map((h, i) => h.filter((c) => c !== picks[i]))
    set({ phase: 'resolve', reveal: plays, placing: -1, hands, takeMsg: null, picks: picks })
    await sleep(1300)
    for (let k = 0; k < plays.length; k++) {
      if (!alive.current) return
      const { player, card } = plays[k]
      set({ placing: k, takeMsg: null })
      await sleep(450)
      let taken: number[] = []
      if (targetRow(rows, card) < 0) {
        let row: number
        if (players[player].isAI) {
          await sleep(500)
          row = aiChooseRow(rows, difficulty)
        } else {
          set({ phase: 'pickRow' })
          row = await new Promise<number>((res) => {
            rowResolver.current = res
          })
          rowResolver.current = null
          set({ phase: 'resolve' })
        }
        const r = takeRow(rows, row, card)
        rows = r.rows
        taken = r.taken
      } else {
        const r = placeCard(rows, card)
        rows = r.rows
        taken = r.taken
      }
      if (taken.length) {
        const pen = sumHeads(taken)
        roundPen = roundPen.map((v, i) => (i === player ? v + pen : v))
        total = total.map((v, i) => (i === player ? v + pen : v))
        set({ rows, roundPen, total, takeMsg: { player, cards: taken } })
        await sleep(1300)
      } else {
        set({ rows })
        await sleep(350)
      }
    }
    if (!alive.current) return
    const seen = [...gRef.current.seen, ...picks]
    const turn = gRef.current.turn + 1
    running.current = false
    setSelected(null)
    if (turn >= HAND_SIZE) {
      set({ seen, turn, phase: total.some((t) => t >= END_SCORE) ? 'over' : 'roundEnd', placing: -1, takeMsg: null })
      return
    }
    set({
      seen,
      turn,
      phase: 'choose',
      picks: players.map(() => null),
      chooser: humans[0] ?? -1,
      cover: humans.length > 1,
      reveal: [],
      placing: -1,
      takeMsg: null,
    })
  }

  const aiPicks = (picks: (number | null)[]): number[] => {
    const { rows, hands, seen } = gRef.current
    const seenSet = new Set(seen)
    return picks.map((p, i) =>
      p != null ? p : aiChooseCard(rows, hands[i], players.length - 1, seenSet, difficulty),
    )
  }

  const confirmPick = () => {
    if (selected == null || g.phase !== 'choose' || g.chooser < 0) return
    const picks = g.picks.slice()
    picks[g.chooser] = selected
    setSelected(null)
    const pos = humans.indexOf(g.chooser)
    const nextHuman = humans[pos + 1]
    if (nextHuman !== undefined) {
      set({ picks, chooser: nextHuman, cover: true })
      return
    }
    set({ picks, chooser: -1 })
    void runTurn(aiPicks(picks))
  }

  // All-AI table: start each turn automatically.
  useEffect(() => {
    if (g.phase !== 'choose' || humans.length > 0 || running.current) return
    const id = setTimeout(() => {
      if (alive.current) void runTurn(aiPicks(gRef.current.picks))
    }, 600)
    return () => clearTimeout(id)
  }, [g.phase, g.turn]) // eslint-disable-line react-hooks/exhaustive-deps

  const nextRound = () => {
    setSelected(null)
    set(newRound(players, gRef.current.total, gRef.current.round + 1))
  }

  const { rows, hands, total, roundPen, phase, reveal, placing, takeMsg, chooser, cover } = g
  const current = reveal[placing]

  if (phase === 'over') {
    const ranking = players.map((p, i) => ({ p, i, t: total[i] })).sort((a, b) => a.t - b.t)
    const winners = ranking.filter((r) => r.t === ranking[0].t)
    return (
      <Result
        title={winners.length > 1 ? `🤝 ${winners.map((w) => w.p.name).join(', ')} 공동 우승!` : `🏆 ${winners[0].p.name} 승리!`}
        onAgain={onAgain}
      >
        <p className="muted">
          누군가 소 {END_SCORE}마리를 넘겼어요! 소를 가장 적게 모은 사람이 이겨요.
        </p>
        <ol className="cd-ranking">
          {ranking.map(({ p, i, t }) => (
            <li key={i} className={t >= END_SCORE ? 'cd-bust' : ''}>
              {p.isAI ? '🤖 ' : ''}
              {p.name} — <strong>🐮 {t}</strong>
            </li>
          ))}
        </ol>
        <button className="btn ghost" onClick={onReset}>
          인원 바꾸기
        </button>
      </Result>
    )
  }

  if (phase === 'choose' && cover && chooser >= 0) {
    return (
      <div className="cd-cover card-panel">
        <div className="cd-cover-emoji">🐮</div>
        <h2>{players[chooser].name} 차례</h2>
        <p className="muted">다른 사람은 보지 않게 화면을 넘겨주세요</p>
        <button className="btn primary big" onClick={() => set({ cover: false })}>
          준비됐어요
        </button>
      </div>
    )
  }

  const statusText = (() => {
    if (phase === 'roundEnd') return `${g.round}라운드 끝!`
    if (phase === 'pickRow') return `${current?.card}은(는) 너무 작아요! 가져갈 줄을 누르세요`
    if (phase === 'resolve') {
      if (!current) return '카드 공개!'
      if (takeMsg) return `${players[takeMsg.player].name} 소 ${sumHeads(takeMsg.cards)}마리 획득 😱`
      return `${players[current.player].name}의 ${current.card} 놓는 중…`
    }
    if (chooser >= 0) return `${players[chooser].name}: 낼 카드를 고르세요`
    return '컴퓨터가 고르는 중…'
  })()

  const myHandSeat = phase === 'choose' && chooser >= 0 ? chooser : humans.length === 1 ? humans[0] : -1

  return (
    <>
      <div className="cd-top">
        <span className="cd-round">
          {g.round}라운드 · {Math.min(g.turn + 1, HAND_SIZE)}/{HAND_SIZE}턴
        </span>
        <span className="muted cd-goal">🐮 {END_SCORE}마리 되면 끝</span>
      </div>
      <div className="cd-board felt">
        <div className="status cd-status">{statusText}</div>
        <CowRows
          rows={rows}
          pickable={phase === 'pickRow'}
          hit={current && phase === 'resolve' && !takeMsg ? targetRow(rows, current.card) : -1}
          onPick={(i) => rowResolver.current?.(i)}
        />
        {reveal.length > 0 && (
          <div className="cd-reveal">
            {reveal.map((p, k) => (
              <div key={p.player} className={`cd-reveal-item ${k === placing ? 'now' : ''} ${k < placing ? 'done' : ''}`}>
                <CowCard value={p.card} small flip />
                <span className="cd-reveal-name" style={{ color: `var(--p${(p.player % 6) + 1})` }}>
                  {players[p.player].name}
                </span>
              </div>
            ))}
          </div>
        )}
        {takeMsg && (
          <div className="cd-take">
            {players[takeMsg.player].name}님이 소 떼를 데려갔어요! −{sumHeads(takeMsg.cards)}
          </div>
        )}
      </div>

      {phase === 'roundEnd' && (
        <div className="card-panel cd-round-end">
          <h3>{g.round}라운드 결과</h3>
          <ul>
            {players.map((p, i) => (
              <li key={i}>
                <span>{p.isAI ? '🤖 ' : ''}{p.name}</span>
                <span>+{roundPen[i]}</span>
                <strong>🐮 {total[i]}</strong>
              </li>
            ))}
          </ul>
          <button className="btn primary big" onClick={nextRound}>
            다음 라운드
          </button>
        </div>
      )}

      {myHandSeat >= 0 && phase !== 'roundEnd' && (
        <div className="cd-hand-wrap card-panel">
          <div className="cd-hand-title">
            {players[myHandSeat].name}의 패
            {phase === 'choose' && chooser === myHandSeat && <span className="muted"> — 카드를 눌러 고르세요</span>}
          </div>
          <div className="cd-hand">
            {hands[myHandSeat].map((c) => (
              <CowCard
                key={c}
                value={c}
                selected={selected === c}
                onClick={phase === 'choose' && chooser === myHandSeat ? () => setSelected(c) : undefined}
              />
            ))}
          </div>
          {phase === 'choose' && chooser === myHandSeat && (
            <button className="btn accent big" disabled={selected == null} onClick={confirmPick}>
              {selected == null ? '카드를 고르세요' : `${selected} 내기`}
            </button>
          )}
        </div>
      )}

      <ul className="cd-scores">
        {players.map((p, i) => (
          <li key={i} style={{ ['--pc' as string]: `var(--p${(i % 6) + 1})` }} className={takeMsg?.player === i ? 'ouch' : ''}>
            <span className="cd-sname">
              {p.isAI ? '🤖 ' : ''}
              {p.name}
            </span>
            <span className="cd-spick">{phase === 'choose' && !p.isAI && g.picks[i] != null ? '✅' : ''}</span>
            <strong>🐮 {total[i]}</strong>
            <span className="cd-bar">
              <i style={{ width: `${Math.min(100, (total[i] / END_SCORE) * 100)}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
