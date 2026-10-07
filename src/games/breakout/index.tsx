import { useEffect, useRef, useState } from 'react'
import { Result } from '../../components/Result'
import { useBestScore } from '../../lib/storage'
import {
  BALL_R,
  H,
  NO_INPUT,
  PADDLE_H,
  PADDLE_Y,
  W,
  levelName,
  newGame,
  nextLevel,
  step,
  type BreakoutState,
  type Input,
  type PowerType,
} from './logic'
import './breakout.css'

const POWER_INFO: Record<PowerType, { label: string; color: string; name: string }> = {
  multi: { label: '×3', color: '#5b9cf0', name: '멀티볼' },
  wide: { label: '↔', color: '#4fc38a', name: '넓은 패들' },
  laser: { label: '⚡', color: '#e0525e', name: '레이저' },
  slow: { label: '🐢', color: '#b48ce8', name: '느린 공' },
  life: { label: '♥', color: '#ff7aa8', name: '목숨 +1' },
}

const ROW_COLORS = ['#ef6f6c', '#f39a4d', '#f5c84c', '#8fd16a', '#4fc3a1', '#4fb3e8', '#7b8cf0', '#b48ce8', '#ef7fb8', '#ef6f6c']
const HP_COLORS = ['', '', '#f5c84c', '#f08a4b', '#d9475a']

export default function Breakout() {
  const [playing, setPlaying] = useState(0)
  const { best } = useBestScore('breakout')
  const { best: bestLevel } = useBestScore('breakout-level')
  if (!playing) {
    return (
      <div className="setup card-panel breakout-start">
        <div className="breakout-logo" aria-hidden>
          {ROW_COLORS.slice(0, 5).map((c, i) => (
            <i key={i} style={{ background: c }} />
          ))}
        </div>
        <p className="center breakout-intro">패들로 공을 튕겨 벽돌을 모두 깨세요. 아이템을 받으면 더 신나요!</p>
        <div className="breakout-records">
          <div>
            <small>최고 점수</small>
            <strong>{best ?? '-'}</strong>
          </div>
          <div>
            <small>최고 레벨</small>
            <strong>{bestLevel ?? '-'}</strong>
          </div>
        </div>
        <button className="btn primary big" onClick={() => setPlaying(1)}>
          게임 시작
        </button>
        <p className="muted center breakout-small">손가락으로 끌기 · 마우스 · ←→ 키로 패들을 움직이고, 떼거나 스페이스로 발사해요</p>
      </div>
    )
  }
  return <Play key={playing} onAgain={() => setPlaying((p) => p + 1)} onExit={() => setPlaying(0)} />
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: string
  size: number
  text?: string
}

function Play({ onAgain, onExit }: { onAgain: () => void; onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<BreakoutState>(newGame())
  const input = useRef({ target: null as number | null, left: false, right: false, launch: false })
  const pausedRef = useRef(false)
  const banner = useRef<{ text: string; sub: string; t: number }>({ text: '레벨 1', sub: levelName(1), t: 1600 })
  const [paused, setPaused] = useState(false)
  const [hud, setHud] = useState({ score: 0, level: 1, lives: 3, powers: [] as PowerType[] })
  const [over, setOver] = useState<{ score: number; level: number; newBest: boolean; newLevel: boolean } | null>(null)
  const [scale, setScale] = useState(1)
  const best = useBestScore('breakout')
  const bestLevel = useBestScore('breakout-level')
  const submitRef = useRef({ best: best.submit, level: bestLevel.submit })
  submitRef.current = { best: best.submit, level: bestLevel.submit }

  const setPause = (v: boolean) => {
    if (stateRef.current.phase === 'over') return
    pausedRef.current = v
    setPaused(v)
  }

  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      const availH = Math.max(320, window.innerHeight - top - 20)
      setScale(Math.min(el.clientWidth / W, availH / H, 1.6))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const c = e.code
      if (c === 'ArrowLeft' || c === 'KeyA') input.current.left = down
      else if (c === 'ArrowRight' || c === 'KeyD') input.current.right = down
      else if ((c === 'Space' || c === 'ArrowUp' || c === 'KeyW') && down) {
        if (pausedRef.current) setPause(false)
        else input.current.launch = true
      } else if ((c === 'KeyP' || c === 'Escape') && down) setPause(!pausedRef.current)
      else return
      e.preventDefault()
      if (c === 'ArrowLeft' || c === 'ArrowRight' || c === 'KeyA' || c === 'KeyD') input.current.target = null
    }
    const kd = (e: KeyboardEvent) => onKey(e, true)
    const ku = (e: KeyboardEvent) => onKey(e, false)
    const vis = () => document.hidden && setPause(true)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    document.addEventListener('visibilitychange', vis)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      document.removeEventListener('visibilitychange', vis)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let alive = true
    let particles: Particle[] = []
    let shake = 0
    let flash = 0
    let hudTimer = 0
    let clearTimer = 0
    const trail: { x: number; y: number }[][] = []

    const burst = (x: number, y: number, color: string, n: number, speed = 160) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const v = speed * (0.3 + Math.random())
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, max: 0.5, color, size: 2 + Math.random() * 3 })
      }
    }
    const pushHud = () => {
      const s = stateRef.current
      setHud({
        score: s.score,
        level: s.level,
        lives: s.lives,
        powers: (['wide', 'laser', 'slow'] as const).filter((k) => s.timers[k] > 0),
      })
    }

    const simulate = (dt: number) => {
      const s = stateRef.current
      if (s.phase === 'cleared') {
        clearTimer -= dt
        if (clearTimer <= 0) {
          stateRef.current = nextLevel(s)
          banner.current = { text: `레벨 ${s.level + 1}`, sub: levelName(s.level + 1), t: 1600 }
          pushHud()
        }
        return
      }
      if (s.phase !== 'play') return
      const inp: Input = {
        ...NO_INPUT,
        paddleX: input.current.target,
        move: input.current.left === input.current.right ? 0 : input.current.left ? -1 : 1,
        launch: input.current.launch,
      }
      input.current.launch = false
      input.current.target = null
      // Keep following the last absolute target (mouse) until a new one arrives.
      step(s, dt, inp)
      for (const e of s.events) {
        switch (e.type) {
          case 'brick':
            if (e.steel) burst(e.x, e.y, '#cfd6dd', 4, 90)
            else burst(e.x, e.y, e.destroyed ? ROW_COLORS[Math.floor(e.y / 18) % ROW_COLORS.length] : '#fff', e.destroyed ? 12 : 5)
            if (e.destroyed) shake = Math.max(shake, 0.06)
            break
          case 'paddle':
            burst(e.x, e.y + BALL_R, '#9fe8ff', 4, 80)
            break
          case 'power':
            burst(e.x, e.y, POWER_INFO[e.power].color, 20, 200)
            particles.push({ x: e.x, y: e.y - 20, vx: 0, vy: -40, life: 1, max: 1, color: '#fff', size: 0, text: POWER_INFO[e.power].name })
            navigator.vibrate?.(20)
            break
          case 'lose':
            shake = 0.35
            flash = 0.3
            navigator.vibrate?.([80, 50, 80])
            break
          case 'cleared':
            clearTimer = 1.6
            banner.current = { text: '클리어!', sub: `+${500 + s.level * 100}점`, t: 1500 }
            for (let i = 0; i < 6; i++) burst(Math.random() * W, Math.random() * H * 0.5, ROW_COLORS[i], 14, 220)
            break
          case 'over': {
            const nb = submitRef.current.best(s.score)
            const nl = submitRef.current.level(s.level)
            setTimeout(() => alive && setOver({ score: s.score, level: s.level, newBest: nb, newLevel: nl }), 900)
            break
          }
        }
        if (e.type !== 'wall' && e.type !== 'paddle') hudTimer = 0
      }
    }

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (t - last) / 1000)
      last = t
      if (!pausedRef.current) {
        acc += dt
        const h = 1 / 120
        while (acc >= h) {
          acc -= h
          simulate(h)
        }
        for (const p of particles) {
          p.x += p.vx * dt
          p.y += p.vy * dt
          p.vy += p.text ? 0 : 300 * dt
          p.life -= dt
        }
        particles = particles.filter((p) => p.life > 0)
        shake = Math.max(0, shake - dt)
        flash = Math.max(0, flash - dt)
        banner.current.t -= dt * 1000
        hudTimer -= dt
        if (hudTimer <= 0) {
          hudTimer = 0.25
          pushHud()
        }
        const s = stateRef.current
        while (trail.length < s.balls.length) trail.push([])
        trail.length = s.balls.length
        s.balls.forEach((b, i) => {
          trail[i].unshift({ x: b.x, y: b.y })
          if (trail[i].length > 6) trail[i].pop()
        })
      }
      draw(t)
    }

    const draw = (t: number) => {
      const cv = canvasRef.current
      if (!cv) return
      const s = stateRef.current
      const dpr = window.devicePixelRatio || 1
      const k = cv.clientWidth / W
      if (!k) return
      const pw = Math.round(cv.clientWidth * dpr)
      if (cv.width !== pw) {
        cv.width = pw
        cv.height = Math.round(cv.clientHeight * dpr)
      }
      const ctx = cv.getContext('2d')!
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0)
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 30, (Math.random() - 0.5) * shake * 30)
      const g = ctx.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, '#121a33')
      g.addColorStop(1, '#1d1430')
      ctx.fillStyle = g
      ctx.fillRect(-20, -20, W + 40, H + 40)
      // faint grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1
      for (let x = 0; x <= W; x += 30) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
        ctx.stroke()
      }

      // bricks
      for (const b of s.bricks) {
        let color: string
        if (b.steel) color = '#8e99a6'
        else if (b.maxHp === 1) color = ROW_COLORS[b.row % ROW_COLORS.length]
        else color = HP_COLORS[Math.min(4, b.hp)] || ROW_COLORS[b.row % ROW_COLORS.length]
        ctx.fillStyle = color
        rr(ctx, b.x, b.y, b.w, b.h, 3)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, 3)
        ctx.fillStyle = 'rgba(0,0,0,0.18)'
        ctx.fillRect(b.x + 2, b.y + b.h - 3, b.w - 4, 2)
        if (b.steel) {
          ctx.fillStyle = 'rgba(255,255,255,0.6)'
          for (const dx of [5, b.w - 5]) {
            ctx.beginPath()
            ctx.arc(b.x + dx, b.y + b.h / 2, 1.6, 0, Math.PI * 2)
            ctx.fill()
          }
        } else if (b.maxHp > 1) {
          // dots show remaining hits
          ctx.fillStyle = 'rgba(0,0,0,0.45)'
          for (let i = 0; i < b.hp; i++) {
            ctx.beginPath()
            ctx.arc(b.x + b.w / 2 + (i - (b.hp - 1) / 2) * 6, b.y + b.h / 2 + 1, 1.7, 0, Math.PI * 2)
            ctx.fill()
          }
          if (b.hp < b.maxHp) {
            ctx.strokeStyle = 'rgba(0,0,0,0.4)'
            ctx.beginPath()
            ctx.moveTo(b.x + b.w * 0.2, b.y + 2)
            ctx.lineTo(b.x + b.w * 0.35, b.y + b.h * 0.6)
            ctx.lineTo(b.x + b.w * 0.3, b.y + b.h - 2)
            ctx.stroke()
          }
        }
      }

      // drops
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const d of s.drops) {
        const info = POWER_INFO[d.type]
        ctx.fillStyle = info.color
        rr(ctx, d.x - 16, d.y - 8, 32, 16, 8)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 11px system-ui, sans-serif'
        ctx.fillText(info.label, d.x, d.y + 1)
      }

      // bolts
      ctx.fillStyle = '#ff6b6b'
      for (const b of s.bolts) {
        ctx.fillRect(b.x - 1.5, b.y - 8, 3, 12)
      }

      // paddle
      const px = s.paddleX - s.paddleW / 2
      const pg = ctx.createLinearGradient(0, PADDLE_Y, 0, PADDLE_Y + PADDLE_H)
      pg.addColorStop(0, s.timers.laser > 0 ? '#ff9a9a' : '#9fe8ff')
      pg.addColorStop(1, s.timers.laser > 0 ? '#d9475a' : '#3a8fd9')
      ctx.shadowColor = s.timers.laser > 0 ? '#ff6b6b' : '#5bc8ff'
      ctx.shadowBlur = 12
      ctx.fillStyle = pg
      rr(ctx, px, PADDLE_Y, s.paddleW, PADDLE_H, 6)
      ctx.fill()
      ctx.shadowBlur = 0
      if (s.timers.laser > 0) {
        ctx.fillStyle = '#ffd1d1'
        ctx.fillRect(px + 4, PADDLE_Y - 5, 4, 6)
        ctx.fillRect(px + s.paddleW - 8, PADDLE_Y - 5, 4, 6)
      }

      // balls + trail
      s.balls.forEach((b, i) => {
        const tr = trail[i] ?? []
        tr.forEach((p, j) => {
          ctx.globalAlpha = 0.25 * (1 - j / tr.length)
          ctx.fillStyle = s.timers.slow > 0 ? '#b48ce8' : '#9fe8ff'
          ctx.beginPath()
          ctx.arc(p.x, p.y, BALL_R * (1 - j / 10), 0, Math.PI * 2)
          ctx.fill()
        })
        ctx.globalAlpha = 1
        ctx.fillStyle = '#fff'
        ctx.shadowColor = '#fff'
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      })

      // particles
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.max)
        if (p.text) {
          ctx.fillStyle = '#fff'
          ctx.font = 'bold 14px system-ui, sans-serif'
          ctx.fillText(p.text, p.x, p.y)
        } else {
          ctx.fillStyle = p.color
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
        }
      }
      ctx.globalAlpha = 1

      if (flash > 0) {
        ctx.fillStyle = `rgba(255,60,60,${flash})`
        ctx.fillRect(0, 0, W, H)
      }

      // serve hint
      if (s.phase === 'play' && s.balls.some((b) => b.stuck) && banner.current.t <= 0) {
        ctx.fillStyle = `rgba(255,255,255,${0.55 + Math.sin(t / 250) * 0.25})`
        ctx.font = 'bold 15px system-ui, sans-serif'
        ctx.fillText('끌어서 조준 · 떼면 발사!', W / 2, PADDLE_Y - 60)
      }
      if (banner.current.t > 0) {
        const a = Math.min(1, banner.current.t / 300)
        ctx.globalAlpha = a
        ctx.fillStyle = 'rgba(0,0,0,0.4)'
        ctx.fillRect(0, H / 2 - 50, W, 100)
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 34px system-ui, sans-serif'
        ctx.fillText(banner.current.text, W / 2, H / 2 - 10)
        ctx.font = '16px system-ui, sans-serif'
        ctx.fillStyle = '#f5c84c'
        ctx.fillText(banner.current.sub, W / 2, H / 2 + 26)
        ctx.globalAlpha = 1
      }
      if (pausedRef.current) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 30px system-ui, sans-serif'
        ctx.fillText('일시정지', W / 2, H / 2)
        ctx.font = '15px system-ui, sans-serif'
        ctx.fillText('화면을 누르면 계속해요', W / 2, H / 2 + 34)
      }
    }

    raf = requestAnimationFrame(loop)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [])

  // Pointer: mouse = absolute, touch = relative drag (finger never hides the paddle).
  const drag = useRef<{ id: number; x: number; paddle: number; moved: number } | null>(null)
  const toLogical = (clientX: number) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return ((clientX - r.left) / r.width) * W
  }
  const onDown = (e: React.PointerEvent) => {
    if (pausedRef.current) {
      setPause(false)
      return
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { id: e.pointerId, x: toLogical(e.clientX), paddle: stateRef.current.paddleX, moved: 0 }
    if (e.pointerType === 'mouse') input.current.target = toLogical(e.clientX)
  }
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (!pausedRef.current) input.current.target = toLogical(e.clientX)
      return
    }
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const x = toLogical(e.clientX)
    d.moved = Math.max(d.moved, Math.abs(x - d.x))
    input.current.target = d.paddle + (x - d.x) * 1.25
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    input.current.launch = true
  }

  return (
    <div className="breakout-game">
      <div className="breakout-hud">
        <span className="breakout-stat">
          <small>점수</small>
          <strong>{hud.score}</strong>
        </span>
        <span className="breakout-stat">
          <small>레벨</small>
          <strong>{hud.level}</strong>
        </span>
        <span className="breakout-lives" aria-label={`목숨 ${hud.lives}`}>
          {'❤️'.repeat(Math.min(hud.lives, 5))}
          {hud.lives > 5 && <small>+{hud.lives - 5}</small>}
        </span>
        <span className="breakout-powers">
          {hud.powers.map((p) => (
            <i key={p} style={{ background: POWER_INFO[p].color }} title={POWER_INFO[p].name}>
              {POWER_INFO[p].label}
            </i>
          ))}
        </span>
        <button className="btn small breakout-pause" onClick={() => setPause(!paused)} aria-label={paused ? '계속하기' : '일시정지'}>
          {paused ? '▶' : '⏸'}
        </button>
      </div>
      <div className="breakout-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="breakout-canvas"
          style={{ width: W * scale, height: H * scale }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        {over && (
          <div className="breakout-result">
            <Result title={`${over.score}점!`} onAgain={onAgain}>
              <p>
                레벨 {over.level}까지 도달
                <br />
                {over.newBest ? '🎉 새로운 최고 점수!' : `최고 점수: ${best.best ?? over.score}점`}
                {over.newLevel && over.level > 1 && (
                  <>
                    <br />
                    🏅 최고 레벨 갱신!
                  </>
                )}
              </p>
              <button className="btn ghost" onClick={onExit}>
                처음으로
              </button>
            </Result>
          </div>
        )}
      </div>
    </div>
  )
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
