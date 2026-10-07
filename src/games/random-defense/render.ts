// Canvas renderer for one player's field. Everything is drawn in field units (FIELD_W × FIELD_H).
import {
  FIELD_H,
  FIELD_W,
  INFO,
  PATH_H,
  PATH_W,
  SLOTS,
  TIER_COLORS,
  canMerge,
  pathPos,
  slotPos,
  type Monster,
  type Side,
  type Unit,
} from './logic'

export interface Drag {
  id: number
  from: number
  x: number
  y: number
  sx: number
  sy: number
  moved: boolean
}

export interface UiState {
  sel: number
  drag: Drag | null
}

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
const TEXT_FONT = 'system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif'
const TS = 40 // text is drawn at 1/TS scale so tiny font sizes are not clamped

function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  opts: { emoji?: boolean; bold?: boolean; outline?: boolean } = {},
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1 / TS, 1 / TS)
  ctx.font = `${opts.bold ? '800 ' : ''}${size * TS}px ${opts.emoji ? EMOJI_FONT : TEXT_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (opts.outline) {
    ctx.lineWidth = size * TS * 0.18
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'
    ctx.lineJoin = 'round'
    ctx.strokeText(s, 0, 0)
  }
  ctx.fillStyle = color
  ctx.fillText(s, 0, 0)
  ctx.restore()
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

export function drawUnit(ctx: CanvasRenderingContext2D, u: Unit, x: number, y: number, scale = 1, alpha = 1) {
  const info = INFO[u.type]
  const r = 0.36 * scale
  ctx.save()
  ctx.globalAlpha = alpha
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.25, info.color)
  grad.addColorStop(1, '#1d1530')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 0.035 + 0.012 * u.tier
  ctx.strokeStyle = TIER_COLORS[u.tier]
  ctx.stroke()
  if (u.tier >= 5) {
    ctx.lineWidth = 0.025
    ctx.strokeStyle = 'rgba(255,240,180,0.8)'
    ctx.beginPath()
    ctx.arc(x, y, r + 0.06, 0, Math.PI * 2)
    ctx.stroke()
  }
  text(ctx, info.emoji, x, y - 0.03 * scale, 0.36 * scale, '#fff', { emoji: true })
  // stars
  const n = u.tier
  const sw = 0.12 * scale
  const sx = x - ((n - 1) * sw) / 2
  for (let i = 0; i < n; i++) text(ctx, '★', sx + i * sw, y + r * 0.82, 0.16 * scale, TIER_COLORS[u.tier], { outline: true })
  if (u.flash > 0) {
    const p = u.flash
    ctx.globalAlpha = alpha * Math.min(1, p * 1.6)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = TIER_COLORS[u.tier]
    ctx.lineWidth = 0.06
    ctx.beginPath()
    ctx.arc(x, y, r + (0.7 - Math.min(0.7, p)) * 0.6, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawMonster(ctx: CanvasRenderingContext2D, m: Monster) {
  const { x, y } = pathPos(m.s)
  const r = m.kind === 'boss' ? 0.42 : m.kind === 'elite' ? 0.29 : 0.19
  ctx.fillStyle = m.hitT > 0 ? '#ffffff' : m.kind === 'boss' ? '#c0392b' : `hsl(${m.hue} 65% 52%)`
  ctx.beginPath()
  if (m.kind === 'sent') {
    // spiky invader
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      const rr = i % 2 ? r * 0.75 : r * 1.15
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
    }
    ctx.closePath()
  } else ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  if (m.kind === 'boss' || m.kind === 'elite') {
    text(ctx, m.kind === 'boss' ? '👹' : '👺', x, y, r * 1.5, '#fff', { emoji: true })
  } else {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(x - r * 0.35, y - r * 0.15, r * 0.28, 0, Math.PI * 2)
    ctx.arc(x + r * 0.35, y - r * 0.15, r * 0.28, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#111'
    ctx.beginPath()
    ctx.arc(x - r * 0.3, y - r * 0.1, r * 0.13, 0, Math.PI * 2)
    ctx.arc(x + r * 0.4, y - r * 0.1, r * 0.13, 0, Math.PI * 2)
    ctx.fill()
  }
  if (m.slowT > 0) {
    ctx.strokeStyle = 'rgba(127,214,255,0.9)'
    ctx.lineWidth = 0.04
    ctx.beginPath()
    ctx.arc(x, y, r + 0.05, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (m.poisonT > 0) {
    ctx.fillStyle = 'rgba(125,220,90,0.9)'
    ctx.beginPath()
    ctx.arc(x + r * 0.8, y + r * 0.6, 0.05, 0, Math.PI * 2)
    ctx.fill()
  }
  if (m.stunT > 0) text(ctx, '💫', x, y - r - 0.1, 0.2, '#fff', { emoji: true })
  if (m.hp < m.maxHp) {
    const w = m.kind === 'boss' ? 0.9 : 0.4
    const by = y - r - (m.kind === 'boss' ? 0.14 : 0.08)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(x - w / 2, by, w, 0.06)
    ctx.fillStyle = m.kind === 'boss' ? '#ff4d4d' : '#6ee36e'
    ctx.fillRect(x - w / 2, by, (w * Math.max(0, m.hp)) / m.maxHp, 0.06)
  }
}

/** Draws the whole field. `w` is the canvas CSS width in px. */
export function drawSide(ctx: CanvasRenderingContext2D, w: number, dpr: number, side: Side, ui: UiState, now: number) {
  const k = (w / FIELD_W) * dpr
  ctx.setTransform(k, 0, 0, k, 0, 0)
  ctx.clearRect(0, 0, FIELD_W, FIELD_H)
  if (side.shake > 0) {
    const a = side.shake * 0.12
    ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a)
  }
  // background
  const bg = ctx.createLinearGradient(0, 0, FIELD_W, FIELD_H)
  bg.addColorStop(0, '#1d2747')
  bg.addColorStop(1, '#2d1f45')
  ctx.fillStyle = bg
  roundRect(ctx, 0, 0, FIELD_W, FIELD_H, 0.3)
  ctx.fill()

  // path
  ctx.strokeStyle = '#4a3b5e'
  ctx.lineWidth = 0.64
  ctx.lineJoin = 'round'
  roundRect(ctx, 0.5, 0.5, PATH_W, PATH_H, 0.12)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 0.03
  ctx.setLineDash([0.18, 0.18])
  ctx.lineDashOffset = -now * 0.6
  roundRect(ctx, 0.5, 0.5, PATH_W, PATH_H, 0.12)
  ctx.stroke()
  ctx.setLineDash([])
  // portal at the spawn corner
  ctx.fillStyle = 'rgba(190,120,255,0.35)'
  ctx.beginPath()
  ctx.arc(0.5, 0.5, 0.3 + Math.sin(now * 4) * 0.04, 0, Math.PI * 2)
  ctx.fill()

  // slots
  const from = ui.drag ? ui.drag.from : ui.sel
  const src = from >= 0 ? side.units[from] : null
  const pulse = 0.55 + 0.45 * Math.sin(now * 8)
  for (let i = 0; i < SLOTS; i++) {
    const { x, y } = slotPos(i)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    roundRect(ctx, x - 0.45, y - 0.45, 0.9, 0.9, 0.14)
    ctx.fill()
    if (src && i !== from && canMerge(src, side.units[i])) {
      ctx.strokeStyle = `rgba(255,224,102,${pulse})`
      ctx.lineWidth = 0.07
      ctx.stroke()
    } else if (i === from) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.06
      ctx.stroke()
    }
  }

  // units
  for (let i = 0; i < SLOTS; i++) {
    const u = side.units[i]
    if (!u) continue
    const { x, y } = slotPos(i)
    const dragging = ui.drag && ui.drag.moved && ui.drag.from === i
    drawUnit(ctx, u, x, y, 1, dragging ? 0.3 : 1)
  }

  // monsters (bosses last so they sit on top)
  for (const m of side.monsters) if (m.kind !== 'boss') drawMonster(ctx, m)
  for (const m of side.monsters) if (m.kind === 'boss') drawMonster(ctx, m)

  // effects
  for (const f of side.fx) {
    const p = f.t / f.life
    ctx.globalAlpha = Math.max(0, 1 - p)
    if (f.k === 'shot') {
      ctx.strokeStyle = f.color
      ctx.lineWidth = 0.05
      ctx.beginPath()
      ctx.moveTo(f.x, f.y)
      ctx.lineTo(f.x2!, f.y2!)
      ctx.stroke()
    } else if (f.k === 'boom') {
      ctx.strokeStyle = f.color
      ctx.lineWidth = 0.07
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.r! * (0.3 + 0.7 * p), 0, Math.PI * 2)
      ctx.stroke()
    } else if (f.k === 'txt') {
      text(ctx, f.text!, f.x, Math.max(0.22, f.y - p * 0.45), f.size ?? 0.26, f.color, { bold: true, outline: true })
    }
  }
  ctx.globalAlpha = 1

  // banners
  if (side.warn > 0) {
    const a = Math.min(1, side.warn * 2) * (0.75 + 0.25 * Math.sin(now * 14))
    ctx.globalAlpha = a
    ctx.fillStyle = 'rgba(120,0,0,0.75)'
    ctx.fillRect(0, FIELD_H / 2 - 0.42, FIELD_W, 0.84)
    const boss = side.bossT != null
    text(ctx, boss ? '⚠️ 보스 등장! ⚠️' : '⚠️ 정예 몬스터!', FIELD_W / 2, FIELD_H / 2, 0.46, '#ffe066', {
      bold: true,
      outline: true,
    })
    ctx.globalAlpha = 1
  }
  if (side.incoming > 0) {
    ctx.globalAlpha = Math.min(1, side.incoming)
    text(ctx, '😈 상대가 몬스터를 보냈어요!', FIELD_W / 2, 1.02, 0.28, '#ff9ad5', { bold: true, outline: true })
    ctx.globalAlpha = 1
  }

  // drag ghost
  if (ui.drag && ui.drag.moved && src) drawUnit(ctx, src, ui.drag.x, ui.drag.y, 1.15, 0.9)
}
