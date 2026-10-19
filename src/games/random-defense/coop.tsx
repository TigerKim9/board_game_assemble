// Co-op (협동) mode: two boards stacked on one canvas, sharing the middle lane.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Result } from '../../components/Result'
import { useBestScore } from '../../lib/storage'
import type { PlayerConfig } from '../../lib/types'
import {
  AI_INTERVAL,
  BOSS_EVERY,
  COOP_EDGE_ROW,
  COOP_H,
  COOP_LIMIT,
  COOP_OFFSET,
  FIELD_W,
  SHARED_LANE_Y,
  aiAct,
  aiPickOffers,
  castSkill,
  coopCount,
  gamble,
  isBossWave,
  newGame,
  pickCard,
  step,
  summon,
  upgrade,
  type Game,
} from './logic'
import { COOP_COLORS, drawCoop, type UiState } from './render'
import {
  ActionOverlay,
  AiNote,
  CardPicker,
  CodexModal,
  Controls,
  Discoveries,
  Hud,
  SkillBar,
  boardDown,
  boardMove,
  boardUp,
  makePress,
  sellSelected,
  transformSelected,
  unlockSelected,
  uiRngs,
} from './parts'
import type { Cfg } from './index'

const DT = 1 / 60

/** The AI partner plays with the sharpest brain; it is a teammate, not a handicap. */
const PARTNER_DIFF = 'hard' as const

export function CoopMatch({ cfg, onAgain, onReset }: { cfg: Cfg; onAgain: () => void; onReset: () => void }) {
  // side 0 = top board, side 1 = bottom board; the first human sits at the bottom (near the thumbs)
  const [players] = useState<PlayerConfig[]>(() => {
    const b = Math.max(0, cfg.players.findIndex((p) => !p.isAI))
    return [cfg.players[1 - b], cfg.players[b]]
  })
  const bothHuman = players.every((p) => !p.isAI)
  const facing = bothHuman && cfg.facing
  const gameRef = useRef<Game>(null as unknown as Game)
  if (!gameRef.current) gameRef.current = newGame(2, 'coop')
  const uiRef = useRef<UiState[]>(players.map(() => ({ sel: -1, drag: null, confirm: 0 })))
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)
  const [paused, setPaused] = useState(false)
  const [codex, setCodex] = useState(false)
  const [, setTick] = useState(0)
  const [over, setOver] = useState(false)
  const [size, setSize] = useState(0)
  const { best, submit } = useBestScore('random-defense-coop')
  const [newRecord, setNewRecord] = useState(false)
  const recorded = useRef(false)

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const pause = (v: boolean) => {
    if (gameRef.current.over) return
    pausedRef.current = v
    setPaused(v)
  }

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __rd: Game }).__rd = gameRef.current
  }, [])

  // fit the 8:9 field inside the available box
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize(Math.floor(Math.max(160, Math.min(el.clientWidth, (el.clientHeight * FIELD_W) / COOP_H))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // main loop
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let hudT = 0
    const aiT = [0, 0]
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const g = gameRef.current
      const elapsed = Math.min(0.1, (now - last) / 1000)
      last = now
      if (!pausedRef.current && !g.over) {
        acc += elapsed
        while (acc >= DT) {
          acc -= DT
          aiPickOffers(
            g,
            players.map((p) => (p.isAI ? PARTNER_DIFF : null)),
            Math.random,
          )
          players.forEach((p, i) => {
            if (!p.isAI) return
            aiT[i] += DT
            if (aiT[i] >= AI_INTERVAL[PARTNER_DIFF]) {
              aiT[i] = 0
              aiAct(g.sides[i], PARTNER_DIFF, Math.random, true, COOP_EDGE_ROW[i])
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
      const c = canvasRef.current
      const w = c?.clientWidth
      if (c && w) {
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const bw = Math.round(w * dpr)
        const bh = Math.round((w * COOP_H * dpr) / FIELD_W)
        if (c.width !== bw || c.height !== bh) {
          c.width = bw
          c.height = bh
        }
        const ctx = c.getContext('2d')
        if (ctx) drawCoop(ctx, w, dpr, g.sides, uiRef.current, now / 1000, facing)
      }
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

  // record: best co-op wave (any game with a human in it)
  useEffect(() => {
    if (!over || recorded.current) return
    recorded.current = true
    if (gameRef.current.wave > 0) setNewRecord(submit(gameRef.current.wave))
  }, [over]) // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard: the bottom player
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const g = gameRef.current
      if (e.key === 'p' || e.key === 'Escape') {
        pause(!pausedRef.current)
        return
      }
      if (pausedRef.current || g.over || players[1].isAI) return
      const side = g.sides[1]
      const ui = uiRef.current[1]
      const k = e.key.toLowerCase()
      // 1~3 pick a card while an offer is open (otherwise they buy upgrades)
      if (side.offer && e.key >= '1' && e.key <= '3') {
        const id = side.offer[Number(e.key) - 1]
        if (id) pickCard(side, id, Math.random)
        refresh()
        return
      }
      if (e.key === ' ' || k === 's') {
        e.preventDefault()
        summon(side, Math.random)
      } else if (k === 'g') gamble(side, Math.random)
      else if (k === 'q') castSkill(side, 'meteor')
      else if (k === 'w') castSkill(side, 'freeze')
      else if (e.key >= '1' && e.key <= '3') upgrade(side, Number(e.key) - 1)
      else if (k === 'x') sellSelected(side, ui)
      else if (k === 'c') transformSelected(side, ui)
      else if (k === 'u') unlockSelected(side, ui)
      else return
      refresh()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const g = gameRef.current

  if (over) {
    const fail = g.coopFail
    const who = fail ? players[fail.side].name : ''
    return (
      <Result title={`웨이브 ${g.wave}에서 함께 쓰러졌어요`} onAgain={onAgain}>
        <p className="muted">
          {fail?.reason === 'boss'
            ? `${who}의 보스를 제한 시간 안에 처치하지 못했어요`
            : `두 길의 몬스터가 합쳐서 ${COOP_LIMIT}마리가 됐어요`}
        </p>
        {players.map((p, i) => (
          <p key={i}>
            <i className="rd-dot" style={{ background: COOP_COLORS[i] }} /> <b>{p.name}</b> 처치 <b>{g.sides[i].kills}</b> · 도와준 처치{' '}
            <b>{g.sides[i].helped}</b>
          </p>
        ))}
        <p>{newRecord ? '🎉 협동 최고 기록!' : best != null ? `협동 최고 기록: 웨이브 ${best}` : ''}</p>
        <button className="btn ghost" onClick={onReset}>
          설정 바꾸기
        </button>
      </Result>
    )
  }

  // ---- canvas input: each touch belongs to the board it starts on ----
  const blocked = (i: number) => players[i].isAI || pausedRef.current || g.over || g.sides[i].lost
  const toGlobal = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * FIELD_W, y: ((e.clientY - r.top) / r.height) * COOP_H }
  }
  const dragOwner = (id: number) => uiRef.current.findIndex((u) => u.drag && u.drag.id === id)
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = toGlobal(e)
    const i = y < SHARED_LANE_Y ? 0 : 1
    const ui = uiRef.current[i]
    if (blocked(i) || ui.drag) return
    e.preventDefault()
    if (boardDown(g.sides[i], ui, x, y - i * COOP_OFFSET, e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId)
    else refresh()
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const i = dragOwner(e.pointerId)
    if (i < 0) return
    const { x, y } = toGlobal(e)
    boardMove(uiRef.current[i], x, y - i * COOP_OFFSET)
  }
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const i = dragOwner(e.pointerId)
    if (i < 0) return
    const { x, y } = toGlobal(e)
    boardUp(g.sides[i], uiRef.current[i], x, y - i * COOP_OFFSET, blocked(i))
    refresh()
  }
  const onCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const i = dragOwner(e.pointerId)
    if (i >= 0) uiRef.current[i].drag = null
  }

  const presses = [0, 1].map((i) => makePress(() => blocked(i), refresh))
  const rngs = uiRngs(g)
  const total = coopCount(g)
  const danger = total / COOP_LIMIT
  const bossSoon = isBossWave(g.wave + 1)
  const waveLabel = g.wave === 0 ? `곧 시작 ${Math.ceil(g.waveTimer)}초` : `웨이브 ${g.wave} · ${Math.ceil(g.waveTimer)}초`
  const boardH = (size * COOP_H) / FIELD_W

  const panel = (i: number) => {
    const p = players[i]
    const side = g.sides[i]
    return (
      <section
        className={`rd-coop-panel ${i === 0 ? 'top' : 'bottom'} ${facing && i === 0 ? 'rotated' : ''} ${p.isAI ? 'ai' : ''}`}
        style={{ '--rd-own': COOP_COLORS[i] } as React.CSSProperties}
      >
        <Hud player={p} side={side} count={side.monsters.length} limit={COOP_LIMIT} label="내 길" color={COOP_COLORS[i]} />
        {p.isAI ? (
          <AiNote side={side} />
        ) : (
          <>
            <Controls side={side} press={presses[i]} rngs={rngs} />
            <SkillBar side={side} press={presses[i]} rngs={rngs} />
          </>
        )}
      </section>
    )
  }

  return (
    <div className={`rd-arena coop ${bothHuman ? 'two' : 'one'}`}>
      <div className="rd-strip">
        <span className={bossSoon && g.wave > 0 ? 'rd-boss-soon' : ''}>
          {waveLabel}
          {bossSoon && g.wave > 0 ? ' · 👹보스' : ''}
        </span>
        <span className={`rd-count rd-total ${danger > 0.75 ? 'danger' : danger > 0.5 ? 'warn' : ''}`} title="두 길의 몬스터 합계">
          👾 합계 {total}/{COOP_LIMIT}
          <i style={{ width: `${Math.min(100, danger * 100)}%` }} />
        </span>
        <span className="rd-strip-btns">
          <button className="btn small ghost" onClick={() => pause(true)} aria-label="일시정지">
            ⏸
          </button>
        </span>
      </div>
      {panel(0)}
      <div className="rd-canvas-wrap" ref={wrapRef}>
        <div className="rd-board" style={{ width: size, height: boardH }}>
          <canvas
            ref={canvasRef}
            className="rd-canvas"
            style={{ width: size, height: boardH }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onCancel}
            onContextMenu={(e) => e.preventDefault()}
          />
          {!players[0].isAI &&
            (facing ? (
              <div className="rd-flip">
                <ActionOverlay side={g.sides[0]} ui={uiRef.current[0]} press={presses[0]} />
              </div>
            ) : (
              <ActionOverlay side={g.sides[0]} ui={uiRef.current[0]} press={presses[0]} className="at-top" />
            ))}
          {!players[1].isAI && <ActionOverlay side={g.sides[1]} ui={uiRef.current[1]} press={presses[1]} />}
          <Discoveries sides={g.sides} humans={players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0)} />
          {!paused && !players[0].isAI && <CardPicker side={g.sides[0]} variant="top" flipped={facing} onPick={refresh} />}
          {!paused && !players[1].isAI && <CardPicker side={g.sides[1]} variant="bottom" keys onPick={refresh} />}
        </div>
      </div>
      {panel(1)}
      {paused && (
        <div className="rd-pause">
          <div className="card-panel">
            <h2>일시정지</h2>
            <p className="muted">
              {g.wave > 0 ? `웨이브 ${g.wave}` : '준비 중'} · 보스는 {BOSS_EVERY}웨이브마다 양쪽에 하나씩 나와요
            </p>
            <button className="btn primary big" onClick={() => pause(false)}>
              계속하기
            </button>
            <button className="btn ghost" onClick={() => setCodex(true)}>
              📖 정령 도감
            </button>
            <button className="btn ghost" onClick={onReset}>
              그만하고 나가기
            </button>
          </div>
        </div>
      )}
      {codex && <CodexModal onClose={() => setCodex(false)} />}
    </div>
  )
}
