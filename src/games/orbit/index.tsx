import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Modal } from '../../components/Modal'
import { load, save, useStored } from '../../lib/storage'
import { iconPoints, innerFraction, nestedRadii, unitVertex } from './geom'
import {
  BOOST_MAX,
  MAX_SHIPS,
  OFFLINE_CAP,
  OFFLINE_RATE,
  PRESTIGE_MIN,
  SHAPES,
  STARDUST_BONUS,
  applyOffline,
  buy,
  canSupernova,
  formatDuration,
  formatKo,
  globalMult,
  incomePerSec,
  milestoneMult,
  newGame,
  nextMilestone,
  nextShape,
  normalize,
  quote,
  serialize,
  shapeIncome,
  stardustGain,
  step,
  supernova,
  tapBoost,
  unlock,
  vertexValue,
  type BuyAmount,
  type OrbitEvent,
  type OrbitState,
  type UpgradeKind,
} from './logic'
import './orbit.css'

const SAVE_KEY = 'orbit:save'
type Saved = ReturnType<typeof serialize> & { savedAt?: number }
interface OfflineInfo {
  coins: number
  seconds: number
  capped: boolean
}

function loadInitial(): { state: OrbitState; offline: OfflineInfo | null } {
  const raw = load<Saved | null>(SAVE_KEY, null)
  const state = raw ? normalize(raw) : newGame()
  let offline: OfflineInfo | null = null
  if (raw && typeof raw.savedAt === 'number') {
    const away = (Date.now() - raw.savedAt) / 1000
    if (away > 5) {
      const coins = applyOffline(state, away)
      if (away >= 60 && coins > 0) offline = { coins, seconds: Math.min(away, OFFLINE_CAP), capped: away > OFFLINE_CAP }
    }
  }
  return { state, offline }
}

/** Visual-only effects shared between React handlers and the canvas loop. */
interface Fx {
  ripples: { x: number; y: number; t: number }[]
  pulse: number[]
  nova: number
  banner: { text: string; sub: string; t: number } | null
  unlockBurst: number | null
  tapped: boolean
  /** Set when the run resets: drop pops/particles of the old run. */
  clear: boolean
}

const KIND_INFO: Record<UpgradeKind, { icon: string; label: string }> = {
  ships: { icon: '🚀', label: '우주선' },
  speed: { icon: '⚡', label: '속도' },
  value: { icon: '💎', label: '가치' },
}

export default function Orbit() {
  const [init] = useState(loadInitial)
  const stateRef = useRef(init.state)
  const [offline, setOffline] = useState<OfflineInfo | null>(init.offline)
  const [amount, setAmount] = useStored<BuyAmount>('orbit:amount', 1)
  const [, setTick] = useState(0)
  const [modal, setModal] = useState<null | 'nova' | 'reset'>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fx = useRef<Fx>({ ripples: [], pulse: [], nova: 0, banner: null, unlockBurst: null, tapped: false, clear: false })
  const rerender = useCallback(() => setTick((t) => t + 1), [])

  const persist = useCallback(() => {
    save<Saved>(SAVE_KEY, { ...serialize(stateRef.current), savedAt: Date.now() })
  }, [])

  // Fit the game to the viewport height (canvas on top, scrolling panel below).
  useLayoutEffect(() => {
    const fit = () => {
      const el = rootRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      el.style.height = `${Math.max(540, window.innerHeight - top - 12)}px`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  // Autosave + offline earnings when coming back to the tab.
  useEffect(() => {
    let hiddenAt: number | null = null
    const iv = window.setInterval(persist, 5000)
    const hud = window.setInterval(rerender, 200)
    const onVis = () => {
      if (document.hidden) {
        hiddenAt = Date.now()
        persist()
      } else if (hiddenAt != null) {
        const away = (Date.now() - hiddenAt) / 1000
        hiddenAt = null
        if (away > 5) {
          const coins = applyOffline(stateRef.current, away)
          if (away >= 60 && coins > 0) setOffline({ coins, seconds: Math.min(away, OFFLINE_CAP), capped: away > OFFLINE_CAP })
          persist()
          rerender()
        }
      }
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', persist)
    return () => {
      window.clearInterval(iv)
      window.clearInterval(hud)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', persist)
      persist()
    }
  }, [persist, rerender])

  // Simulation + rendering loop.
  useEffect(() => {
    const cv = canvasRef.current!
    const stage = stageRef.current!
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let raf = 0
    let last = performance.now()
    let W = 0
    let H = 0
    let dpr = 1
    let bg: HTMLCanvasElement | null = null
    const stars = Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.3,
      tw: Math.random() * Math.PI * 2,
      sp: 0.8 + Math.random() * 2,
    }))
    let dispR: number[] = []
    const vflash: number[][] = SHAPES.map((d) => new Array(d.k).fill(0))
    const popAcc: { sum: number; last: number }[][] = SHAPES.map((d) => Array.from({ length: d.k }, () => ({ sum: 0, last: -1 })))
    type Pop = { x: number; y: number; t: number; text: string; color: string; big: boolean }
    let pops: Pop[] = []
    type Part = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string }
    let parts: Part[] = []
    const events: OrbitEvent[] = []
    let clock = 0

    const buildBg = () => {
      bg = document.createElement('canvas')
      bg.width = cv.width
      bg.height = cv.height
      const g = bg.getContext('2d')!
      g.scale(dpr, dpr)
      const base = g.createLinearGradient(0, 0, 0, H)
      base.addColorStop(0, '#070a1c')
      base.addColorStop(1, '#0d0820')
      g.fillStyle = base
      g.fillRect(0, 0, W, H)
      const neb = (x: number, y: number, r: number, c: string) => {
        const rg = g.createRadialGradient(x, y, 0, x, y, r)
        rg.addColorStop(0, c)
        rg.addColorStop(1, 'rgba(0,0,0,0)')
        g.fillStyle = rg
        g.fillRect(0, 0, W, H)
      }
      neb(W * 0.2, H * 0.25, Math.max(W, H) * 0.6, 'rgba(80,40,160,0.28)')
      neb(W * 0.85, H * 0.8, Math.max(W, H) * 0.55, 'rgba(20,110,160,0.22)')
      neb(W * 0.5, H * 0.5, Math.min(W, H) * 0.5, 'rgba(255,255,255,0.03)')
      // dim static stars
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.35})`
        const s = Math.random() < 0.9 ? 1 : 1.6
        g.fillRect(Math.random() * W, Math.random() * H, s, s)
      }
    }

    const resize = () => {
      const r = stage.getBoundingClientRect()
      W = r.width
      H = r.height
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.width = Math.max(1, Math.round(W * dpr))
      cv.height = Math.max(1, Math.round(H * dpr))
      buildBg()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(stage)

    const geom = (i: number) => {
      const cx = W / 2
      const cy = H / 2 + 8
      const rot = clock * 0.035 * (i % 2 ? -1 : 1)
      const dir = i % 2 ? -1 : 1
      return { cx, cy, r: dispR[i] ?? 0, rot, dir }
    }
    type G = ReturnType<typeof geom>
    const vpos = (i: number, g: G, j: number): [number, number] => {
      const [x, y] = unitVertex(SHAPES[i], j, g.rot, g.dir)
      return [g.cx + x * g.r, g.cy + y * g.r]
    }
    const burst = (x: number, y: number, color: string, n: number, speed: number) => {
      for (let q = 0; q < n && parts.length < 320; q++) {
        const a = Math.random() * Math.PI * 2
        const v = speed * (0.3 + Math.random() * 0.9)
        const life = 0.35 + Math.random() * 0.35
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color })
      }
    }

    // Coin pops are budgeted: vertices accumulate earnings and only the
    // biggest pending pile pops every ~0.15s, so the screen never floods.
    let popTimer = 0
    let comboTimer = 0
    let pendingCombo: { x: number; y: number; combo: number; at: number } | null = null
    const handleEvents = () => {
      for (const e of events) {
        const d = SHAPES[e.shape]
        const g = geom(e.shape)
        const [x, y] = vpos(e.shape, g, e.vertex)
        vflash[e.shape][e.vertex] = 1
        popAcc[e.shape][e.vertex].sum += e.value
        if (e.combo >= 2) {
          burst(x, y, '#ffd84a', 4 + e.combo * 2, 60 + e.combo * 18)
          if (!pendingCombo || e.combo >= pendingCombo.combo) pendingCombo = { x, y, combo: e.combo, at: clock }
        } else if (parts.length < 240) burst(x, y, e.lap ? '#ffe07a' : d.color, e.lap ? 4 : 2, e.lap ? 70 : 45)
      }
      events.length = 0
    }
    const schedulePops = (dt: number) => {
      popTimer -= dt
      comboTimer -= dt
      if (pendingCombo && clock - pendingCombo.at > 0.4) pendingCombo = null
      if (pendingCombo && comboTimer <= 0) {
        const c = pendingCombo
        pops.push({ x: c.x, y: c.y - 8, t: 0, text: `콤보 ×${c.combo}!`, color: c.combo >= 4 ? '#ff9a3d' : '#ffd84a', big: true })
        pendingCombo = null
        comboTimer = 0.7
      }
      if (popTimer > 0) return
      popTimer = 0.15
      let bi = -1
      let bj = -1
      let best = 0
      for (let i = 0; i < popAcc.length; i++)
        for (let j = 0; j < popAcc[i].length; j++) {
          const a = popAcc[i][j]
          if (a.sum > best && clock - a.last >= 0.6) {
            best = a.sum
            bi = i
            bj = j
          }
        }
      if (bi < 0 || bi >= stateRef.current.shapes.length) return
      const g = geom(bi)
      const [x, y] = vpos(bi, g, bj)
      popAcc[bi][bj].last = clock
      popAcc[bi][bj].sum = 0
      if (y < 78 && (x < 190 || x > W - 150)) return // keep the HUD readable
      pops.push({ x, y, t: 0, text: `+${formatKo(best)}`, color: SHAPES[bi].color, big: false })
    }

    const draw = (t: number) => {
      const s = stateRef.current
      const F = fx.current
      const unlocked = s.shapes.length
      const preview = nextShape(s) ? 1 : 0
      const count = unlocked + preview
      const rMax = Math.max(40, Math.min(W, H - 16) / 2 - 12)
      const target = nestedRadii(unlocked, rMax * (preview ? 0.9 : 1))
      // locked next shape: a faint ring just outside (may poke past the frame)
      if (preview) target.push(target[unlocked - 1] / (innerFraction(SHAPES[unlocked]) * 0.93))
      for (let i = 0; i < count; i++) {
        if (dispR[i] == null) dispR[i] = i === count - 1 && i > 0 ? target[i] * 1.25 : target[i]
        dispR[i] += (target[i] - dispR[i]) * 0.08
      }
      dispR.length = count

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (bg) ctx.drawImage(bg, 0, 0, W, H)
      const boosting = s.boost > 0
      // twinkling / warp stars
      ctx.globalCompositeOperation = 'lighter'
      for (const st of stars) {
        const x = st.x * W
        const y = st.y * H
        const a = 0.35 + 0.35 * Math.sin(t / 1000 * st.sp + st.tw)
        if (boosting) {
          const dx = x - W / 2
          const dy = y - H / 2
          const len = 0.06 + 0.05 * st.sp
          ctx.strokeStyle = `rgba(190,230,255,${0.25 + a * 0.5})`
          ctx.lineWidth = st.r
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x + dx * len, y + dy * len)
          ctx.stroke()
        } else {
          ctx.fillStyle = `rgba(255,255,255,${a})`
          ctx.beginPath()
          ctx.arc(x, y, st.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalCompositeOperation = 'source-over'

      // shapes
      for (let i = 0; i < count; i++) {
        const d = SHAPES[i]
        const g = geom(i)
        if (g.r < 4) continue
        ctx.beginPath()
        for (let j = 0; j <= d.k; j++) {
          const [x, y] = vpos(i, g, j)
          if (j === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        if (i >= unlocked) {
          const can = s.coins >= d.unlock
          ctx.setLineDash([4, 7])
          ctx.lineWidth = 1.5
          ctx.strokeStyle = can ? d.color : 'rgba(255,255,255,0.16)'
          ctx.globalAlpha = can ? 0.5 + 0.4 * Math.sin(t / 220) : 1
          ctx.stroke()
          ctx.setLineDash([])
          ctx.globalAlpha = 1
          ctx.font = '600 11px system-ui, sans-serif'
          ctx.textAlign = 'right'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = can ? d.color : 'rgba(255,255,255,0.5)'
          ctx.fillText(can ? `✨ ${d.name} 열 수 있어요!` : `🔒 다음 궤도: ${d.name}`, W - 12, s.stardust > 0 ? 46 : 20)
          continue
        }
        const pulse = (F.pulse[i] ?? 0) + (boosting ? 0.35 : 0)
        ctx.fillStyle = d.color
        ctx.globalAlpha = 0.045
        ctx.fill()
        ctx.globalAlpha = 1
        // cheap neon glow: wide translucent strokes instead of shadowBlur
        ctx.strokeStyle = d.color
        ctx.lineJoin = 'round'
        ctx.globalAlpha = 0.12 + pulse * 0.1
        ctx.lineWidth = 10 + pulse * 6
        ctx.stroke()
        ctx.globalAlpha = 0.25 + pulse * 0.1
        ctx.lineWidth = 5 + pulse * 2
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.lineWidth = 2.2 + pulse * 1.5
        ctx.stroke()
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.lineWidth = 0.8
        ctx.stroke()
        // vertices
        const vr = Math.max(2, Math.min(3.5, g.r / 25))
        const edge = (2 * Math.PI * g.r) / d.k
        const glow = Math.max(3, Math.min(9, edge * 0.18))
        for (let j = 0; j < d.k; j++) {
          const [x, y] = vpos(i, g, j)
          const f = vflash[i][j]
          if (f > 0.02) {
            ctx.globalCompositeOperation = 'lighter'
            ctx.globalAlpha = f * 0.35
            ctx.fillStyle = d.color
            ctx.beginPath()
            ctx.arc(x, y, vr + glow * f, 0, Math.PI * 2)
            ctx.fill()
            ctx.globalAlpha = 1
            ctx.globalCompositeOperation = 'source-over'
          }
          ctx.fillStyle = f > 0.3 ? '#fff' : d.color
          ctx.beginPath()
          ctx.arc(x, y, vr + f * 1.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // ships: trails then bodies, batched per shape (vertex table computed once)
      for (let i = 0; i < unlocked; i++) {
        const d = SHAPES[i]
        const g = geom(i)
        if (g.r < 4) continue
        const p = s.shapes[i]
        const k = d.k
        const V = new Float64Array(2 * (k + 1))
        for (let j = 0; j <= k; j++) {
          const [x, y] = vpos(i, g, j)
          V[2 * j] = x
          V[2 * j + 1] = y
        }
        const at = (phase: number, out: number[]) => {
          let ph = phase - Math.floor(phase)
          const seg = ph * k
          const j = Math.min(k - 1, Math.floor(seg))
          ph = seg - j
          const x0 = V[2 * j]
          const y0 = V[2 * j + 1]
          out[0] = x0 + (V[2 * j + 2] - x0) * ph
          out[1] = y0 + (V[2 * j + 3] - y0) * ph
          out[2] = V[2 * j + 2] - x0
          out[3] = V[2 * j + 3] - y0
        }
        const size = Math.max(2.4, Math.min(p.ships < 12 ? 5.5 : 4.4, g.r / 20))
        const perim = g.r * 2 * Math.PI
        const tl = Math.min(0.08, ((boosting ? 26 : 13) * size) / 4 / perim)
        const trails = new Path2D()
        const bodies = new Path2D()
        const cores = new Path2D()
        const A = [0, 0, 0, 0]
        const B = [0, 0, 0, 0]
        for (let j = 0; j < p.ships; j++) {
          const ph = p.phases[j]
          at(ph, A)
          const x = A[0]
          const y = A[1]
          trails.moveTo(x, y)
          at(ph - tl * 0.5, B)
          trails.lineTo(B[0], B[1])
          at(ph - tl, B)
          trails.lineTo(B[0], B[1])
          const len = Math.hypot(A[2], A[3]) || 1
          const hx = A[2] / len
          const hy = A[3] / len
          bodies.moveTo(x + hx * size * 1.6, y + hy * size * 1.6)
          bodies.lineTo(x - hx * size - hy * size, y - hy * size + hx * size)
          bodies.lineTo(x - hx * size * 0.4, y - hy * size * 0.4)
          bodies.lineTo(x - hx * size + hy * size, y - hy * size - hx * size)
          bodies.closePath()
          cores.rect(x - 0.8, y - 0.8, 1.6, 1.6)
        }
        ctx.globalCompositeOperation = 'lighter'
        ctx.strokeStyle = d.color
        ctx.globalAlpha = 0.45
        ctx.lineWidth = size * 0.7
        ctx.lineCap = 'round'
        ctx.stroke(trails)
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = d.color
        ctx.fill(bodies)
        ctx.fillStyle = '#fff'
        ctx.fill(cores)
      }

      // particles
      ctx.globalCompositeOperation = 'lighter'
      for (const q of parts) {
        ctx.globalAlpha = Math.max(0, q.life / q.max)
        ctx.fillStyle = q.color
        ctx.fillRect(q.x - 1.2, q.y - 1.2, 2.4, 2.4)
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      // ripples from taps
      for (const r of F.ripples) {
        ctx.strokeStyle = `rgba(120,220,255,${Math.max(0, 1 - r.t / 0.6)})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(r.x, r.y, 8 + r.t * 90, 0, Math.PI * 2)
        ctx.stroke()
      }

      // floating coin pops
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      for (const p of pops) {
        const life = p.big ? 1.3 : 0.9
        const k = p.t / life
        const sc = p.big ? Math.min(1, p.t / 0.12) * (1 + 0.15 * Math.max(0, 1 - p.t / 0.25)) : 1
        ctx.globalAlpha = Math.max(0, 1 - k * k)
        ctx.font = `800 ${Math.round((p.big ? 15 : 11.5) * sc)}px system-ui, sans-serif`
        const y = p.y - 10 - k * (p.big ? 34 : 26)
        ctx.strokeStyle = 'rgba(5,6,20,0.85)'
        ctx.lineWidth = 3
        ctx.strokeText(p.text, p.x, y)
        ctx.fillStyle = p.color
        ctx.fillText(p.text, p.x, y)
      }
      ctx.globalAlpha = 1

      // boost vignette
      if (boosting) {
        const a = Math.min(1, s.boost / 1.5) * 0.35
        const rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75)
        rg.addColorStop(0, 'rgba(70,227,255,0)')
        rg.addColorStop(1, `rgba(70,227,255,${a})`)
        ctx.fillStyle = rg
        ctx.fillRect(0, 0, W, H)
      }

      // banner (new shape / supernova)
      if (F.banner && F.banner.t > 0) {
        const b = F.banner
        ctx.globalAlpha = Math.min(1, b.t / 0.4)
        ctx.fillStyle = 'rgba(5,6,20,0.55)'
        ctx.fillRect(0, H / 2 - 34, W, 68)
        ctx.fillStyle = '#fff'
        ctx.font = '800 22px system-ui, sans-serif'
        ctx.fillText(b.text, W / 2, H / 2 - 8)
        ctx.font = '13px system-ui, sans-serif'
        ctx.fillStyle = '#ffd84a'
        ctx.fillText(b.sub, W / 2, H / 2 + 16)
        ctx.globalAlpha = 1
      }

      // tap hint for new players
      if (!F.tapped && s.supernovas === 0 && s.shapes.length <= 2 && !boosting) {
        ctx.font = '600 12px system-ui, sans-serif'
        ctx.fillStyle = `rgba(200,240,255,${0.55 + 0.3 * Math.sin(t / 300)})`
        ctx.fillText('👆 우주를 톡톡 누르면 부스트!', W / 2, H - 16)
      }

      if (F.nova > 0) {
        ctx.fillStyle = `rgba(255,250,235,${Math.min(1, F.nova)})`
        ctx.fillRect(0, 0, W, H)
      }
    }

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, Math.max(0, (t - last) / 1000))
      last = t
      clock += dt
      const s = stateRef.current
      // sub-step so combos/vertex flashes stay accurate at low frame rates
      let rest = dt
      while (rest > 1e-6) {
        const h = Math.min(rest, 1 / 60)
        step(s, h, events)
        rest -= h
      }
      handleEvents()
      schedulePops(dt)
      for (const row of vflash) for (let j = 0; j < row.length; j++) row[j] = Math.max(0, row[j] - dt * 3)
      const F = fx.current
      for (let i = 0; i < F.pulse.length; i++) F.pulse[i] = Math.max(0, (F.pulse[i] ?? 0) - dt * 2.5)
      F.ripples = F.ripples.filter((r) => (r.t += dt) < 0.6)
      if (F.banner) {
        F.banner.t -= dt
        if (F.banner.t <= 0) F.banner = null
      }
      F.nova = Math.max(0, F.nova - dt * 1.2)
      if (F.clear) {
        F.clear = false
        pops = []
        parts = []
        pendingCombo = null
        for (const row of popAcc) for (const a of row) a.sum = 0
        dispR = dispR.map((r) => r * 0.3)
      }
      if (F.unlockBurst != null) {
        const i = F.unlockBurst
        F.unlockBurst = null
        const g = geom(i)
        if (dispR[i]) for (let j = 0; j < SHAPES[i].k; j++) burst(...vpos(i, g, j), SHAPES[i].color, 10, 120)
      }
      for (const q of parts) {
        q.x += q.vx * dt
        q.y += q.vy * dt
        q.vx *= 0.94
        q.vy *= 0.94
        q.life -= dt
      }
      parts = parts.filter((q) => q.life > 0)
      for (const p of pops) p.t += dt
      pops = pops.filter((p) => p.t < (p.big ? 1.3 : 0.9))
      if (W > 0 && H > 0) draw(t)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  const s = stateRef.current
  const income = incomePerSec(s)
  const next = nextShape(s)
  const gain = stardustGain(s.runEarned)

  const onTap = (e: React.PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect()
    tapBoost(stateRef.current)
    const F = fx.current
    F.tapped = true
    if (F.ripples.length < 12) F.ripples.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: 0 })
  }
  const doBuy = (i: number, kind: UpgradeKind) => {
    if (buy(stateRef.current, i, kind, amount)) {
      fx.current.pulse[i] = 1
      navigator.vibrate?.(8)
      rerender()
    }
  }
  const doUnlock = () => {
    const st = stateRef.current
    const d = nextShape(st)
    if (d && unlock(st)) {
      fx.current.banner = { text: `${d.name} 열림!`, sub: `꼭짓점 ${d.k}개 — 우주선 1척이 출발했어요`, t: 2 }
      fx.current.unlockBurst = st.shapes.length - 1
      navigator.vibrate?.(30)
      persist()
      rerender()
    }
  }
  const doNova = () => {
    const st = stateRef.current
    const g = stardustGain(st.runEarned)
    if (!canSupernova(st)) return
    stateRef.current = supernova(st)
    fx.current.nova = 1.4
    fx.current.clear = true
    fx.current.banner = { text: '💥 초신성 폭발!', sub: `별가루 +${g} ✨ — 모든 수입 ×${formatMult(globalMult(stateRef.current))}`, t: 3 }
    setModal(null)
    persist()
    rerender()
  }
  const doReset = () => {
    stateRef.current = newGame()
    fx.current.clear = true
    fx.current.tapped = false
    setModal(null)
    persist()
    rerender()
  }

  const order = s.shapes.map((_, i) => i).reverse()

  return (
    <div className="orbit-root" ref={rootRef}>
      <div className="orbit-stage" ref={stageRef} onPointerDown={onTap}>
        <canvas ref={canvasRef} className="orbit-canvas" aria-label="우주선이 도형 테두리를 도는 화면 (누르면 부스트)" />
        <div className="orbit-hud">
          <div className="orbit-coins">
            <span aria-hidden>🪙</span> {formatKo(s.coins)}
          </div>
          <div className="orbit-rate">초당 {formatKo(income)}</div>
        </div>
        {s.stardust > 0 && (
          <div className="orbit-dust" title="별가루 보너스">
            ✨ {formatKo(s.stardust)} <small>×{formatMult(globalMult(s))}</small>
          </div>
        )}
        <div className={`orbit-boost${s.boost > 0 ? ' on' : ''}`} aria-hidden={s.boost <= 0}>
          <span>⚡ 부스트 ×2</span>
          <i style={{ width: `${(s.boost / BOOST_MAX) * 100}%` }} />
        </div>
      </div>

      <div className="orbit-panel">
        <div className="orbit-toolbar">
          <div className="segmented" role="group" aria-label="구매 수량">
            {([1, 10, 'max'] as BuyAmount[]).map((a) => (
              <button key={a} className={amount === a ? 'active' : ''} onClick={() => setAmount(a)}>
                {a === 'max' ? '최대' : `×${a}`}
              </button>
            ))}
          </div>
          <button
            className={`btn small orbit-nova${gain > 0 ? ' ready' : ''}`}
            onClick={() => setModal('nova')}
            aria-label="초신성"
          >
            💥 {gain > 0 ? `초신성 +${gain}✨` : '초신성'}
          </button>
        </div>

        {next && (
          <div className="orbit-unlock">
            <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden className="orbit-icon locked">
              <polygon points={iconPoints(next, 34)} style={{ stroke: next.color }} />
            </svg>
            <div className="orbit-unlock-text">
              <strong>{next.name}</strong>
              <small>꼭짓점 {next.k}개 · 새 궤도</small>
              <div className="orbit-bar">
                <i style={{ width: `${Math.min(100, (s.coins / next.unlock) * 100)}%`, background: next.color }} />
              </div>
            </div>
            <button className="btn primary orbit-unlock-btn" disabled={s.coins < next.unlock} onClick={doUnlock}>
              열기
              <small>🪙 {formatKo(next.unlock)}</small>
            </button>
          </div>
        )}

        {order.map((i) => (
          <ShapeRow key={i} s={s} i={i} amount={amount} onBuy={doBuy} />
        ))}

        <div className="orbit-foot">
          <span>최고 콤보 ×{Math.max(1, s.bestCombo)}</span>
          <span>총 {formatKo(s.totalEarned)} 코인</span>
          {s.supernovas > 0 && <span>초신성 {s.supernovas}회</span>}
          <button className="btn ghost small" onClick={() => setModal('reset')}>
            처음부터
          </button>
        </div>
      </div>

      {offline && (
        <Modal title="다시 오셨네요! 👋" onClose={() => setOffline(null)}>
          <div className="orbit-offline">
            <div className="orbit-offline-ships" aria-hidden>
              🚀✨🪙
            </div>
            <p>
              {formatDuration(offline.seconds)} 동안 우주선들이 쉬지 않고 날았어요.
              <br />
              그동안 <strong>🪙 {formatKo(offline.coins)}</strong> 코인을 모았어요!
            </p>
            <p className="muted orbit-small">
              자리를 비운 동안은 평소의 {Math.round(OFFLINE_RATE * 100)}%만 벌어요 (최대 {OFFLINE_CAP / 3600}시간
              {offline.capped ? ' — 다 채웠어요!' : ''}).
            </p>
            <button className="btn primary big" onClick={() => setOffline(null)}>
              받기
            </button>
          </div>
        </Modal>
      )}

      {modal === 'nova' && (
        <Modal title="💥 초신성" onClose={() => setModal(null)}>
          <div className="orbit-novabox">
            {gain > 0 ? (
              <>
                <p>
                  모든 도형·우주선·코인이 사라지는 대신 <strong>별가루 ✨ {gain}개</strong>를 받아요.
                </p>
                <p>
                  별가루 1개당 모든 수입이 영구히 +{Math.round(STARDUST_BONUS * 100)}%예요.
                  <br />
                  지금 ×{formatMult(globalMult(s))} → 폭발 후{' '}
                  <strong>×{formatMult(globalMult({ stardust: s.stardust + gain }))}</strong>
                </p>
                <div className="btn-row">
                  <button className="btn ghost" onClick={() => setModal(null)}>
                    조금 더 모을래요
                  </button>
                  <button className="btn accent" onClick={doNova}>
                    폭발시키기!
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  이번 회차에 <strong>{formatKo(PRESTIGE_MIN)}</strong> 코인을 벌면 초신성을 일으킬 수 있어요. 처음부터 다시
                  시작하지만, 영원히 남는 별가루 ✨로 모든 수입이 늘어나요.
                </p>
                <div className="orbit-bar big">
                  <i style={{ width: `${Math.min(100, (s.runEarned / PRESTIGE_MIN) * 100)}%` }} />
                </div>
                <p className="muted orbit-small center">
                  {formatKo(s.runEarned)} / {formatKo(PRESTIGE_MIN)}
                </p>
                <button className="btn primary orbit-wide" onClick={() => setModal(null)}>
                  알겠어요
                </button>
              </>
            )}
          </div>
        </Modal>
      )}

      {modal === 'reset' && (
        <Modal title="처음부터 다시 할까요?" onClose={() => setModal(null)}>
          <p>코인, 도형, 우주선, 별가루까지 모든 기록이 지워져요. 되돌릴 수 없어요.</p>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setModal(null)}>
              취소
            </button>
            <button className="btn danger" onClick={doReset}>
              모두 지우기
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function formatMult(m: number): string {
  return m < 10 ? m.toFixed(1).replace(/\.0$/, '') : formatKo(Math.round(m))
}

function ShapeRow({ s, i, amount, onBuy }: { s: OrbitState; i: number; amount: BuyAmount; onBuy: (i: number, k: UpgradeKind) => void }) {
  const d = SHAPES[i]
  const p = s.shapes[i]
  const ms = nextMilestone(p.ships)
  const prevMs = [0, 25, 50, 100, 150].filter((m) => m <= p.ships).pop() ?? 0
  const mult = milestoneMult(p.ships)
  return (
    <div className="orbit-row" style={{ ['--oc' as string]: d.color }}>
      <div className="orbit-row-head">
        <svg width="30" height="30" viewBox="0 0 34 34" aria-hidden className="orbit-icon">
          <polygon points={iconPoints(d, 34)} style={{ stroke: d.color }} />
        </svg>
        <div className="orbit-row-title">
          <strong>{d.name}</strong>
          <small>
            꼭짓점당 {formatKo(vertexValue(s, i))}
            {mult > 1 && <em> ×{mult}</em>}
          </small>
        </div>
        <div className="orbit-row-income">
          <strong>{formatKo(shapeIncome(s, i))}</strong>
          <small>/초</small>
        </div>
      </div>
      {ms != null && (
        <div className="orbit-ms" title="다음 2배까지">
          <div className="orbit-bar">
            <i style={{ width: `${((p.ships - prevMs) / (ms - prevMs)) * 100}%` }} />
          </div>
          <small>
            {ms}척이면 2배 ({p.ships}/{ms})
          </small>
        </div>
      )}
      <div className="orbit-btns">
        {(['ships', 'speed', 'value'] as UpgradeKind[]).map((kind) => {
          const q = quote(s, i, kind, amount)
          const info = KIND_INFO[kind]
          const level = kind === 'ships' ? `${p.ships}척` : `Lv.${kind === 'speed' ? p.speedLv : p.valueLv}`
          const maxed = q.count === 0
          return (
            <button key={kind} className="orbit-buy" disabled={maxed || !q.affordable} onClick={() => onBuy(i, kind)}>
              <span className="orbit-buy-top">
                {info.icon} {info.label} <b>{level}</b>
              </span>
              <span className="orbit-buy-cost">
                {maxed ? (kind === 'ships' && p.ships >= MAX_SHIPS ? '가득!' : '최대') : `${q.count > 1 ? `+${q.count} ` : ''}🪙${formatKo(q.cost)}`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
