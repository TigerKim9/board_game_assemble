// Canvas rendering for 타워 디펜스. Coordinates in the simulation are tile units.
import {
  COLS,
  ENEMIES,
  HEAL_RADIUS,
  ROWS,
  TOWERS,
  isBuildable,
  type Enemy,
  type LevelStats,
  type MapDef,
  type State,
  type Tower,
} from './logic'

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
}

export interface View {
  tile: number
  particles: Particle[]
  lastFx: number
  /** Selected tile (build menu) or tower. */
  selTile: { c: number; r: number } | null
  selTower: number | null
  /** Real-time clock for idle animations (seconds). */
  clock: number
  playerColors: string[]
  coop: boolean
}

export const PLAYER_COLORS = ['#e8613a', '#2f7fd8']

const ENEMY_COLORS: Record<string, string> = {
  normal: '#5cc35a',
  fast: '#f2c230',
  tank: '#7d8794',
  flying: '#9b5fd6',
  swarm: '#d0603c',
  healer: '#f4f4ee',
  boss: '#b0283a',
}

export function makeBackground(map: MapDef, tile: number, dpr: number): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = Math.round(COLS * tile * dpr)
  cv.height = Math.round(ROWS * tile * dpr)
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = map.grass[(r + c) % 2]
      ctx.fillRect(c * tile, r * tile, tile + 0.5, tile + 0.5)
    }
  // road: thick stroked polyline through the waypoints
  const pts = map.waypoints.map(([c, r]) => [(c + 0.5) * tile, (r + 0.5) * tile] as const)
  const road = () => {
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  }
  ctx.lineJoin = 'round'
  ctx.lineCap = 'butt'
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = tile * 0.98
  road()
  ctx.stroke()
  ctx.strokeStyle = map.road
  ctx.lineWidth = tile * 0.86
  road()
  ctx.stroke()
  ctx.setLineDash([tile * 0.18, tile * 0.32])
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = Math.max(1, tile * 0.05)
  road()
  ctx.stroke()
  ctx.setLineDash([])
  // pebbles on grass
  let seed = 7
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (!isBuildable(map, c, r)) continue
      ctx.fillStyle = 'rgba(0,0,0,0.07)'
      for (let k = 0; k < 2; k++) {
        ctx.beginPath()
        ctx.arc((c + 0.15 + rnd() * 0.7) * tile, (r + 0.15 + rnd() * 0.7) * tile, tile * 0.035, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  // decorations
  for (const b of map.blocked) {
    const x = (b.c + 0.5) * tile
    const y = (b.r + 0.5) * tile
    if (b.type === 'water') {
      ctx.fillStyle = '#4aa3d8'
      roundRect(ctx, b.c * tile + 2, b.r * tile + 2, tile - 4, tile - 4, tile * 0.25)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(x - tile * 0.1, y, tile * 0.15, Math.PI * 1.1, Math.PI * 1.9)
      ctx.stroke()
    } else if (b.type === 'rock') {
      ctx.fillStyle = 'rgba(0,0,0,0.15)'
      ctx.beginPath()
      ctx.ellipse(x, y + tile * 0.22, tile * 0.32, tile * 0.1, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#9a958c'
      ctx.beginPath()
      ctx.moveTo(x - tile * 0.32, y + tile * 0.2)
      ctx.lineTo(x - tile * 0.2, y - tile * 0.15)
      ctx.lineTo(x + tile * 0.05, y - tile * 0.25)
      ctx.lineTo(x + tile * 0.3, y - tile * 0.05)
      ctx.lineTo(x + tile * 0.32, y + tile * 0.2)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.beginPath()
      ctx.moveTo(x - tile * 0.18, y - tile * 0.1)
      ctx.lineTo(x + tile * 0.04, y - tile * 0.2)
      ctx.lineTo(x, y)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.15)'
      ctx.beginPath()
      ctx.ellipse(x, y + tile * 0.3, tile * 0.28, tile * 0.09, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#7a5230'
      ctx.fillRect(x - tile * 0.05, y + tile * 0.1, tile * 0.1, tile * 0.2)
      ctx.fillStyle = map.id === 'frost' ? '#3f7d6a' : '#2f7d3a'
      for (const [dy, w] of [
        [0.05, 0.32],
        [-0.12, 0.25],
        [-0.27, 0.17],
      ] as const) {
        ctx.beginPath()
        ctx.moveTo(x - tile * w, y + tile * (dy + 0.1))
        ctx.lineTo(x, y + tile * (dy - 0.2))
        ctx.lineTo(x + tile * w, y + tile * (dy + 0.1))
        ctx.closePath()
        ctx.fill()
      }
      if (map.id === 'frost') {
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.beginPath()
        ctx.moveTo(x - tile * 0.1, y - tile * 0.3)
        ctx.lineTo(x, y - tile * 0.47)
        ctx.lineTo(x + tile * 0.1, y - tile * 0.3)
        ctx.closePath()
        ctx.fill()
      }
    }
  }
  // goal marker at the exit
  const last = map.waypoints[map.waypoints.length - 1]
  const prev = map.waypoints[map.waypoints.length - 2]
  const gx = Math.min(COLS - 0.5, Math.max(0.5, last[0] + 0.5 - Math.sign(last[0] - prev[0]) * 0.5))
  const gy = Math.min(ROWS - 0.5, Math.max(0.5, last[1] + 0.5 - Math.sign(last[1] - prev[1]) * 0.5))
  ctx.font = `${Math.round(tile * 0.55)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🏰', gx * tile, gy * tile)
  const first = map.waypoints[0]
  const nxt = map.waypoints[1]
  const sx = Math.min(COLS - 0.5, Math.max(0.5, first[0] + 0.5 + Math.sign(nxt[0] - first[0])))
  const sy = Math.min(ROWS - 0.5, Math.max(0.5, first[1] + 0.5 + Math.sign(nxt[1] - first[1])))
  ctx.globalAlpha = 0.55
  ctx.fillText('⚠️', sx * tile, sy * tile)
  ctx.globalAlpha = 1
  return cv
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

function burst(v: View, x: number, y: number, color: string, n: number, speed: number, size: number) {
  if (v.particles.length > 260) return
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = speed * (0.4 + Math.random() * 0.8)
    const life = 0.35 + Math.random() * 0.35
    v.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, size: size * (0.6 + Math.random() * 0.6), color })
  }
}

/** Turns new simulation fx into particles, advances particles by real dt. */
export function updateParticles(v: View, s: State, dt: number) {
  for (const f of s.fx) {
    if (f.id <= v.lastFx) continue
    if (f.kind === 'death') burst(v, f.x, f.y, ENEMY_COLORS[f.color ?? 'normal'] ?? '#fff', f.color === 'boss' ? 28 : 9, 2.2, 0.07)
    else if (f.kind === 'boom') burst(v, f.x, f.y, '#ffb347', 7, 2.5, 0.05)
    else if (f.kind === 'build') burst(v, f.x, f.y, '#fff3c4', 10, 1.8, 0.05)
    else if (f.kind === 'poof') burst(v, f.x, f.y, '#c8c2b5', 12, 1.6, 0.07)
  }
  for (const f of s.fx) v.lastFx = Math.max(v.lastFx, f.id)
  for (const p of v.particles) {
    p.life -= dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vx *= 0.92
    p.vy *= 0.92
  }
  if (v.particles.some((p) => p.life <= 0)) v.particles = v.particles.filter((p) => p.life > 0)
}

export function drawFrame(ctx: CanvasRenderingContext2D, s: State, v: View, bg: HTMLCanvasElement) {
  const T = v.tile
  const W = COLS * T
  const H = ROWS * T
  ctx.save()
  if (s.shake > 0) {
    const m = Math.min(0.12, s.shake * 0.3) * T
    ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m)
  }
  ctx.clearRect(-20, -20, W + 40, H + 40)
  ctx.drawImage(bg, 0, 0, W, H)

  // selected tile highlight
  if (v.selTile) {
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2.5
    ctx.setLineDash([5, 4])
    ctx.strokeRect(v.selTile.c * T + 2, v.selTile.r * T + 2, T - 4, T - 4)
    ctx.setLineDash([])
  }

  // heal auras
  for (const e of s.enemies) {
    if (e.kind !== 'healer') continue
    ctx.fillStyle = 'rgba(120,230,120,0.10)'
    ctx.beginPath()
    ctx.arc(e.x * T, e.y * T, HEAL_RADIUS * T * (0.85 + 0.15 * Math.sin(v.clock * 4)), 0, Math.PI * 2)
    ctx.fill()
  }

  // ground enemies, then towers, then flyers above
  for (const e of s.enemies) if (!e.flying) drawEnemy(ctx, e, T, v.clock)
  for (const t of s.towers) drawTower(ctx, t, T, v)
  for (const e of s.enemies) if (e.flying) drawEnemy(ctx, e, T, v.clock)

  // projectiles
  for (const p of s.projectiles) {
    const x = p.x * T
    const y = p.y * T
    if (p.kind === 'arrow') {
      const a = Math.atan2(p.ty - p.y, p.tx - p.x)
      ctx.strokeStyle = '#5a3b1c'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - Math.cos(a) * T * 0.18, y - Math.sin(a) * T * 0.18)
      ctx.lineTo(x, y)
      ctx.stroke()
    } else {
      const col = p.kind === 'cannon' ? '#2b2b2b' : p.kind === 'ice' ? '#bfe9ff' : '#7ee36a'
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(x, y, T * (p.kind === 'cannon' ? 0.1 + 0.02 * p.level : 0.08), 0, Math.PI * 2)
      ctx.fill()
      if (p.kind !== 'cannon') {
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.beginPath()
        ctx.arc(x - T * 0.02, y - T * 0.02, T * 0.03, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // fx
  for (const f of s.fx) {
    const k = 1 - f.ttl / f.max
    const x = f.x * T
    const y = f.y * T
    ctx.globalAlpha = Math.max(0, 1 - k)
    switch (f.kind) {
      case 'boom':
        ctx.fillStyle = '#ff9a3c'
        ctx.beginPath()
        ctx.arc(x, y, (f.r ?? 1) * T * (0.4 + 0.6 * k), 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#ffe28a'
        ctx.beginPath()
        ctx.arc(x, y, (f.r ?? 1) * T * 0.4 * (1 - k), 0, Math.PI * 2)
        ctx.fill()
        break
      case 'frost':
        ctx.strokeStyle = f.color === 'poison' ? '#6fdc5a' : '#bfefff'
        ctx.fillStyle = f.color === 'poison' ? 'rgba(110,220,90,0.25)' : 'rgba(190,240,255,0.3)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, y, (f.r ?? 0.6) * T * (0.5 + 0.5 * k), 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        break
      case 'zap': {
        const pts = f.pts ?? []
        ctx.strokeStyle = '#fff59a'
        ctx.lineWidth = 3
        ctx.shadowColor = '#ffe14d'
        ctx.shadowBlur = 8
        ctx.beginPath()
        for (let i = 0; i < pts.length; i++) {
          const px = pts[i].x * T
          const py = pts[i].y * T
          if (i === 0) ctx.moveTo(px, py)
          else {
            const ox = pts[i - 1].x * T
            const oy = pts[i - 1].y * T
            const mx = (ox + px) / 2 + (Math.random() - 0.5) * T * 0.35
            const my = (oy + py) / 2 + (Math.random() - 0.5) * T * 0.35
            ctx.lineTo(mx, my)
            ctx.lineTo(px, py)
          }
        }
        ctx.stroke()
        ctx.shadowBlur = 0
        break
      }
      case 'beam': {
        const p = f.pts?.[0]
        if (!p) break
        ctx.strokeStyle = '#e9d7ff'
        ctx.lineWidth = 3 * (1 - k) + 1
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(p.x * T, p.y * T)
        ctx.stroke()
        ctx.strokeStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(p.x * T, p.y * T, T * 0.2 * (1 - k) + 2, 0, Math.PI * 2)
        ctx.stroke()
        break
      }
      case 'heal':
        ctx.strokeStyle = '#7fe07f'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, y, (f.r ?? 1.5) * T * k, 0, Math.PI * 2)
        ctx.stroke()
        break
      case 'death':
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, y, (f.r ?? 0.3) * T * (1 + k), 0, Math.PI * 2)
        ctx.stroke()
        break
      case 'build':
        ctx.strokeStyle = '#fff3c4'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(x, y, T * (0.3 + 0.4 * k), 0, Math.PI * 2)
        ctx.stroke()
        break
      case 'leak':
      case 'gold': {
        ctx.font = `800 ${Math.round(T * 0.38)}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const ty = Math.min(ROWS - 0.5, Math.max(0.6, f.y)) * T - k * T * 0.8
        const tx = Math.min(COLS - 1, Math.max(1, f.x)) * T
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'
        ctx.strokeText(f.kind === 'leak' ? `❤️${f.text}` : `💰${f.text}`, tx, ty)
        ctx.fillStyle = f.kind === 'leak' ? '#ff6b6b' : '#ffd54a'
        ctx.fillText(f.kind === 'leak' ? `❤️${f.text}` : `💰${f.text}`, tx, ty)
        break
      }
      default:
        break
    }
    ctx.globalAlpha = 1
  }

  // particles
  for (const p of v.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max)
    ctx.fillStyle = p.color
    ctx.fillRect(p.x * T - (p.size * T) / 2, p.y * T - (p.size * T) / 2, p.size * T, p.size * T)
  }
  ctx.globalAlpha = 1

  // range circle for the selected tower
  if (v.selTower != null) {
    const t = s.towers.find((x) => x.id === v.selTower)
    if (t) {
      const range = TOWERS[t.kind].levels[t.level - 1].range
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(t.x * T, t.y * T, range * T, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      const next = t.level < 3 ? (TOWERS[t.kind].levels as LevelStats[])[t.level].range : null
      if (next) {
        ctx.setLineDash([4, 5])
        ctx.strokeStyle = 'rgba(255,240,150,0.7)'
        ctx.beginPath()
        ctx.arc(t.x * T, t.y * T, next * T, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  }
  ctx.restore()
}

function drawTower(ctx: CanvasRenderingContext2D, t: Tower, T: number, v: View) {
  const def = TOWERS[t.kind]
  const x = t.x * T
  const y = t.y * T
  const L = t.level
  const sz = T * (0.7 + L * 0.04)
  // shadow + base
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.beginPath()
  ctx.ellipse(x, y + sz * 0.42, sz * 0.48, sz * 0.14, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = L === 3 ? '#8c7a5a' : L === 2 ? '#8f8f96' : '#8a8174'
  roundRect(ctx, x - sz / 2, y - sz / 2, sz, sz, sz * 0.22)
  ctx.fill()
  ctx.lineWidth = L === 1 ? 1.5 : 2.5
  ctx.strokeStyle = L === 3 ? '#f2c94c' : L === 2 ? '#e3e6ea' : 'rgba(0,0,0,0.35)'
  ctx.stroke()
  if (L === 3) {
    ctx.save()
    ctx.shadowColor = '#ffd54a'
    ctx.shadowBlur = 10
    ctx.strokeStyle = 'rgba(255,213,74,0.7)'
    ctx.stroke()
    ctx.restore()
  }
  if (v.coop) {
    ctx.fillStyle = v.playerColors[t.owner] ?? '#fff'
    ctx.beginPath()
    ctx.arc(x - sz / 2 + 4, y - sz / 2 + 4, Math.max(3, T * 0.08), 0, Math.PI * 2)
    ctx.fill()
  }
  // turret
  const rr = sz * 0.3
  const flash = t.fired < 0.08
  ctx.save()
  ctx.translate(x, y)
  switch (t.kind) {
    case 'arrow': {
      ctx.fillStyle = '#b5793a'
      circle(ctx, 0, 0, rr)
      ctx.rotate(t.angle)
      ctx.strokeStyle = '#4a2f14'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(rr * 0.2, 0, rr * 0.95, -1.1, 1.1)
      ctx.stroke()
      ctx.strokeStyle = '#eee'
      ctx.lineWidth = 1
      ctx.beginPath()
      const pull = t.fired < 0.15 ? 0 : rr * 0.25
      ctx.moveTo(rr * 0.2 + Math.cos(-1.1) * rr * 0.95, Math.sin(-1.1) * rr * 0.95)
      ctx.lineTo(-pull, 0)
      ctx.lineTo(rr * 0.2 + Math.cos(1.1) * rr * 0.95, Math.sin(1.1) * rr * 0.95)
      ctx.stroke()
      if (L >= 2) {
        ctx.fillStyle = '#d33'
        ctx.fillRect(-rr * 0.7, -2, rr * 0.4, 4)
      }
      break
    }
    case 'cannon': {
      ctx.rotate(t.angle)
      const recoil = Math.max(0, 0.15 - t.fired) * rr * 2
      ctx.fillStyle = '#2f343b'
      ctx.fillRect(-recoil, -rr * (0.28 + L * 0.05), rr * (1.25 + L * 0.1), rr * (0.56 + L * 0.1))
      if (L >= 3) ctx.fillRect(-recoil + rr * 0.9, -rr * 0.5, rr * 0.35, rr)
      ctx.fillStyle = def.color
      circle(ctx, 0, 0, rr * 0.85)
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      circle(ctx, -rr * 0.25, -rr * 0.25, rr * 0.25)
      if (flash) {
        ctx.fillStyle = '#ffcf5a'
        circle(ctx, rr * 1.5, 0, rr * 0.35)
      }
      break
    }
    case 'ice': {
      ctx.rotate(v.clock * 0.8)
      ctx.fillStyle = flash ? '#ffffff' : '#a9e3ff'
      const n = 4 + L
      ctx.beginPath()
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2
        const rad = i % 2 ? rr * 0.45 : rr * 1.05
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad)
      }
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#3a9ad6'
      ctx.lineWidth = 1.5
      ctx.stroke()
      break
    }
    case 'lightning': {
      ctx.fillStyle = '#4b4b5a'
      ctx.fillRect(-rr * 0.3, -rr * 0.2, rr * 0.6, rr * 0.9)
      ctx.fillStyle = flash ? '#ffffff' : '#ffe14d'
      ctx.shadowColor = '#ffe14d'
      ctx.shadowBlur = flash ? 14 : 6
      circle(ctx, 0, -rr * 0.35, rr * (0.55 + 0.08 * L + 0.05 * Math.sin(v.clock * 8)))
      ctx.shadowBlur = 0
      ctx.strokeStyle = '#b07f00'
      ctx.lineWidth = 1.5
      for (let i = 0; i < L; i++) {
        ctx.beginPath()
        ctx.moveTo(-rr * 0.45, rr * (0.1 + i * 0.22))
        ctx.lineTo(rr * 0.45, rr * (0.1 + i * 0.22))
        ctx.stroke()
      }
      break
    }
    case 'sniper': {
      ctx.rotate(t.angle)
      ctx.fillStyle = '#2b2233'
      ctx.fillRect(0, -rr * 0.12, rr * (1.6 + L * 0.2), rr * 0.24)
      ctx.fillStyle = def.color
      circle(ctx, 0, 0, rr * 0.75)
      ctx.fillStyle = '#e9d7ff'
      ctx.fillRect(-rr * 0.2, -rr * 0.55, rr * 0.5, rr * 0.22)
      if (flash) {
        ctx.fillStyle = '#fff'
        circle(ctx, rr * (1.7 + L * 0.2), 0, rr * 0.25)
      }
      break
    }
    case 'poison': {
      ctx.fillStyle = '#3b3b3b'
      circle(ctx, 0, rr * 0.15, rr * 0.9)
      ctx.fillStyle = flash ? '#c6ff9a' : '#59d14a'
      circle(ctx, 0, rr * 0.05, rr * 0.7)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      for (let i = 0; i < L + 1; i++) {
        const ph = (v.clock * 1.5 + i * 0.37) % 1
        circle(ctx, Math.sin(i * 2.1) * rr * 0.4, rr * 0.1 - ph * rr * 1.2, rr * 0.12 * (1 - ph) + 1)
      }
      break
    }
  }
  ctx.restore()
  // level pips
  ctx.fillStyle = '#ffd54a'
  for (let i = 0; i < L; i++) {
    const px = x + (i - (L - 1) / 2) * T * 0.14
    star(ctx, px, y + sz / 2 - T * 0.02, T * 0.065)
  }
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2)
  ctx.fill()
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 ? r * 0.45 : r
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad)
  }
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = 0.8
  ctx.stroke()
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, T: number, clock: number) {
  const def = ENEMIES[e.kind]
  const x = e.x * T
  let y = e.y * T
  const r = def.radius * T
  const bob = Math.sin(clock * 10 + e.id) * T * 0.02
  if (e.flying) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.beginPath()
    ctx.ellipse(x, y + r * 0.9, r * 0.8, r * 0.25, 0, 0, Math.PI * 2)
    ctx.fill()
    y -= T * 0.25 + bob * 2
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.beginPath()
    ctx.ellipse(x, y + r * 0.75, r * 0.85, r * 0.28, 0, 0, Math.PI * 2)
    ctx.fill()
    y += bob
  }
  const col = e.hitT > 0 ? '#ffffff' : ENEMY_COLORS[e.kind]
  ctx.fillStyle = col
  switch (e.kind) {
    case 'tank':
      roundRect(ctx, x - r, y - r * 0.85, r * 2, r * 1.7, r * 0.4)
      ctx.fill()
      ctx.strokeStyle = '#4d545e'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = '#b9c0c8'
      for (const dx of [-0.6, 0.6]) circle(ctx, x + dx * r, y - r * 0.5, r * 0.12)
      break
    case 'flying': {
      const flap = Math.sin(clock * 18 + e.id) * 0.6
      ctx.beginPath()
      ctx.moveTo(x - r * 0.3, y)
      ctx.quadraticCurveTo(x - r * 1.6, y - r * (0.9 + flap), x - r * 1.5, y + r * 0.4)
      ctx.lineTo(x - r * 0.3, y + r * 0.2)
      ctx.moveTo(x + r * 0.3, y)
      ctx.quadraticCurveTo(x + r * 1.6, y - r * (0.9 + flap), x + r * 1.5, y + r * 0.4)
      ctx.lineTo(x + r * 0.3, y + r * 0.2)
      ctx.fill()
      circle(ctx, x, y, r * 0.75)
      break
    }
    case 'fast':
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.lineWidth = 1.5
      for (const dy of [-0.4, 0, 0.4]) {
        ctx.beginPath()
        ctx.moveTo(x - r * 1.9, y + dy * r)
        ctx.lineTo(x - r * 1.2, y + dy * r)
        ctx.stroke()
      }
      circle(ctx, x, y, r)
      break
    case 'boss':
      ctx.fillStyle = '#5a1018'
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(x + s * r * 0.5, y - r * 0.6)
        ctx.lineTo(x + s * r * 0.95, y - r * 1.35)
        ctx.lineTo(x + s * r * 0.15, y - r * 0.85)
        ctx.fill()
      }
      ctx.fillStyle = col
      circle(ctx, x, y, r)
      ctx.fillStyle = '#ffd54a'
      ctx.beginPath()
      ctx.moveTo(x - r * 0.4, y - r * 0.75)
      ctx.lineTo(x - r * 0.4, y - r * 1.15)
      ctx.lineTo(x - r * 0.2, y - r * 0.95)
      ctx.lineTo(x, y - r * 1.25)
      ctx.lineTo(x + r * 0.2, y - r * 0.95)
      ctx.lineTo(x + r * 0.4, y - r * 1.15)
      ctx.lineTo(x + r * 0.4, y - r * 0.75)
      ctx.closePath()
      ctx.fill()
      break
    case 'healer':
      circle(ctx, x, y, r)
      ctx.fillStyle = '#3cb44b'
      ctx.fillRect(x - r * 0.15, y - r * 0.55, r * 0.3, r * 1.1)
      ctx.fillRect(x - r * 0.55, y - r * 0.15, r * 1.1, r * 0.3)
      break
    default:
      // slime body
      ctx.beginPath()
      ctx.moveTo(x - r, y + r * 0.6)
      ctx.quadraticCurveTo(x - r * 1.05, y - r * 1.1, x, y - r)
      ctx.quadraticCurveTo(x + r * 1.05, y - r * 1.1, x + r, y + r * 0.6)
      ctx.closePath()
      ctx.fill()
  }
  // eyes (not on healer cross)
  if (e.kind !== 'healer' && e.kind !== 'swarm') {
    const ey = e.kind === 'tank' ? y - r * 0.05 : y - r * 0.25
    ctx.fillStyle = '#fff'
    circle(ctx, x - r * 0.32, ey, r * 0.24)
    circle(ctx, x + r * 0.32, ey, r * 0.24)
    ctx.fillStyle = '#1b1b1b'
    circle(ctx, x - r * 0.28, ey + r * 0.04, r * 0.11)
    circle(ctx, x + r * 0.36, ey + r * 0.04, r * 0.11)
  }
  // status tint
  if (e.slowT > 0) {
    ctx.strokeStyle = 'rgba(150,220,255,0.95)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, r + 2, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (e.poisonT > 0) {
    ctx.fillStyle = 'rgba(100,220,80,0.9)'
    const ph = (clock * 2 + e.id * 0.3) % 1
    circle(ctx, x + r * 0.6, y - r - ph * r, Math.max(1.5, r * 0.18 * (1 - ph)))
  }
  // hp bar
  if (e.hp < e.maxHp || e.kind === 'boss') {
    const w = Math.max(T * 0.5, r * 2)
    const bx = x - w / 2
    const by = y - r - T * (e.kind === 'boss' ? 0.38 : 0.16)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(bx - 1, by - 1, w + 2, 5)
    const k = Math.max(0, e.hp / e.maxHp)
    ctx.fillStyle = k > 0.5 ? '#5ee05a' : k > 0.25 ? '#f2c230' : '#ff5a4a'
    ctx.fillRect(bx, by, w * k, 3)
    if (e.armor > 0) {
      ctx.fillStyle = '#cfd6de'
      ctx.fillRect(bx - 4, by - 1, 3, 5)
    }
  }
}
