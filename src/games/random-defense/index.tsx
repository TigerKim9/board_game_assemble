import { useCallback, useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useBestScore } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  AI_COIN_RATE,
  AI_INTERVAL,
  BOSS_EVERY,
  CLASS_NAMES,
  FIELD_H,
  FIELD_W,
  INFO,
  LIMIT,
  MAX_TIER,
  MAX_UPGRADE,
  TIER_COLORS,
  TYPES,
  act,
  aiAct,
  canMerge,
  canSummon,
  canUpgrade,
  fmt,
  isBossWave,
  newGame,
  slotAt,
  step,
  summon,
  summonCost,
  unitDamage,
  upgrade,
  upgradeCost,
  type Game,
} from './logic'
import { drawSide, type UiState } from './render'
import './random-defense.css'

interface Cfg {
  players: PlayerConfig[]
  difficulty: Difficulty
}

export default function RandomDefense() {
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [round, setRound] = useState(0)
  if (!cfg) {
    return (
      <PlayerSetup
        gameId="random-defense"
        min={1}
        max={2}
        defaultCount={1}
        showDifficulty
        startLabel="수호 시작!"
        extra={<Roster />}
        onStart={(players, difficulty) => setCfg({ players, difficulty })}
      />
    )
  }
  return <Match key={round} cfg={cfg} onAgain={() => setRound((r) => r + 1)} onReset={() => setCfg(null)} />
}

function Roster() {
  return (
    <div className="rd-roster">
      <p className="muted">
        1명: 몇 웨이브까지 버티는지 도전 · 2명: 위아래로 나눠 대전 (컴퓨터 또는 친구와 한 폰으로)
      </p>
      <ul>
        {TYPES.map((t) => (
          <li key={t}>
            <span className="rd-roster-emoji">{INFO[t].emoji}</span>
            <b>{INFO[t].name}</b>
            <span className="muted">{INFO[t].role}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const DT = 1 / 60

function Match({ cfg, onAgain, onReset }: { cfg: Cfg; onAgain: () => void; onReset: () => void }) {
  const { players, difficulty } = cfg
  const versus = players.length > 1
  const gameRef = useRef<Game>(null as unknown as Game)
  if (!gameRef.current) {
    const g = newGame(players.length)
    if (versus) players.forEach((p, i) => p.isAI && (g.sides[i].coinRate = AI_COIN_RATE[difficulty]))
    gameRef.current = g
  }
  const uiRef = useRef<UiState[]>(players.map(() => ({ sel: -1, drag: null })))
  const canvases = useRef<(HTMLCanvasElement | null)[]>([])
  const pausedRef = useRef(false)
  const speedRef = useRef(1)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [, setTick] = useState(0)
  const [over, setOver] = useState(false)
  const { best, submit } = useBestScore('random-defense')
  const [newRecord, setNewRecord] = useState(false)
  const recorded = useRef(false)

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const pause = (v: boolean) => {
    if (gameRef.current.over) return
    pausedRef.current = v
    setPaused(v)
  }

  // Which side sits at the bottom: the first human (so a lone human is always at the bottom).
  const bottom = Math.max(0, players.findIndex((p) => !p.isAI))
  const top = versus ? 1 - bottom : -1
  const bothHuman = versus && players.every((p) => !p.isAI)

  // main loop
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let hudT = 0
    const aiT = players.map(() => 0)
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const g = gameRef.current
      const elapsed = Math.min(0.1, (now - last) / 1000)
      last = now
      if (!pausedRef.current && !g.over) {
        acc += elapsed * speedRef.current
        while (acc >= DT) {
          acc -= DT
          players.forEach((p, i) => {
            if (!p.isAI) return
            aiT[i] += DT
            if (aiT[i] >= AI_INTERVAL[difficulty]) {
              aiT[i] = 0
              aiAct(g.sides[i], difficulty, Math.random)
            }
          })
          step(g, DT, Math.random)
          if (g.over) break
        }
        hudT += elapsed
        if (hudT > 0.12 || g.over) {
          hudT = 0
          refresh()
        }
        if (g.over) setOver(true)
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvases.current.forEach((c, i) => {
        if (!c) return
        const w = c.clientWidth
        if (!w) return
        const bw = Math.round(w * dpr)
        const bh = Math.round((w * FIELD_H * dpr) / FIELD_W)
        if (c.width !== bw || c.height !== bh) {
          c.width = bw
          c.height = bh
        }
        const ctx = c.getContext('2d')
        if (ctx) drawSide(ctx, w, dpr, g.sides[i], uiRef.current[i], now / 1000)
      })
    }
    raf = requestAnimationFrame(frame)
    const onVis = () => {
      if (document.hidden && !gameRef.current.over) {
        pausedRef.current = true
        setPaused(true)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // record (solo human)
  useEffect(() => {
    if (!over || versus || players[0].isAI || recorded.current) return
    recorded.current = true
    setNewRecord(submit(gameRef.current.wave))
  }, [over]) // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard (solo / bottom player)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const g = gameRef.current
      if (e.key === 'p' || e.key === 'Escape') {
        pause(!pausedRef.current)
        return
      }
      if (pausedRef.current || g.over || players[bottom].isAI) return
      const side = g.sides[bottom]
      if (e.key === ' ' || e.key === 's') {
        e.preventDefault()
        summon(side, Math.random)
      } else if (e.key >= '1' && e.key <= '3') upgrade(side, Number(e.key) - 1)
      else return
      refresh()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const g = gameRef.current

  if (over) {
    const s = g.sides[0]
    const reason = (i: number) =>
      g.sides[i].loseReason === 'boss' ? '보스를 제한 시간 안에 처치하지 못했어요' : `몬스터가 ${LIMIT}마리 가득 찼어요`
    return (
      <Result
        title={
          !versus
            ? `웨이브 ${g.wave}에서 쓰러졌어요`
            : g.winner == null || g.winner < 0
              ? '무승부!'
              : `🏆 ${players[g.winner].name} 승리!`
        }
        onAgain={onAgain}
      >
        {!versus ? (
          <>
            <p className="muted">{reason(0)}</p>
            <p>
              처치 <b>{s.kills}</b>마리 · 소환 <b>{s.summons}</b>회
            </p>
            {!players[0].isAI && (
              <p>{newRecord ? '🎉 새로운 최고 기록!' : best != null ? `최고 기록: 웨이브 ${best}` : ''}</p>
            )}
          </>
        ) : (
          <>
            {g.winner != null && g.winner >= 0 ? (
              <p className="muted">
                {players[1 - g.winner].name}: {reason(1 - g.winner)}
              </p>
            ) : (
              <p className="muted">두 사람이 동시에 무너졌어요</p>
            )}
            <p>웨이브 {g.wave}까지 진행</p>
          </>
        )}
        <button className="btn ghost" onClick={onReset}>
          설정 바꾸기
        </button>
      </Result>
    )
  }

  const bossSoon = isBossWave(g.wave + 1)
  const waveLabel =
    g.wave === 0 ? `곧 시작 ${Math.ceil(g.waveTimer)}초` : `웨이브 ${g.wave} · 다음 ${Math.ceil(g.waveTimer)}초`

  const sideView = (i: number, rotated: boolean) => (
    <SideView
      key={i}
      idx={i}
      game={g}
      player={players[i]}
      ui={uiRef.current[i]}
      rotated={rotated}
      compact={versus}
      paused={paused}
      onChange={refresh}
      canvasRef={(c) => (canvases.current[i] = c)}
    />
  )

  return (
    <div className={`rd-arena ${versus ? 'versus' : 'solo'}`}>
      {versus && sideView(top, bothHuman)}
      <div className="rd-strip">
        <span className={bossSoon && g.wave > 0 ? 'rd-boss-soon' : ''}>
          {waveLabel}
          {bossSoon && g.wave > 0 ? ' · 다음 보스!' : ''}
        </span>
        {!versus && best != null && !players[0].isAI && <span className="muted">최고 {best}</span>}
        <span className="rd-strip-btns">
          {!versus && (
            <button
              className={`btn small ${speed > 1 ? 'accent' : 'ghost'}`}
              onClick={() => {
                const v = speed > 1 ? 1 : 2
                speedRef.current = v
                setSpeed(v)
              }}
              aria-label="배속"
            >
              {speed > 1 ? '⏩ 2배' : '▶ 1배'}
            </button>
          )}
          <button className="btn small ghost" onClick={() => pause(true)} aria-label="일시정지">
            ⏸
          </button>
        </span>
      </div>
      {sideView(bottom, false)}
      {paused && (
        <div className="rd-pause">
          <div className="card-panel">
            <h2>일시정지</h2>
            <p className="muted">
              {g.wave > 0 ? `웨이브 ${g.wave}` : '준비 중'} · 보스는 {BOSS_EVERY}웨이브마다 나와요
            </p>
            <button className="btn primary big" onClick={() => pause(false)}>
              계속하기
            </button>
            <button className="btn ghost" onClick={onReset}>
              그만하고 나가기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SideView({
  idx,
  game,
  player,
  ui,
  rotated,
  compact,
  paused,
  onChange,
  canvasRef,
}: {
  idx: number
  game: Game
  player: PlayerConfig
  ui: UiState
  rotated: boolean
  compact: boolean
  paused: boolean
  onChange: () => void
  canvasRef: (c: HTMLCanvasElement | null) => void
}) {
  const side = game.sides[idx]
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(0)
  const interactive = !player.isAI

  // fit the 7:5 canvas inside the available box
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      setSize(Math.floor(Math.max(120, Math.min(w, (h * FIELD_W) / FIELD_H))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const toField = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    let px = (e.clientX - r.left) / r.width
    let py = (e.clientY - r.top) / r.height
    if (rotated) {
      px = 1 - px
      py = 1 - py
    }
    return { x: px * FIELD_W, y: py * FIELD_H }
  }

  const blocked = () => !interactive || paused || game.over || side.lost

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (blocked() || ui.drag) return
    e.preventDefault()
    const { x, y } = toField(e)
    const slot = slotAt(x, y)
    if (slot < 0) {
      ui.sel = -1
      onChange()
      return
    }
    if (side.units[slot]) {
      ui.drag = { id: e.pointerId, from: slot, x, y, sx: x, sy: y, moved: false }
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if (ui.sel >= 0) {
      act(side, ui.sel, slot, Math.random)
      ui.sel = -1
      onChange()
    }
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = ui.drag
    if (!d || d.id !== e.pointerId) return
    const { x, y } = toField(e)
    d.x = x
    d.y = y
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) > 0.25) d.moved = true
  }
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = ui.drag
    if (!d || d.id !== e.pointerId) return
    ui.drag = null
    if (blocked()) return
    const { x, y } = toField(e)
    const target = slotAt(x, y)
    if (d.moved) {
      if (target >= 0 && target !== d.from) act(side, d.from, target, Math.random)
      ui.sel = -1
    } else if (ui.sel < 0 || ui.sel === d.from) {
      ui.sel = ui.sel === d.from ? -1 : d.from
    } else if (canMerge(side.units[ui.sel], side.units[d.from])) {
      act(side, ui.sel, d.from, Math.random)
      ui.sel = -1
    } else ui.sel = d.from
    onChange()
  }
  const onCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (ui.drag && ui.drag.id === e.pointerId) ui.drag = null
  }

  // Buttons fire on pointerdown so two players can press at the same time; keyboard still works via click.
  const press = (fn: () => unknown) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      if (!blocked()) {
        fn()
        onChange()
      }
    },
    onClick: (e: React.MouseEvent) => {
      if (e.detail === 0 && !blocked()) {
        fn()
        onChange()
      }
    },
  })

  const count = side.monsters.length
  const danger = count / LIMIT
  const cost = summonCost(side.summons)
  const selUnit = ui.sel >= 0 ? side.units[ui.sel] : null
  const partners = selUnit ? side.units.filter((u) => u && u !== selUnit && canMerge(selUnit, u)).length : 0

  return (
    <section className={`rd-side ${rotated ? 'rotated' : ''} ${compact ? 'compact' : ''} ${player.isAI ? 'ai' : ''}`}>
      <div className="rd-hud">
        <span className="rd-name">
          {player.isAI ? '🤖 ' : ''}
          {player.name}
        </span>
        <span className={`rd-count ${danger > 0.75 ? 'danger' : danger > 0.5 ? 'warn' : ''}`}>
          👾 {count}/{LIMIT}
          <i style={{ width: `${Math.min(100, danger * 100)}%` }} />
        </span>
        {side.bossT != null && <span className="rd-bosst">👹 {Math.max(0, Math.ceil(side.bossT))}초</span>}
        <span className="rd-coins">🪙 {Math.floor(side.coins)}</span>
      </div>
      <div className="rd-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="rd-canvas"
          style={{ width: size, height: (size * FIELD_H) / FIELD_W }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
      {interactive ? (
        <>
          <div className="rd-controls">
            <button className="btn accent rd-summon" disabled={!canSummon(side)} {...press(() => summon(side, Math.random))}>
              <b>소환</b>
              <small>🪙 {cost}</small>
            </button>
            {CLASS_NAMES.map((name, cls) => {
              const lvl = side.upg[cls]
              const maxed = lvl >= MAX_UPGRADE
              return (
                <button
                  key={cls}
                  className="btn rd-upg"
                  disabled={!canUpgrade(side, cls)}
                  style={{ borderColor: TIER_COLORS[cls * 2 + 2] }}
                  {...press(() => upgrade(side, cls))}
                >
                  <b>
                    {name} <span className="rd-lv">Lv{lvl}</span>
                  </b>
                  <small>{maxed ? '최대' : `🪙 ${upgradeCost(lvl)}`}</small>
                </button>
              )
            })}
          </div>
          {!compact && (
            <p className="rd-info">
              {selUnit ? (
                <>
                  {INFO[selUnit.type].emoji} <b>{INFO[selUnit.type].name}</b>{' '}
                  <span style={{ color: TIER_COLORS[selUnit.tier] }}>{'★'.repeat(selUnit.tier)}</span> ·{' '}
                  {INFO[selUnit.type].role} · 공격력 {fmt(unitDamage(selUnit, side))}
                  {selUnit.tier >= MAX_TIER
                    ? ' · 최고 등급'
                    : partners
                      ? ` · 합칠 짝 ${partners}`
                      : ' · 같은 정령·같은 별이 필요해요'}
                </>
              ) : (
                '정령을 끌어서 같은 정령(같은 별 수)에 놓으면 합쳐져 더 높은 등급의 랜덤 정령이 돼요'
              )}
            </p>
          )}
        </>
      ) : (
        <div className="rd-ai-note muted">
          강화 {CLASS_NAMES.map((n, c) => `${n} ${side.upg[c]}`).join(' · ')}
        </div>
      )}
    </section>
  )
}
