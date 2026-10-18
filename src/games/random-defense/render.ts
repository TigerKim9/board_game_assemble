// Canvas renderer for one player's field. Everything is drawn in field units (FIELD_W × FIELD_H).
import {
  COOP_H,
  COOP_OFFSET,
  FIELD_H,
  FIELD_W,
  INFO,
  PATH_H,
  PATH_W,
  SHARED_LANE_Y,
  SLOTS,
  TIER_COLORS,
  auraInfo,
  canMerge,
  neighbors,
  unitRange,
  isStuck,
  pathPos,
  unlockCost,
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
  /** Unit id waiting for the second "sell" press (★3+), or 0. */
  confirm: number
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

/** Attack range circle (and, for wind spirits, the 8 boosted neighbour tiles). */
function drawRange(ctx: CanvasRenderingContext2D, u: Unit, x: number, y: number, slot: number, now: number) {
  const color = INFO[u.type].color
  if (u.type === 'wind' && slot >= 0) {
    ctx.save()
    ctx.fillStyle = 'rgba(201,184,255,0.22)'
    ctx.strokeStyle = 'rgba(201,184,255,0.75)'
    ctx.lineWidth = 0.035
    for (const n of neighbors(slot)) {
      const p = slotPos(n)
      roundRect(ctx, p.x - 0.45, p.y - 0.45, 0.9, 0.9, 0.14)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }
  const r = unitRange(u)
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = hexA(color, 0.12)
  ctx.fill()
  ctx.strokeStyle = hexA(color, 0.85)
  ctx.lineWidth = 0.04
  ctx.setLineDash([0.16, 0.1])
  ctx.lineDashOffset = -now * 0.4
  ctx.stroke()
  ctx.restore()
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** Swirling lavender ring behind a spirit sped up by wind; spins faster with more stacked winds. */
function drawHaste(ctx: CanvasRenderingContext2D, x: number, y: number, count: number, now: number) {
  const r = 0.43
  const spin = now * (1.5 + count * 1.2)
  ctx.save()
  ctx.strokeStyle = `rgba(201,184,255,${Math.min(0.85, 0.35 + 0.15 * count)})`
  ctx.lineWidth = 0.035
  ctx.lineCap = 'round'
  const arcs = Math.min(4, count + 1)
  for (let k = 0; k < arcs; k++) {
    const a = spin + (k * Math.PI * 2) / arcs
    ctx.beginPath()
    ctx.arc(x, y, r, a, a + 0.9)
    ctx.stroke()
  }
  ctx.restore()
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

/** Player colours of the co-op boards (top, bottom); monsters wear a thin ring in their owner's colour. */
export const COOP_COLORS = ['#ffa94d', '#4dabf7']

function drawMonster(ctx: CanvasRenderingContext2D, m: Monster, ring?: string) {
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
  if (ring) {
    ctx.strokeStyle = ring
    ctx.lineWidth = 0.05
    ctx.beginPath()
    ctx.arc(x, y, r + 0.03, 0, Math.PI * 2)
    ctx.stroke()
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

function drawBackground(ctx: CanvasRenderingContext2D, h: number) {
  const bg = ctx.createLinearGradient(0, 0, FIELD_W, h)
  bg.addColorStop(0, '#1d2747')
  bg.addColorStop(1, '#2d1f45')
  ctx.fillStyle = bg
  roundRect(ctx, 0, 0, FIELD_W, h, 0.3)
  ctx.fill()
}

/** One board's loop path, shifted down by `oy`. */
function drawPath(ctx: CanvasRenderingContext2D, oy: number, now: number) {
  ctx.strokeStyle = '#4a3b5e'
  ctx.lineWidth = 0.64
  ctx.lineJoin = 'round'
  roundRect(ctx, 0.5, 0.5 + oy, PATH_W, PATH_H, 0.12)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 0.03
  ctx.setLineDash([0.18, 0.18])
  ctx.lineDashOffset = -now * 0.6
  roundRect(ctx, 0.5, 0.5 + oy, PATH_W, PATH_H, 0.12)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, now: number) {
  ctx.fillStyle = 'rgba(190,120,255,0.35)'
  ctx.beginPath()
  ctx.arc(x, y, 0.3 + Math.sin(now * 4) * 0.04, 0, Math.PI * 2)
  ctx.fill()
}

/** Slot tiles, locks and merge / stuck highlights (board-local coordinates). */
function drawSlots(ctx: CanvasRenderingContext2D, side: Side, ui: UiState, now: number) {
  const from = ui.drag ? ui.drag.from : ui.sel
  const src = from >= 0 ? side.units[from] : null
  const pulse = 0.55 + 0.45 * Math.sin(now * 8)
  const stuck = from < 0 && isStuck(side)
  const price = unlockCost(side.unlocks)
  for (let i = 0; i < SLOTS; i++) {
    const { x, y } = slotPos(i)
    if (!side.open[i]) {
      // locked tile: dark, dashed, padlock and price
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      roundRect(ctx, x - 0.45, y - 0.45, 0.9, 0.9, 0.14)
      ctx.fill()
      ctx.strokeStyle = i === from ? '#ffffff' : 'rgba(255,255,255,0.22)'
      ctx.lineWidth = i === from ? 0.06 : 0.03
      if (i !== from) ctx.setLineDash([0.1, 0.08])
      ctx.stroke()
      ctx.setLineDash([])
      text(ctx, '🔒', x, y - 0.1, 0.3, '#fff', { emoji: true })
      const afford = side.coins >= price
      text(ctx, `🪙${price}`, x, y + 0.27, 0.17, afford ? '#ffe066' : 'rgba(255,255,255,0.45)', { bold: true, outline: true })
      continue
    }
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    roundRect(ctx, x - 0.45, y - 0.45, 0.9, 0.9, 0.14)
    ctx.fill()
    if (stuck && side.units[i]) {
      ctx.strokeStyle = `rgba(255,170,90,${0.25 + 0.35 * pulse})`
      ctx.lineWidth = 0.045
      ctx.setLineDash([0.12, 0.08])
      ctx.lineDashOffset = -now * 0.3
      ctx.stroke()
      ctx.setLineDash([])
    } else if (src && i !== from && canMerge(src, side.units[i])) {
      ctx.strokeStyle = `rgba(255,224,102,${pulse})`
      ctx.lineWidth = 0.07
      ctx.stroke()
    } else if (i === from) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.06
      ctx.stroke()
    }
  }
}

/** Range of the selected / dragged spirit. */
function drawSelRange(ctx: CanvasRenderingContext2D, side: Side, ui: UiState, now: number) {
  const from = ui.drag ? ui.drag.from : ui.sel
  const src = from >= 0 ? side.units[from] : null
  if (!src) return
  const dragging = ui.drag && ui.drag.moved
  const c = dragging ? { x: ui.drag!.x, y: ui.drag!.y } : slotPos(from)
  drawRange(ctx, src, c.x, c.y, dragging ? -1 : from, now)
}

/** Spirits with their wind halos. `flip` turns them upside down (co-op top player facing the other way). */
function drawUnits(ctx: CanvasRenderingContext2D, side: Side, ui: UiState, now: number, flip = false) {
  const aura = auraInfo(side)
  for (let i = 0; i < SLOTS; i++) {
    const u = side.units[i]
    if (!u) continue
    const p = slotPos(i)
    const dragging = ui.drag && ui.drag.moved && ui.drag.from === i
    if (aura[i].count > 0 && !dragging) drawHaste(ctx, p.x, p.y, aura[i].count, now)
    ctx.save()
    ctx.translate(p.x, p.y)
    if (flip) ctx.rotate(Math.PI)
    drawUnit(ctx, u, 0, 0, 1, dragging ? 0.3 : 1)
    if (aura[i].count > 1 && !dragging) {
      // stacked wind: small badge with the number of winds feeding this spirit
      ctx.fillStyle = 'rgba(40,24,80,0.9)'
      ctx.beginPath()
      ctx.arc(-0.29, -0.29, 0.13, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#c9b8ff'
      ctx.lineWidth = 0.025
      ctx.stroke()
      text(ctx, `${aura[i].count}`, -0.29, -0.285, 0.16, '#ffffff', { bold: true })
    }
    ctx.restore()
  }
}

function drawMonsters(ctx: CanvasRenderingContext2D, side: Side, ring?: string) {
  // bosses last so they sit on top
  for (const m of side.monsters) if (m.kind !== 'boss') drawMonster(ctx, m, ring)
  for (const m of side.monsters) if (m.kind === 'boss') drawMonster(ctx, m, ring)
}

function drawFx(ctx: CanvasRenderingContext2D, side: Side) {
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
    } else if (f.k === 'swap') {
      // old spirit puffs away while a ring of sparkles spins outward
      ctx.globalAlpha = Math.max(0, 1 - p * 1.4)
      text(ctx, f.text!, f.x, f.y - 0.03, 0.36 * (1 + p * 0.9), '#fff', { emoji: true })
      ctx.globalAlpha = Math.max(0, 1 - p)
      ctx.fillStyle = f.color
      const R = f.r! * (0.4 + 0.9 * p)
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + p * 4
        ctx.beginPath()
        ctx.arc(f.x + Math.cos(a) * R, f.y + Math.sin(a) * R, 0.06 * (1 - p * 0.5), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.05
      ctx.beginPath()
      ctx.arc(f.x, f.y, R * 0.8, p * 6, p * 6 + Math.PI * 1.2)
      ctx.stroke()
    } else if (f.k === 'txt') {
      text(ctx, f.text!, f.x, Math.max(0.22, f.y - p * 0.45), f.size ?? 0.26, f.color, { bold: true, outline: true })
    }
  }
  ctx.globalAlpha = 1
}

/** Boss / elite warning and the versus "monsters sent" notice (board-local, optionally upside down). */
function drawBanners(ctx: CanvasRenderingContext2D, side: Side, now: number, flip = false) {
  ctx.save()
  if (flip) {
    ctx.translate(FIELD_W / 2, FIELD_H / 2)
    ctx.rotate(Math.PI)
    ctx.translate(-FIELD_W / 2, -FIELD_H / 2)
  }
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
  ctx.restore()
}

function drawGhost(ctx: CanvasRenderingContext2D, side: Side, ui: UiState) {
  const src = ui.drag ? side.units[ui.drag.from] : null
  if (ui.drag && ui.drag.moved && src) drawUnit(ctx, src, ui.drag.x, ui.drag.y, 1.15, 0.9)
}

function shake(ctx: CanvasRenderingContext2D, t: number) {
  if (t <= 0) return
  const a = t * 0.12
  ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a)
}

/** Draws the whole field. `w` is the canvas CSS width in px. */
export function drawSide(ctx: CanvasRenderingContext2D, w: number, dpr: number, side: Side, ui: UiState, now: number) {
  const k = (w / FIELD_W) * dpr
  ctx.setTransform(k, 0, 0, k, 0, 0)
  ctx.clearRect(0, 0, FIELD_W, FIELD_H)
  shake(ctx, side.shake)
  drawBackground(ctx, FIELD_H)
  drawPath(ctx, 0, now)
  drawPortal(ctx, 0.5, 0.5, now)
  drawSlots(ctx, side, ui, now)
  drawSelRange(ctx, side, ui, now)
  drawUnits(ctx, side, ui, now)
  drawMonsters(ctx, side)
  drawFx(ctx, side)
  drawBanners(ctx, side, now)
  drawGhost(ctx, side, ui)
}

/** The golden shared lane between the two co-op boards. */
function drawSharedLane(ctx: CanvasRenderingContext2D, now: number) {
  const y = SHARED_LANE_Y
  const x0 = 0.5
  const x1 = 0.5 + PATH_W
  ctx.save()
  ctx.lineCap = 'round'
  const glow = 0.3 + 0.08 * Math.sin(now * 2.5)
  ctx.strokeStyle = `rgba(255,190,60,${glow})`
  ctx.lineWidth = 0.64
  ctx.beginPath()
  ctx.moveTo(x0, y)
  ctx.lineTo(x1, y)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,214,102,0.85)'
  ctx.lineWidth = 0.03
  ctx.lineCap = 'butt'
  for (const dy of [-0.32, 0.32]) {
    ctx.beginPath()
    ctx.moveTo(x0, y + dy)
    ctx.lineTo(x1, y + dy)
    ctx.stroke()
  }
  // the two loops run through it in opposite directions
  ctx.strokeStyle = 'rgba(255,240,200,0.35)'
  ctx.lineWidth = 0.03
  ctx.setLineDash([0.18, 0.18])
  for (const [dy, dir] of [
    [-0.12, -1],
    [0.12, 1],
  ]) {
    ctx.lineDashOffset = dir * now * 0.6
    ctx.beginPath()
    ctx.moveTo(x0, y + dy)
    ctx.lineTo(x1, y + dy)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.globalAlpha = 0.6
  text(ctx, '🤝 공동 전선', FIELD_W / 2, y + 0.01, 0.22, '#ffe9a8', { bold: true, outline: true })
  ctx.restore()
}

/**
 * Co-op field: two boards in one coordinate system (FIELD_W × COOP_H), the bottom one shifted by
 * COOP_OFFSET so both loops share the middle lane. `flipTop` draws the top board's spirits and
 * banners upside down for a player sitting across the table.
 */
export function drawCoop(
  ctx: CanvasRenderingContext2D,
  w: number,
  dpr: number,
  sides: Side[],
  uis: UiState[],
  now: number,
  flipTop: boolean,
) {
  const k = (w / FIELD_W) * dpr
  ctx.setTransform(k, 0, 0, k, 0, 0)
  ctx.clearRect(0, 0, FIELD_W, COOP_H)
  shake(ctx, Math.max(...sides.map((s) => s.shake)))
  drawBackground(ctx, COOP_H)
  // faint owner tint behind each grid
  sides.forEach((_, i) => {
    ctx.fillStyle = hexA(COOP_COLORS[i], 0.07)
    roundRect(ctx, 0.92, 0.92 + i * COOP_OFFSET, FIELD_W - 1.84, FIELD_H - 1.84, 0.2)
    ctx.fill()
  })
  drawPath(ctx, 0, now)
  drawPath(ctx, COOP_OFFSET, now)
  drawSharedLane(ctx, now)
  drawPortal(ctx, 0.5, 0.5, now)
  drawPortal(ctx, 0.5, COOP_H - 0.5, now)
  const each = (fn: (s: Side, i: number) => void) =>
    sides.forEach((s, i) => {
      ctx.save()
      ctx.translate(0, i * COOP_OFFSET)
      fn(s, i)
      ctx.restore()
    })
  each((s, i) => drawSlots(ctx, s, uis[i], now))
  each((s, i) => drawUnits(ctx, s, uis[i], now, flipTop && i === 0))
  each((s, i) => drawSelRange(ctx, s, uis[i], now))
  each((s, i) => drawMonsters(ctx, s, COOP_COLORS[i]))
  each((s) => drawFx(ctx, s))
  each((s, i) => drawBanners(ctx, s, now, flipTop && i === 0))
  each((s, i) => drawGhost(ctx, s, uis[i]))
}
