import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useBestScore, useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { PLAYER_COLORS, drawFrame, makeBackground, updateParticles, type View } from './draw'
import {
  COLS,
  DIFFS,
  DT,
  ENEMIES,
  MAPS,
  ROWS,
  TARGETING_LABEL,
  TOTAL_WAVES,
  TOWERS,
  TOWER_KINDS,
  build,
  callWave,
  canCallWave,
  continueEndless,
  earlyBonus,
  isBuildable,
  newGame,
  sell,
  sellValue,
  setTargeting,
  starsFor,
  step,
  towerAt,
  transferGold,
  upgrade,
  upgradeCost,
  wavePreview,
  wavesCleared,
  type State,
  type Targeting,
  type Tower,
  type TowerKind,
} from './logic'
import './tower-defense.css'

interface Config {
  mapIndex: number
  diff: Difficulty
  players: PlayerConfig[]
}

interface Progress {
  /** Highest unlocked map index. */
  unlocked: number
  stars: Record<string, number>
  bestWave: Record<string, number>
}
const DEFAULT_PROGRESS: Progress = { unlocked: 0, stars: {}, bestWave: {} }
const recKey = (mapIndex: number, diff: Difficulty) => `${MAPS[mapIndex].id}:${diff}`

export default function TowerDefense() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [round, setRound] = useState(0)
  if (!cfg) return <Setup onStart={setCfg} />
  return <Play key={round} cfg={cfg} onAgain={() => setRound((r) => r + 1)} onExit={() => setCfg(null)} />
}

// ---------------------------------------------------------------- setup

function MapThumb({ index }: { index: number }) {
  const m = MAPS[index]
  return (
    <svg viewBox={`0 0 ${COLS} ${ROWS}`} className="td-thumb" aria-hidden>
      <rect width={COLS} height={ROWS} fill={m.grass[0]} />
      {m.blocked.map((b, i) => (
        <circle
          key={i}
          cx={b.c + 0.5}
          cy={b.r + 0.5}
          r={0.38}
          fill={b.type === 'water' ? '#4aa3d8' : b.type === 'rock' ? '#9a958c' : '#2f7d3a'}
        />
      ))}
      <polyline
        points={m.waypoints.map(([c, r]) => `${c + 0.5},${r + 0.5}`).join(' ')}
        fill="none"
        stroke={m.road}
        strokeWidth={0.85}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Stars({ n, max = 3 }: { n: number; max?: number }) {
  return (
    <span className="td-stars" aria-label={`별 ${n}개`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? 'on' : ''}>
          ★
        </span>
      ))}
    </span>
  )
}

function Setup({ onStart }: { onStart: (c: Config) => void }) {
  const [progress] = useStored<Progress>('td:progress', DEFAULT_PROGRESS)
  const [mapIndex, setMapIndex] = useStored('td:map', 0)
  const [diff, setDiff] = useStored<Difficulty>('td:diff', 'easy')
  const { best } = useBestScore('tower-defense')
  const unlocked = Math.min(MAPS.length - 1, progress.unlocked ?? 0)
  const sel = Math.min(mapIndex, unlocked)
  const bestWave = progress.bestWave?.[recKey(sel, diff)]

  const extra = (
    <>
      <div className="td-maps">
        {MAPS.map((m, i) => {
          const locked = i > unlocked
          return (
            <button
              key={m.id}
              className={`td-map ${i === sel ? 'active' : ''}`}
              disabled={locked}
              onClick={() => setMapIndex(i)}
            >
              <MapThumb index={i} />
              <span className="td-map-name">
                {locked ? '🔒' : m.emoji} {m.name}
              </span>
              {locked ? (
                <span className="td-map-sub">이전 맵을 깨면 열려요</span>
              ) : (
                <Stars n={progress.stars?.[recKey(i, diff)] ?? 0} />
              )}
            </button>
          )
        })}
      </div>
      <div className="setup-row">
        <span>난이도</span>
        <div className="segmented">
          {(['easy', 'normal', 'hard'] as const).map((d) => (
            <button key={d} className={diff === d ? 'active' : ''} onClick={() => setDiff(d)}>
              {DIFFS[d].label}
            </button>
          ))}
        </div>
      </div>
      <p className="td-setup-note muted">
        생명 {DIFFS[diff].lives} · 시작 금화 {DIFFS[diff].gold}
        {bestWave ? ` · 이 맵 최고 ${bestWave}웨이브` : ''}
        {best != null ? ` · 최고 점수 ${best.toLocaleString()}` : ''}
        <br />2명이면 한 화면에서 함께 막는 협동 모드예요.
      </p>
    </>
  )
  return (
    <PlayerSetup
      gameId="tower-defense"
      min={1}
      max={2}
      defaultCount={1}
      allowAI={false}
      startLabel="🛡️ 방어 시작"
      extra={extra}
      onStart={(players) => onStart({ mapIndex: sel, diff, players })}
    />
  )
}

// ---------------------------------------------------------------- play

type Sel = { kind: 'tile'; c: number; r: number } | { kind: 'tower'; id: number } | null

function signature(s: State): string {
  return [
    s.gold.join(','),
    s.lives,
    s.wave,
    s.status,
    s.nextWaveIn == null ? 'x' : Math.ceil(s.nextWaveIn),
    earlyBonus(s),
    s.towers.length,
    s.towers.reduce((a, t) => a + t.level, 0),
    s.endless ? 1 : 0,
  ].join('|')
}

function Play({ cfg, onAgain, onExit }: { cfg: Config; onAgain: () => void; onExit: () => void }) {
  const coop = cfg.players.length > 1
  const [s] = useState<State>(() => newGame(cfg.mapIndex, cfg.diff, cfg.players.length))
  const [, setTick] = useState(0)
  const rerender = () => setTick((t) => t + 1)
  const [sel, setSel] = useState<Sel>(null)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState<1 | 2 | 3>(1)
  const [active, setActive] = useState(0)
  const [tile, setTile] = useState(36)
  const [confirmSell, setConfirmSell] = useState<number | null>(null)
  const [newRecord, setNewRecord] = useState(false)
  const [unlockedMsg, setUnlockedMsg] = useState<string | null>(null)
  const [progress, setProgress] = useStored<Progress>('td:progress', DEFAULT_PROGRESS)
  const { best, submit } = useBestScore('tower-defense')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const playRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(paused)
  const speedRef = useRef(speed)
  const bgRef = useRef<HTMLCanvasElement | null>(null)
  const viewRef = useRef<View>({
    tile: 36,
    particles: [],
    lastFx: 0,
    selTile: null,
    selTower: null,
    clock: 0,
    playerColors: PLAYER_COLORS,
    coop,
  })
  useEffect(() => {
    pausedRef.current = paused
    speedRef.current = speed
  }, [paused, speed])

  // keep the view in sync with the selection
  useEffect(() => {
    const v = viewRef.current
    v.selTile = sel?.kind === 'tile' ? { c: sel.c, r: sel.r } : null
    v.selTower = sel?.kind === 'tower' ? sel.id : null
  }, [sel])

  // fit the board to the screen
  useLayoutEffect(() => {
    const fit = () => {
      const board = boardRef.current
      if (!board) return
      const rect = board.getBoundingClientRect()
      const top = rect.top + window.scrollY
      const barH = barRef.current?.offsetHeight ?? 56
      const availH = window.innerHeight - top - barH - 22
      const main = playRef.current?.parentElement
      let availW = rect.width
      if (main) {
        const cs = getComputedStyle(main)
        availW = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      }
      const t = Math.floor(Math.max(22, Math.min(60, availW / COLS, availH / ROWS)))
      setTile(t)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  // canvas resolution + cached background
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    cv.width = Math.round(COLS * tile * dpr)
    cv.height = Math.round(ROWS * tile * dpr)
    bgRef.current = makeBackground(s.map, tile, dpr)
    viewRef.current.tile = tile
  }, [tile, s])

  // main loop
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let lastHud = 0
    let sig = ''
    const frame = (now: number) => {
      const dtReal = Math.min(0.1, (now - last) / 1000)
      last = now
      const v = viewRef.current
      const running = !pausedRef.current && (s.status === 'playing' || s.status === 'ready')
      if (running) {
        v.clock += dtReal
        acc += dtReal * speedRef.current
        let n = 0
        while (acc >= DT && n < 20) {
          step(s, DT)
          acc -= DT
          n++
        }
        if (n >= 20) acc = 0
        updateParticles(v, s, dtReal)
      }
      const cv = canvasRef.current
      const ctx = cv?.getContext('2d')
      if (cv && ctx && bgRef.current) {
        const dpr = cv.width / (COLS * v.tile)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawFrame(ctx, s, v, bgRef.current)
      }
      if (now - lastHud > 120) {
        lastHud = now
        const g = signature(s)
        if (g !== sig) {
          sig = g
          rerender()
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [s])

  // auto-pause when the tab is hidden
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) setPaused(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const over = s.status === 'won' || s.status === 'lost'

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === ' ') {
        e.preventDefault()
        setPaused((p) => !p)
      } else if (e.key === 'n' || e.key === 'N') {
        if (callWave(s)) rerender()
      } else if (e.key === '1' || e.key === '2' || e.key === '3') setSpeed(Number(e.key) as 1 | 2 | 3)
      else if (e.key === 'Escape') setSel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [s])

  // records when the game ends
  const recorded = useRef('')
  useEffect(() => {
    if (!over) return
    const tag = `${s.status}:${s.wave}:${s.endless}`
    if (recorded.current === tag) return
    recorded.current = tag
    setSel(null)
    const key = recKey(cfg.mapIndex, cfg.diff)
    const cleared = wavesCleared(s)
    const won = s.status === 'won'
    const stars = won ? starsFor(s.lives, s.maxLives) : 0
    let unlockedNow: string | null = null
    const next: Progress = {
      unlocked: progress.unlocked ?? 0,
      stars: { ...(progress.stars ?? {}) },
      bestWave: { ...(progress.bestWave ?? {}) },
    }
    next.bestWave[key] = Math.max(next.bestWave[key] ?? 0, cleared)
    if (won) {
      next.stars[key] = Math.max(next.stars[key] ?? 0, stars)
      const target = Math.min(MAPS.length - 1, cfg.mapIndex + 1)
      if (target > next.unlocked) {
        next.unlocked = target
        unlockedNow = MAPS[target].name
      }
    }
    setProgress(next)
    setUnlockedMsg(unlockedNow)
    setNewRecord(submit(s.score))
  }, [over, s.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- input

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (over) return
    setConfirmSell(null)
    const rect = e.currentTarget.getBoundingClientRect()
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * COLS)
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * ROWS)
    const t = towerAt(s, c, r)
    if (t) {
      setSel((p) => (p?.kind === 'tower' && p.id === t.id ? null : { kind: 'tower', id: t.id }))
      if (coop && s.gold[t.owner] != null) setActive(t.owner)
    } else if (isBuildable(s.map, c, r)) {
      setSel((p) => (p?.kind === 'tile' && p.c === c && p.r === r ? null : { kind: 'tile', c, r }))
    } else setSel(null)
  }

  const doBuild = (kind: TowerKind) => {
    if (sel?.kind !== 'tile') return
    const t = build(s, kind, sel.c, sel.r, active)
    if (t) setSel(null)
    rerender()
  }

  const selTower: Tower | undefined = sel?.kind === 'tower' ? s.towers.find((t) => t.id === sel.id) : undefined

  const selRow = sel?.kind === 'tile' ? sel.r : selTower ? selTower.r : 0
  const sheetPos = selRow >= ROWS / 2 ? 'top' : 'bottom'
  const myGold = s.gold[active] ?? 0
  const nextPreview = s.endless || s.wave < TOTAL_WAVES ? wavePreview(s.wave + 1) : []
  const bonus = earlyBonus(s)
  const totalW = s.endless ? '∞' : TOTAL_WAVES

  let waveBtn: { label: string; enabled: boolean }
  if (s.status === 'ready') waveBtn = { label: '▶ 웨이브 1 시작', enabled: true }
  else if (canCallWave(s))
    waveBtn = {
      label: `▶ 다음 웨이브 ${Math.ceil(s.nextWaveIn ?? 0)}초${bonus > 0 ? ` (+${bonus}💰)` : ''}`,
      enabled: true,
    }
  else if (!s.endless && s.wave >= TOTAL_WAVES) waveBtn = { label: '🔥 마지막 웨이브!', enabled: false }
  else waveBtn = { label: '⚔️ 웨이브 진행 중…', enabled: false }

  return (
    <div className="td-play" ref={playRef} style={{ maxWidth: Math.max(330, COLS * tile) }}>
      {/* HUD */}
      <div className="td-hud">
        {!coop && (
          <span className="td-chip gold" title="금화">
            💰 <b>{s.gold[0]}</b>
          </span>
        )}
        <span className={`td-chip ${s.lives <= s.maxLives * 0.3 ? 'danger' : ''}`} title="생명">
          ❤️ <b>{s.lives}</b>
        </span>
        <span className="td-chip" title="웨이브">
          🌊 <b>{s.wave}</b>/{totalW}
        </span>
        <span className="td-spacer" />
        <button
          className={`btn small td-hud-btn ${paused ? 'accent' : ''}`}
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? '계속하기' : '일시정지'}
        >
          {paused ? '▶' : '⏸'}
        </button>
        <button
          className="btn small td-hud-btn"
          onClick={() => setSpeed((v) => ((v % 3) + 1) as 1 | 2 | 3)}
          aria-label="속도 바꾸기"
        >
          {speed}×
        </button>
      </div>
      {coop && (
        <div className="td-hud td-coop">
          {cfg.players.map((p, i) => (
            <button
              key={i}
              className={`td-player ${active === i ? 'active' : ''}`}
              style={{ ['--pc' as string]: PLAYER_COLORS[i] }}
              onClick={() => setActive(i)}
            >
              <span className="td-dot" />
              <span className="td-pinfo">
                <span className="td-pname">{p.name}</span>
                <b>💰{s.gold[i]}</b>
              </span>
            </button>
          ))}
          <button
            className="btn small td-hud-btn"
            disabled={myGold < 25}
            onClick={() => {
              transferGold(s, active, 1 - active, 25)
              rerender()
            }}
            aria-label="친구에게 금화 25 보내기"
            title="친구에게 금화 25 보내기"
          >
            ➡️25
          </button>
        </div>
      )}

      {/* board */}
      <div className="td-board-wrap">
        <div className="td-board" ref={boardRef} style={{ width: COLS * tile, height: ROWS * tile }}>
          <canvas
            ref={canvasRef}
            className="td-canvas"
            style={{ width: COLS * tile, height: ROWS * tile }}
            onPointerDown={onPointerDown}
          />
          {s.status === 'ready' && s.towers.length === 0 && !sel && (
            <div className="td-hint">빈 칸을 눌러 타워를 지어 보세요 👆</div>
          )}
          {paused && !over && <div className="td-paused">⏸ 일시정지 — 지금도 건설할 수 있어요</div>}

          {sel?.kind === 'tile' && !over && (
            <div className={`td-sheet ${sheetPos}`}>
              <div className="td-sheet-head">
                <strong>타워 짓기</strong>
                {coop && <span className="td-owner" style={{ ['--pc' as string]: PLAYER_COLORS[active] }}>{cfg.players[active].name}</span>}
                <span className="muted td-sheet-gold">💰{myGold}</span>
                <button className="icon-btn" onClick={() => setSel(null)} aria-label="닫기">
                  ✕
                </button>
              </div>
              <div className="td-cards">
                {TOWER_KINDS.map((k) => {
                  const d = TOWERS[k]
                  const cost = d.costs[0]
                  return (
                    <button key={k} className="td-card" disabled={myGold < cost} onClick={() => doBuild(k)}>
                      <span className="td-card-top">
                        <span className="td-card-emoji">{d.emoji}</span>
                        <span className="td-card-name">{d.name}</span>
                      </span>
                      <span className={`td-cost ${myGold < cost ? 'short' : ''}`}>💰{cost}</span>
                      <span className="td-card-desc">{d.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {selTower && !over && (
            <TowerSheet
              t={selTower}
              pos={sheetPos}
              gold={myGold}
              ownerName={coop ? cfg.players[selTower.owner]?.name : undefined}
              confirmSell={confirmSell === selTower.id}
              onClose={() => {
                setSel(null)
                setConfirmSell(null)
              }}
              onUpgrade={() => {
                upgrade(s, selTower.id, active)
                rerender()
              }}
              onSell={() => {
                if (confirmSell !== selTower.id) {
                  setConfirmSell(selTower.id)
                  return
                }
                sell(s, selTower.id)
                setSel(null)
                rerender()
              }}
              onTarget={(m) => {
                setTargeting(s, selTower.id, m)
                rerender()
              }}
            />
          )}

          {over && (
            <div className="td-overlay">
              <Result
                title={
                  s.status === 'won'
                    ? '🏆 성을 지켜냈어요!'
                    : s.endless
                      ? `♾️ 무한 모드 ${wavesCleared(s)}웨이브!`
                      : '💥 성이 무너졌어요…'
                }
              >
                {s.status === 'won' && (
                  <div className="td-result-stars">
                    <Stars n={starsFor(s.lives, s.maxLives)} />
                  </div>
                )}
                <p className="td-result-lines">
                  {MAPS[cfg.mapIndex].emoji} {MAPS[cfg.mapIndex].name} · {DIFFS[cfg.diff].label}
                  <br />
                  버틴 웨이브 <b>{wavesCleared(s)}</b> · 처치 <b>{s.kills}</b> · 남은 생명 <b>{s.lives}</b>
                  <br />
                  점수 <b>{s.score.toLocaleString()}</b>
                  {newRecord ? ' 🎉 최고 기록!' : best != null ? ` (최고 ${best.toLocaleString()})` : ''}
                </p>
                {unlockedMsg && <p className="td-unlock">🔓 새 맵 “{unlockedMsg}”이(가) 열렸어요!</p>}
                {s.status === 'won' && (
                  <button
                    className="btn accent big"
                    onClick={() => {
                      continueEndless(s)
                      setNewRecord(false)
                      setUnlockedMsg(null)
                      rerender()
                    }}
                  >
                    ♾️ 무한 모드로 계속하기
                  </button>
                )}
                <button className="btn primary big" onClick={onAgain}>
                  다시 하기
                </button>
                <button className="btn ghost" onClick={onExit}>
                  🗺️ 맵 선택으로
                </button>
              </Result>
            </div>
          )}
        </div>
      </div>

      {/* bottom bar */}
      <div className="td-bar" ref={barRef}>
        <div className="td-preview" aria-label="다음 웨이브 미리보기">
          {nextPreview.length > 0 ? (
            <>
              <span className="td-preview-label">{s.wave + 1}웨이브</span>
              {nextPreview.map((g, i) => (
                <span key={i} className="td-preview-item" title={ENEMIES[g.kind].name}>
                  {ENEMIES[g.kind].emoji}
                  <small>×{g.count}</small>
                </span>
              ))}
            </>
          ) : (
            <span className="td-preview-label">마지막 웨이브</span>
          )}
        </div>
        <button
          className="btn primary td-wave-btn"
          disabled={!waveBtn.enabled || over}
          onClick={() => {
            if (callWave(s)) rerender()
          }}
        >
          {waveBtn.label}
        </button>
      </div>
    </div>
  )
}

function statLine(kind: TowerKind, level: number): string {
  const L = TOWERS[kind].levels[level - 1]
  const parts = [`공격 ${L.dmg}`, `사거리 ${L.range}`, `${L.rate}초마다`]
  if (L.splash) parts.push(`범위 ${L.splash}`)
  if (L.slow) parts.push(`감속 ${Math.round((1 - L.slow) * 100)}%`)
  if (L.chain) parts.push(`${L.chain}연쇄`)
  if (L.dot) parts.push(`독 ${L.dot}/초`)
  return parts.join(' · ')
}

function TowerSheet({
  t,
  pos,
  gold,
  ownerName,
  confirmSell,
  onClose,
  onUpgrade,
  onSell,
  onTarget,
}: {
  t: Tower
  pos: string
  gold: number
  ownerName?: string
  confirmSell: boolean
  onClose: () => void
  onUpgrade: () => void
  onSell: () => void
  onTarget: (m: Targeting) => void
}) {
  const d = TOWERS[t.kind]
  const cost = upgradeCost(t)
  return (
    <div className={`td-sheet ${pos}`}>
      <div className="td-sheet-head">
        <strong>
          {d.emoji} {d.name} <span className="td-lv">Lv.{t.level}</span>
        </strong>
        {ownerName && (
          <span className="td-owner" style={{ ['--pc' as string]: PLAYER_COLORS[t.owner] }}>
            {ownerName}
          </span>
        )}
        <span className="muted td-sheet-gold">처치 {t.kills}</span>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>
      <p className="td-stat">{statLine(t.kind, t.level)}</p>
      {cost != null && <p className="td-stat next">다음 단계 → {statLine(t.kind, t.level + 1)}</p>}
      {!d.air && <p className="td-stat warn">⚠️ 날아다니는 적은 공격하지 못해요</p>}
      <div className="td-target">
        <span>공격 대상</span>
        <div className="segmented">
          {(Object.keys(TARGETING_LABEL) as Targeting[]).map((m) => (
            <button key={m} className={t.targeting === m ? 'active' : ''} onClick={() => onTarget(m)}>
              {TARGETING_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="td-actions">
        <button className="btn primary" disabled={cost == null || gold < cost} onClick={onUpgrade}>
          {cost == null ? '⭐ 최고 단계' : `⬆️ 업그레이드 💰${cost}`}
        </button>
        <button className={`btn ${confirmSell ? 'danger' : ''}`} onClick={onSell}>
          {confirmSell ? `정말 팔까요? +${sellValue(t)}` : `판매 +${sellValue(t)}`}
        </button>
      </div>
    </div>
  )
}
