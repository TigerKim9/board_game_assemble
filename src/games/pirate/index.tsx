import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { sleep } from '../../lib/random'
import { useStored } from '../../lib/storage'
import type { PlayerConfig } from '../../lib/types'
import { SLOT_OPTIONS, aiChoose, createBarrel, gridColumns, nextTurn, remaining, stab, type Barrel, type PopMode } from './logic'
import './pirate.css'

const COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)', 'var(--p6)']

interface Settings {
  slots: number
  mode: PopMode
}

interface Round {
  barrel: Barrel
  stabbedBy: (number | null)[]
  turn: number
  phase: 'pick' | 'stabbing' | 'popped' | 'over'
  popper: number | null
}

const freshRound = (slots: number, first: number): Round => ({
  barrel: createBarrel(slots),
  stabbedBy: Array(slots).fill(null),
  turn: first,
  phase: 'pick',
  popper: null,
})

export default function Pirate() {
  const [players, setPlayers] = useState<PlayerConfig[] | null>(null)
  const [slots, setSlots] = useStored<number>('pirate:slots', 16)
  const [mode, setMode] = useStored<PopMode>('pirate:mode', 'lose')

  if (!players) {
    return (
      <PlayerSetup
        gameId="pirate"
        min={2}
        max={6}
        defaultCount={3}
        onStart={(p) => setPlayers(p)}
        extra={
          <>
            <div className="setup-row">
              <span>구멍 수</span>
              <div className="segmented">
                {SLOT_OPTIONS.map((s) => (
                  <button key={s} className={slots === s ? 'active' : ''} onClick={() => setSlots(s)}>
                    {s}개
                  </button>
                ))}
              </div>
            </div>
            <div className="setup-row">
              <span>해적이 튀어나오면</span>
              <div className="segmented">
                <button className={mode === 'lose' ? 'active' : ''} onClick={() => setMode('lose')}>
                  패배
                </button>
                <button className={mode === 'win' ? 'active' : ''} onClick={() => setMode('win')}>
                  승리
                </button>
              </div>
            </div>
          </>
        }
      />
    )
  }
  return <Table players={players} settings={{ slots, mode }} onReset={() => setPlayers(null)} />
}

function Table({ players, settings, onReset }: { players: PlayerConfig[]; settings: Settings; onReset: () => void }) {
  const [round, setRound] = useState<Round>(() => freshRound(settings.slots, 0))
  const [tally, setTally] = useState<number[]>(() => players.map(() => 0))
  const [roundNo, setRoundNo] = useState(1)
  const busy = useRef(false)
  const aiRunning = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const { barrel, turn, phase, popper, stabbedBy } = round
  const current = players[turn]
  const left = remaining(barrel)

  const doStab = async (slot: number) => {
    if (busy.current || round.phase !== 'pick') return
    const r = stab(round.barrel, slot)
    if (!r) return
    busy.current = true
    setRound((s) => ({
      ...s,
      barrel: r.barrel,
      phase: 'stabbing',
      stabbedBy: s.stabbedBy.map((b, i) => (i === slot ? s.turn : b)),
    }))
    await sleep(r.popped ? 750 : 550)
    if (!alive.current) return
    if (r.popped) {
      setRound((s) => ({ ...s, phase: 'popped', popper: s.turn }))
      await sleep(1500)
      if (!alive.current) return
      setTally((t) => t.map((v, i) => (i === round.turn ? v + 1 : v)))
      setRound((s) => ({ ...s, phase: 'over' }))
    } else {
      setRound((s) => ({ ...s, phase: 'pick', turn: nextTurn(s.turn, players.length) }))
    }
    busy.current = false
  }

  // AI turns
  useEffect(() => {
    if (phase !== 'pick' || !current.isAI || aiRunning.current) return
    aiRunning.current = true
    ;(async () => {
      await sleep(900)
      aiRunning.current = false
      if (!alive.current) return
      doStab(aiChoose(barrel))
    })()
  }, [turn, phase, roundNo]) // eslint-disable-line react-hooks/exhaustive-deps

  const popped = phase === 'popped' || phase === 'over'
  const again = () => {
    // The popper starts the next round (a little revenge chance).
    setRound(freshRound(settings.slots, popper ?? 0))
    setRoundNo((r) => r + 1)
  }
  const cols = gridColumns(settings.slots)
  const label = settings.mode === 'lose' ? '패배' : '승리'
  const tallyLabel = settings.mode === 'lose' ? '벌칙' : '승리'

  return (
    <>
      <div className="players-bar">
        {players.map((p, i) => (
          <span
            key={i}
            className={`player-chip ${i === turn && !popped ? 'active' : ''}`}
            style={{ borderColor: i === turn && !popped ? COLORS[i] : undefined }}
          >
            <span className="pirate-chip-dot" style={{ background: COLORS[i] }} />
            {p.isAI ? '🤖 ' : ''}
            {p.name}
            {tally[i] > 0 && <small className="pirate-tally"> {tallyLabel} {tally[i]}</small>}
          </span>
        ))}
      </div>

      <div className="pirate-stage felt">
        <div className="status">
          {popped
            ? `🏴‍☠️ ${players[popper!].name} — 해적이 튀어나왔다!`
            : current.isAI
              ? `🤖 ${current.name}이(가) 고르는 중…`
              : `${current.name}님, 칼을 꽂을 구멍을 고르세요`}
        </div>
        <div className="pirate-odds">
          {popped ? `${label}!` : `남은 구멍 ${left}개 · 튀어나올 확률 1/${left}`}
        </div>

        <div className={`pirate-barrel-wrap ${phase === 'stabbing' ? 'shake' : ''}`}>
          <div className={`pirate-head ${popped ? 'flying' : ''}`} aria-hidden>
            <PirateFace scared={phase === 'stabbing'} />
          </div>
          <div className="pirate-barrel">
            <div className="pirate-slots" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
              {barrel.stabbed.map((s, i) => (
                <button
                  key={i}
                  className={`pirate-slot ${s ? 'stabbed' : ''}`}
                  style={stabbedBy[i] != null ? { ['--c' as string]: COLORS[stabbedBy[i]!] } : undefined}
                  disabled={s || phase !== 'pick' || current.isAI}
                  onClick={() => doStab(i)}
                  aria-label={s ? `${i + 1}번 구멍 (꽂힘)` : `${i + 1}번 구멍`}
                >
                  {s && <span className="pirate-sword">🗡️</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {phase === 'over' && popper != null && (
        <Result
          title={settings.mode === 'lose' ? `😱 ${players[popper].name} 당첨! (벌칙)` : `🎉 ${players[popper].name} 승리!`}
          onAgain={again}
          againLabel="한 판 더"
        >
          <p className="muted">
            {settings.slots - left}번째 칼에서 해적이 튀어나왔어요. 다음 판은 {players[popper].name}부터 시작해요.
          </p>
          <ol className="pirate-ranking">
            {players
              .map((p, i) => ({ p, i, t: tally[i] }))
              .sort((a, b) => b.t - a.t)
              .map(({ p, i, t }) => (
                <li key={i}>
                  {p.name} — {tallyLabel} <strong>{t}회</strong>
                </li>
              ))}
          </ol>
          <button className="btn ghost" onClick={onReset}>
            인원·설정 바꾸기
          </button>
        </Result>
      )}
    </>
  )
}

function PirateFace({ scared }: { scared: boolean }) {
  return (
    <svg viewBox="0 0 100 100" width="96" height="96">
      {/* hat */}
      <path d="M12 44 Q50 2 88 44 Q50 34 12 44 Z" className="pirate-hat" />
      <circle cx="50" cy="28" r="6" fill="#fff" />
      <path d="M46 25 l8 6 M54 25 l-8 6" stroke="#222" strokeWidth="2" />
      {/* face */}
      <ellipse cx="50" cy="62" rx="27" ry="26" className="pirate-skin" />
      <path d="M18 46 Q50 36 82 46 L80 52 Q50 43 20 52 Z" fill="#c0392b" />
      {/* eye patch */}
      <path d="M22 50 L78 64" stroke="#222" strokeWidth="2.5" />
      <ellipse cx="62" cy="59" rx="8" ry="7" fill="#222" />
      {/* eye */}
      <circle cx="38" cy="58" r={scared ? 5.5 : 4} fill="#fff" stroke="#222" strokeWidth="1.5" />
      <circle cx="38" cy="58" r={scared ? 2 : 2.4} fill="#222" />
      {/* nose + mustache */}
      <ellipse cx="50" cy="68" rx="4" ry="3.5" fill="#d98c6a" />
      <path d="M50 73 Q40 70 32 76 Q42 78 50 75 Q58 78 68 76 Q60 70 50 73 Z" fill="#5a3a22" />
      {scared ? <ellipse cx="50" cy="81" rx="5" ry="4" fill="#7a1f1f" /> : <path d="M42 80 Q50 85 58 80" stroke="#7a1f1f" strokeWidth="2.5" fill="none" />}
    </svg>
  )
}
