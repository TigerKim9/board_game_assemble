import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useBestScore, useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { aiChooseDir, newGame, queueTurn, SPEEDS, step, tickInterval, type Dir, type SnakeState } from './logic'
import './snake.css'

interface Config {
  players: PlayerConfig[]
  difficulty: Difficulty
  speed: number
  wrap: boolean
}

const SNAKE_COLORS = [
  { body: '#4cc26b', head: '#2f9e4f', name: '초록' },
  { body: '#5b9cf0', head: '#2f6fb5', name: '파랑' },
]

export default function SnakeGame() {
  const [config, setConfig] = useState<Config | null>(null)
  const [round, setRound] = useState(0)
  const [speed, setSpeed] = useStored('snake:speed', 2)
  const [wrap, setWrap] = useStored('snake:wrap', false)
  const { best } = useBestScore('snake')

  if (!config) {
    return (
      <>
        <PlayerSetup
          gameId="snake"
          min={1}
          max={2}
          defaultCount={1}
          showDifficulty
          extra={
            <>
              <div className="setup-row">
                <span>속도</span>
                <div className="segmented">
                  {SPEEDS.map((s, i) => (
                    <button key={i} className={speed === i + 1 ? 'active' : ''} onClick={() => setSpeed(i + 1)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="setup-row">
                <span>벽</span>
                <div className="segmented">
                  <button className={!wrap ? 'active' : ''} onClick={() => setWrap(false)}>
                    부딪히면 끝
                  </button>
                  <button className={wrap ? 'active' : ''} onClick={() => setWrap(true)}>
                    반대편 통과
                  </button>
                </div>
              </div>
            </>
          }
          onStart={(players, difficulty) => setConfig({ players, difficulty, speed, wrap })}
        />
        {best != null && <p className="center muted">혼자 하기 최고 기록: {best}점</p>}
      </>
    )
  }
  return <Play key={round} config={config} onSetup={() => setConfig(null)} onAgain={() => setRound((r) => r + 1)} />
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: string
  text?: string
}

type Phase = 'countdown' | 'play' | 'over'

function Play({ config, onSetup, onAgain }: { config: Config; onSetup: () => void; onAgain: () => void }) {
  const { players, difficulty } = config
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<SnakeState>(newGame(players.length, { wrap: config.wrap, speed: config.speed }))
  const phaseRef = useRef<Phase>('countdown')
  const countdownRef = useRef(2400)
  const pausedRef = useRef(false)
  const particles = useRef<Particle[]>([])
  const shake = useRef(0)
  const [paused, setPaused] = useState(false)
  const [scores, setScores] = useState<number[]>(players.map(() => 0))
  const [over, setOver] = useState<SnakeState | null>(null)
  const [newRecord, setNewRecord] = useState(false)
  const [cell, setCell] = useState(16)
  const { best, submit } = useBestScore('snake')
  const submitRef = useRef(submit)
  submitRef.current = submit

  const humans = players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0)
  const solo = players.length === 1 && humans.length === 1

  const setPause = (v: boolean) => {
    if (phaseRef.current === 'over') return
    pausedRef.current = v
    setPaused(v)
  }

  const turn = (snake: number | undefined, dir: Dir) => {
    if (snake == null || pausedRef.current || phaseRef.current === 'over') return
    const sn = stateRef.current.snakes[snake]
    if (sn && sn.alive) queueTurn(sn, dir)
  }

  // Fit the board to the screen.
  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      const reserve = 200 // d-pad + paddings
      const availH = window.innerHeight - top - reserve
      const availW = el.clientWidth
      const s = stateRef.current
      setCell(Math.max(10, Math.floor(Math.min(availW / s.cols, Math.max(260, availH) / s.rows))))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  // Keyboard
  useEffect(() => {
    const map: Record<string, [number | undefined, Dir]> = {}
    const wasd = humans[0]
    const arrows = humans.length >= 2 ? humans[1] : humans[0]
    Object.assign(map, {
      KeyW: [wasd, 'up'],
      KeyS: [wasd, 'down'],
      KeyA: [wasd, 'left'],
      KeyD: [wasd, 'right'],
      ArrowUp: [arrows, 'up'],
      ArrowDown: [arrows, 'down'],
      ArrowLeft: [arrows, 'left'],
      ArrowRight: [arrows, 'right'],
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault()
        setPause(!pausedRef.current)
        return
      }
      const m = map[e.code]
      if (m) {
        e.preventDefault()
        turn(m[0], m[1])
      }
    }
    window.addEventListener('keydown', onKey)
    const onVis = () => document.hidden && setPause(true)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Game loop
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let alive = true

    const burst = (gx: number, gy: number, color: string, n: number, text?: string) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 0.03 + Math.random() * 0.12
        particles.current.push({ x: gx + 0.5, y: gy + 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 500, max: 500, color })
      }
      if (text) particles.current.push({ x: gx + 0.5, y: gy, vx: 0, vy: -0.02, life: 800, max: 800, color: '#fff', text })
    }

    const tick = () => {
      const s = stateRef.current
      s.snakes.forEach((sn, i) => {
        if (players[i].isAI && sn.alive) {
          sn.queue = []
          queueTurn(sn, aiChooseDir(s, i, difficulty))
        }
      })
      const n = step(s)
      stateRef.current = n
      let scored = false
      for (const e of n.events) {
        if (e.type === 'eat') {
          scored = true
          burst(e.x, e.y, e.kind === 'gold' ? '#ffd23f' : '#ff5a4e', e.kind === 'gold' ? 22 : 10, `+${e.points}`)
          if (!players[e.snake].isAI) navigator.vibrate?.(15)
        } else {
          burst(e.x, e.y, SNAKE_COLORS[e.snake].body, 26)
          shake.current = 300
          if (!players[e.snake].isAI) navigator.vibrate?.([60, 40, 60])
        }
      }
      if (scored) setScores(n.snakes.map((sn) => sn.score))
      if (n.over) {
        phaseRef.current = 'over'
        if (solo && n.snakes[0].score > 0) setNewRecord(submitRef.current(n.snakes[0].score))
        setTimeout(() => alive && setOver(n), 700)
      }
    }

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(100, t - last)
      last = t
      if (!pausedRef.current) {
        if (phaseRef.current === 'countdown') {
          countdownRef.current -= dt
          if (countdownRef.current <= 0) phaseRef.current = 'play'
        } else if (phaseRef.current === 'play') {
          acc += dt
          const s = stateRef.current
          const iv = tickInterval(s.speed, Math.max(...s.snakes.map((x) => x.eaten)))
          while (acc >= iv && phaseRef.current === 'play') {
            acc -= iv
            tick()
          }
        }
        for (const p of particles.current) {
          p.x += p.vx * dt
          p.y += p.vy * dt
          p.life -= dt
        }
        particles.current = particles.current.filter((p) => p.life > 0)
        shake.current = Math.max(0, shake.current - dt)
      }
      draw(t)
    }

    const draw = (t: number) => {
      const cv = canvasRef.current
      if (!cv) return
      const s = stateRef.current
      const dpr = window.devicePixelRatio || 1
      const c = cv.clientWidth / s.cols
      if (!c) return
      const W = cv.clientWidth
      const H = cv.clientHeight
      if (cv.width !== Math.round(W * dpr)) {
        cv.width = Math.round(W * dpr)
        cv.height = Math.round(H * dpr)
      }
      const ctx = cv.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (shake.current > 0) {
        const m = (shake.current / 300) * 4
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m)
      }
      // board
      ctx.fillStyle = '#16241c'
      ctx.fillRect(-10, -10, W + 20, H + 20)
      ctx.fillStyle = '#1b2c22'
      for (let y = 0; y < s.rows; y++)
        for (let x = (y % 2); x < s.cols; x += 2) ctx.fillRect(x * c, y * c, c, c)
      if (!s.wrap) {
        ctx.strokeStyle = '#e0a526'
        ctx.lineWidth = 3
        ctx.strokeRect(1.5, 1.5, W - 3, H - 3)
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'
        ctx.setLineDash([6, 6])
        ctx.lineWidth = 2
        ctx.strokeRect(1, 1, W - 2, H - 2)
        ctx.setLineDash([])
      }

      // food
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const f of s.foods) {
        if (f.kind === 'gold' && f.ttl < 15 && Math.floor(t / 120) % 2) continue
        const pulse = 1 + Math.sin(t / 180 + f.x) * 0.08
        const size = c * (f.kind === 'gold' ? 1.05 : 0.9) * pulse
        if (f.kind === 'gold') {
          ctx.fillStyle = 'rgba(255,210,63,0.25)'
          ctx.beginPath()
          ctx.arc((f.x + 0.5) * c, (f.y + 0.5) * c, c * 0.8 * pulse, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.font = `${size}px system-ui, sans-serif`
        ctx.fillText(f.kind === 'gold' ? '⭐' : '🍎', (f.x + 0.5) * c, (f.y + 0.55) * c)
      }

      // snakes
      s.snakes.forEach((sn, i) => {
        const col = sn.alive ? SNAKE_COLORS[i] : { body: '#6b6f6a', head: '#555955' }
        const n = sn.body.length
        for (let k = n - 1; k >= 0; k--) {
          const p = sn.body[k]
          const inset = k === 0 ? 0.5 : 1 + (k / n) * c * 0.12
          ctx.fillStyle = k === 0 ? col.head : col.body
          ctx.globalAlpha = k === 0 ? 1 : 1 - (k / n) * 0.35
          roundRect(ctx, p.x * c + inset, p.y * c + inset, c - inset * 2, c - inset * 2, c * 0.3)
          ctx.fill()
          // connect to the next segment so the body looks continuous
          const q = sn.body[k + 1]
          if (q && Math.abs(q.x - p.x) + Math.abs(q.y - p.y) === 1) {
            const mx = Math.min(p.x, q.x)
            const my = Math.min(p.y, q.y)
            const horiz = p.y === q.y
            ctx.fillRect(
              horiz ? mx * c + c / 2 : p.x * c + inset,
              horiz ? p.y * c + inset : my * c + c / 2,
              horiz ? c : c - inset * 2,
              horiz ? c - inset * 2 : c,
            )
          }
        }
        ctx.globalAlpha = 1
        // eyes
        const h = sn.body[0]
        const dx = sn.dir === 'left' ? -1 : sn.dir === 'right' ? 1 : 0
        const dy = sn.dir === 'up' ? -1 : sn.dir === 'down' ? 1 : 0
        const cx = (h.x + 0.5) * c
        const cy = (h.y + 0.5) * c
        for (const side of [-1, 1]) {
          const ex = cx + dx * c * 0.18 + -dy * side * c * 0.2
          const ey = cy + dy * c * 0.18 + dx * side * c * 0.2
          ctx.fillStyle = '#fff'
          ctx.beginPath()
          ctx.arc(ex, ey, c * 0.14, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#111'
          ctx.beginPath()
          if (sn.alive) ctx.arc(ex + dx * c * 0.05, ey + dy * c * 0.05, c * 0.07, 0, Math.PI * 2)
          else {
            ctx.fillRect(ex - c * 0.08, ey - c * 0.02, c * 0.16, c * 0.04)
          }
          ctx.fill()
        }
      })

      // particles
      for (const p of particles.current) {
        ctx.globalAlpha = Math.max(0, p.life / p.max)
        if (p.text) {
          ctx.fillStyle = '#fff'
          ctx.font = `bold ${c * 0.8}px system-ui, sans-serif`
          ctx.fillText(p.text, p.x * c, p.y * c)
        } else {
          ctx.fillStyle = p.color
          ctx.fillRect(p.x * c - 2, p.y * c - 2, 4, 4)
        }
      }
      ctx.globalAlpha = 1

      // overlays
      if (phaseRef.current === 'countdown') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.fillRect(0, 0, W, H)
        const n = Math.ceil(countdownRef.current / 800)
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${c * 4}px system-ui, sans-serif`
        ctx.fillText(String(n), W / 2, H / 2)
      }
      if (pausedRef.current) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${c * 1.6}px system-ui, sans-serif`
        ctx.fillText('일시정지', W / 2, H / 2)
      }
    }

    raf = requestAnimationFrame(loop)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Swipe on the board (only when one human plays).
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if (humans.length !== 1) return
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    if (pausedRef.current) setPause(false)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const sw = swipe.current
    if (!sw || sw.id !== e.pointerId) return
    const dx = e.clientX - sw.x
    const dy = e.clientY - sw.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return
    turn(humans[0], Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
  }
  const onPointerUp = () => {
    swipe.current = null
  }

  const s = stateRef.current
  const resultTitle = (() => {
    if (!over) return ''
    if (players.length === 1) return `${over.snakes[0].score}점!`
    if (over.winner === -1) return '무승부!'
    return `🏆 ${players[over.winner ?? 0].name} 승리!`
  })()

  return (
    <div className="snake-game">
      <div className="snake-hud">
        {players.map((p, i) => (
          <span key={i} className="snake-chip">
            <i style={{ background: SNAKE_COLORS[i].body }} />
            {p.isAI ? '🤖 ' : ''}
            {p.name} <strong>{scores[i]}</strong>
          </span>
        ))}
        {solo && best != null && <span className="snake-best">최고 {best}</span>}
        <button className="btn small snake-pause" onClick={() => setPause(!paused)} aria-label={paused ? '계속하기' : '일시정지'}>
          {paused ? '▶' : '⏸'}
        </button>
      </div>
      <div className="snake-board-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="snake-canvas"
          style={{ width: cell * s.cols, height: cell * s.rows }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {over && (
          <div className="snake-result">
            <Result title={resultTitle} onAgain={onAgain}>
              {solo ? (
                <p>{newRecord ? '🎉 새로운 최고 기록!' : best != null ? `최고 기록: ${best}점` : ''}</p>
              ) : players.length === 1 ? null : (
                <p>
                  {players.map((p, i) => `${p.name} ${over.snakes[i].score}점`).join(' · ')}
                </p>
              )}
              <button className="btn ghost" onClick={onSetup}>
                설정으로
              </button>
            </Result>
          </div>
        )}
      </div>
      {humans.length > 0 && (
        <div className={`snake-pads ${humans.length === 2 ? 'two' : ''}`}>
          {humans.map((h) => (
            <DPad key={h} color={SNAKE_COLORS[h].body} label={humans.length === 2 ? players[h].name : undefined} onDir={(d) => turn(h, d)} />
          ))}
        </div>
      )}
      {humans.length === 1 && <p className="snake-hint">화면을 밀거나 방향키·WASD로 조종해요</p>}
      {humans.length === 2 && <p className="snake-hint">키보드: 왼쪽 WASD · 오른쪽 방향키</p>}
    </div>
  )
}

function DPad({ onDir, color, label }: { onDir: (d: Dir) => void; color: string; label?: string }) {
  const btn = (d: Dir, txt: string) => (
    <button
      className={`snake-pad-btn ${d}`}
      style={{ borderColor: color }}
      onPointerDown={(e) => {
        e.preventDefault()
        onDir(d)
      }}
      aria-label={{ up: '위', down: '아래', left: '왼쪽', right: '오른쪽' }[d]}
    >
      {txt}
    </button>
  )
  return (
    <div className="snake-pad">
      {btn('up', '▲')}
      {btn('left', '◀')}
      <span className="snake-pad-mid" style={{ background: color }}>
        {label?.slice(0, 2)}
      </span>
      {btn('right', '▶')}
      {btn('down', '▼')}
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
