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
  AWAKEN_TIER,
  auraInfo,
  isAuraSource,
  canMerge,
  canMergeRecipe,
  isHidden,
  neighbors,
  unitRange,
  isStuck,
  monsterLocal,
  unlockCost,
  slotPos,
  type Fx,
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

/** ctx.arc that never throws: a negative radius (an effect past its lifetime) draws nothing instead. */
function arc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a0: number, a1: number) {
  ctx.arc(x, y, r > 0 ? r : 0, a0, a1)
}

/**
 * Starts a frame from a clean context. A throw mid-frame (or a forgotten restore) would otherwise
 * leak alpha / transforms into the next frame and draw the board background invisible.
 */
function freshFrame(ctx: CanvasRenderingContext2D, k: number) {
  const c = ctx as CanvasRenderingContext2D & { reset?: () => void }
  if (typeof c.reset === 'function') c.reset()
  else {
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.setLineDash([])
    ctx.shadowBlur = 0
    ctx.filter = 'none'
  }
  ctx.setTransform(k, 0, 0, k, 0, 0)
}

/** Attack range circle (and, for wind spirits, the 8 boosted neighbour tiles). */
function drawRange(ctx: CanvasRenderingContext2D, side: Side, u: Unit, x: number, y: number, slot: number, now: number) {
  const color = INFO[u.type].color
  if (isAuraSource(u.type) && slot >= 0) {
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
  const r = unitRange(u, side)
  ctx.save()
  ctx.beginPath()
  arc(ctx, x, y, r, 0, Math.PI * 2)
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
    arc(ctx, x, y, r, a, a + 0.9)
    ctx.stroke()
  }
  ctx.restore()
}

/** Soft pulsing glow and orbiting sparkles behind a hidden spirit. */
function drawHiddenGlow(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, r: number, now: number) {
  const pulse = 0.5 + 0.5 * Math.sin(now * 3)
  const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 1.55)
  g.addColorStop(0, hexA(color, 0.55 + 0.25 * pulse))
  g.addColorStop(1, hexA(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  arc(ctx, x, y, r * 1.55, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  for (let k = 0; k < 3; k++) {
    const a = now * 1.8 + (k * Math.PI * 2) / 3
    ctx.beginPath()
    arc(ctx, x + Math.cos(a) * r * 1.22, y + Math.sin(a) * r * 1.22, 0.035, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Spinning rainbow ring of an awakened (★7) spirit. */
function drawAwakenRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number) {
  const n = 18
  ctx.lineWidth = 0.075
  ctx.lineCap = 'butt'
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2 + now * 1.6
    ctx.strokeStyle = `hsl(${(k / n) * 360 + now * 120} 95% 62%)`
    ctx.beginPath()
    arc(ctx, x, y, r + 0.07, a0, a0 + (Math.PI * 2) / n + 0.02)
    ctx.stroke()
  }
}

export function drawUnit(ctx: CanvasRenderingContext2D, u: Unit, x: number, y: number, scale = 1, alpha = 1, now = 0) {
  const info = INFO[u.type]
  const r = 0.36 * scale
  ctx.save()
  ctx.globalAlpha = alpha
  if (isHidden(u.type)) drawHiddenGlow(ctx, info.color, x, y, r, now)
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.25, info.color)
  grad.addColorStop(1, '#1d1530')
  ctx.fillStyle = grad
  ctx.beginPath()
  arc(ctx, x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 0.035 + 0.012 * u.tier
  ctx.strokeStyle = TIER_COLORS[u.tier]
  ctx.stroke()
  if (u.tier >= AWAKEN_TIER) drawAwakenRing(ctx, x, y, r, now)
  else if (u.tier >= 5) {
    ctx.lineWidth = 0.025
    ctx.strokeStyle = 'rgba(255,240,180,0.8)'
    ctx.beginPath()
    arc(ctx, x, y, r + 0.06, 0, Math.PI * 2)
    ctx.stroke()
  }
  text(ctx, info.emoji, x, y - 0.03 * scale, 0.36 * scale, '#fff', { emoji: true })
  // stars
  const n = u.tier
  const sw = (n >= AWAKEN_TIER ? 0.1 : 0.12) * scale
  const sx = x - ((n - 1) * sw) / 2
  for (let i = 0; i < n; i++) {
    const c = n >= AWAKEN_TIER ? `hsl(${(i / n) * 360 + now * 120} 95% 68%)` : TIER_COLORS[u.tier]
    text(ctx, '★', sx + i * sw, y + r * 0.82, (n >= AWAKEN_TIER ? 0.14 : 0.16) * scale, c, { outline: true })
  }
  if (u.flash > 0) {
    const p = u.flash
    ctx.globalAlpha = alpha * Math.min(1, p * 1.6)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    arc(ctx, x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = TIER_COLORS[u.tier]
    ctx.lineWidth = 0.06
    ctx.beginPath()
    arc(ctx, x, y, r + (0.7 - Math.min(0.7, p)) * 0.6, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

/** Player colours of the co-op boards (top, bottom); monsters wear a thin ring in their owner's colour. */
export const COOP_COLORS = ['#ffa94d', '#4dabf7']

function drawMonster(ctx: CanvasRenderingContext2D, m: Monster, ring: string | undefined, fancy: boolean) {
  const { x, y } = monsterLocal(m)
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
  } else arc(ctx, x, y, r, 0, Math.PI * 2)
  ctx.fill()
  if (m.kind === 'boss' || m.kind === 'elite') {
    text(ctx, m.kind === 'boss' ? '👹' : '👺', x, y, r * 1.5, '#fff', { emoji: true })
  } else {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    arc(ctx, x - r * 0.35, y - r * 0.15, r * 0.28, 0, Math.PI * 2)
    arc(ctx, x + r * 0.35, y - r * 0.15, r * 0.28, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#111'
    ctx.beginPath()
    arc(ctx, x - r * 0.3, y - r * 0.1, r * 0.13, 0, Math.PI * 2)
    arc(ctx, x + r * 0.4, y - r * 0.1, r * 0.13, 0, Math.PI * 2)
    ctx.fill()
  }
  if (ring) {
    ctx.strokeStyle = ring
    ctx.lineWidth = 0.05
    ctx.beginPath()
    arc(ctx, x, y, r + 0.03, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (m.slowT > 0) {
    ctx.strokeStyle = 'rgba(127,214,255,0.9)'
    ctx.lineWidth = 0.04
    ctx.beginPath()
    arc(ctx, x, y, r + 0.05, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (m.poisonT > 0 && !fancy) {
    ctx.fillStyle = 'rgba(125,220,90,0.9)'
    ctx.beginPath()
    arc(ctx, x + r * 0.8, y + r * 0.6, 0.05, 0, Math.PI * 2)
    ctx.fill()
  }
  if (m.curseT && m.curseT > 0) {
    ctx.strokeStyle = 'rgba(199,125,255,0.95)'
    ctx.lineWidth = 0.045
    ctx.setLineDash([0.06, 0.05])
    ctx.beginPath()
    arc(ctx, x, y, r + 0.09, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    text(ctx, '💀', x - r * 0.9, y - r * 0.8, 0.15, '#fff', { emoji: true })
  }
  if (m.stunT > 0 && !fancy) text(ctx, '💫', x, y - r - 0.1, 0.2, '#fff', { emoji: true })
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
function drawPath(ctx: CanvasRenderingContext2D, oy: number, now: number, rev = false) {
  ctx.strokeStyle = '#4a3b5e'
  ctx.lineWidth = 0.64
  ctx.lineJoin = 'round'
  roundRect(ctx, 0.5, 0.5 + oy, PATH_W, PATH_H, 0.12)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 0.03
  ctx.setLineDash([0.18, 0.18])
  ctx.lineDashOffset = (rev ? 1 : -1) * now * 0.6
  roundRect(ctx, 0.5, 0.5 + oy, PATH_W, PATH_H, 0.12)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, now: number) {
  ctx.fillStyle = 'rgba(190,120,255,0.35)'
  ctx.beginPath()
  arc(ctx, x, y, 0.3 + Math.sin(now * 4) * 0.04, 0, Math.PI * 2)
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
      // recipe partners glow pink (a hidden spirit), normal partners gold
      ctx.strokeStyle = canMergeRecipe(src, side.units[i]) ? `rgba(255,120,220,${pulse})` : `rgba(255,224,102,${pulse})`
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
  drawRange(ctx, side, src, c.x, c.y, dragging ? -1 : from, now)
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
    drawUnit(ctx, u, 0, 0, 1, dragging ? 0.3 : 1, now)
    if (aura[i].count > 1 && !dragging) {
      // stacked wind: small badge with the number of winds feeding this spirit
      ctx.fillStyle = 'rgba(40,24,80,0.9)'
      ctx.beginPath()
      arc(ctx, -0.29, -0.29, 0.13, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#c9b8ff'
      ctx.lineWidth = 0.025
      ctx.stroke()
      text(ctx, `${aura[i].count}`, -0.29, -0.285, 0.16, '#ffffff', { bold: true })
    }
    ctx.restore()
  }
}

function drawMonsters(ctx: CanvasRenderingContext2D, side: Side, now: number, fancy: boolean, ring?: string) {
  // bosses last so they sit on top
  for (const m of side.monsters) if (m.kind !== 'boss') drawMonster(ctx, m, ring, fancy)
  for (const m of side.monsters) if (m.kind === 'boss') drawMonster(ctx, m, ring, fancy)
  if (fancy) drawStatuses(ctx, side.monsters, now)
  if (side.freezeT > 0) {
    // ⏸️ time freeze: icy film over every frozen monster
    ctx.save()
    ctx.globalAlpha = Math.min(1, side.freezeT * 2) * 0.75
    ctx.strokeStyle = '#d6f3ff'
    ctx.fillStyle = 'rgba(160,220,255,0.35)'
    ctx.lineWidth = 0.035
    for (const m of side.monsters) {
      const { x, y } = monsterLocal(m)
      const r = m.kind === 'boss' ? 0.5 : m.kind === 'elite' ? 0.36 : 0.25
      ctx.beginPath()
      ctx.rect(x - r, y - r, 2 * r, 2 * r)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }
}

/** ⏸️ frozen loop: a pale blue wash over this board's path (board-local). */
function drawFreeze(ctx: CanvasRenderingContext2D, side: Side, now: number) {
  if (side.freezeT <= 0) return
  ctx.save()
  ctx.globalAlpha = Math.min(1, side.freezeT * 2) * (0.35 + 0.08 * Math.sin(now * 6))
  ctx.strokeStyle = '#9fdcff'
  ctx.lineWidth = 0.66
  roundRect(ctx, 0.5, 0.5, PATH_W, PATH_H, 0.12)
  ctx.stroke()
  ctx.restore()
}

function drawFx(ctx: CanvasRenderingContext2D, side: Side, now: number, fancy: boolean) {
  for (const f of side.fx) {
    if (f.t < 0) continue // queued, not shown yet
    const p = f.t / f.life
    if (p >= 1) continue // finished; removed on the next step
    ctx.globalAlpha = Math.max(0, 1 - p)
    if (f.k === 'shot' && fancy && f.src) {
      drawAttack(ctx, side, f, p, now)
    } else if (f.k === 'shot') {
      // simple: the classic short line, flashing for SIMPLE_SHOT seconds
      if (f.t > SIMPLE_SHOT) continue
      ctx.globalAlpha = Math.max(0, 1 - f.t / SIMPLE_SHOT)
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
      arc(ctx, f.x, f.y, f.r! * (0.3 + 0.7 * p), 0, Math.PI * 2)
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
        arc(ctx, f.x + Math.cos(a) * R, f.y + Math.sin(a) * R, 0.06 * (1 - p * 0.5), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.05
      ctx.beginPath()
      arc(ctx, f.x, f.y, R * 0.8, p * 6, p * 6 + Math.PI * 1.2)
      ctx.stroke()
    } else if (f.k === 'meteor') {
      // a fireball drops in, then a big filled blast
      if (p < 0.35) {
        const q = p / 0.35
        const fx = f.x + 0.9 * (1 - q)
        const fy = f.y - 1.4 * (1 - q)
        ctx.globalAlpha = 1
        ctx.strokeStyle = 'rgba(255,200,120,0.7)'
        ctx.lineWidth = 0.08
        ctx.beginPath()
        ctx.moveTo(fx + 0.35, fy - 0.5)
        ctx.lineTo(fx, fy)
        ctx.stroke()
        ctx.fillStyle = '#ffd27a'
        ctx.beginPath()
        arc(ctx, fx, fy, 0.12, 0, Math.PI * 2)
        ctx.fill()
      } else {
        const q = (p - 0.35) / 0.65
        ctx.globalAlpha = Math.max(0, 0.7 * (1 - q))
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r!)
        g.addColorStop(0, '#fff3c4')
        g.addColorStop(0.45, f.color)
        g.addColorStop(1, 'rgba(255,80,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        arc(ctx, f.x, f.y, f.r! * (0.4 + 0.6 * q), 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (f.k === 'chain') {
      // jagged rainbow bolt (a soft glow underneath when effects are fancy)
      if (fancy) {
        ctx.save()
        ctx.globalAlpha *= 0.35
        ctx.strokeStyle = f.color
        ctx.lineWidth = 0.14
        ctx.beginPath()
        ctx.moveTo(f.x, f.y)
        ctx.lineTo(f.x2!, f.y2!)
        ctx.stroke()
        ctx.restore()
      }
      const segs = 5
      ctx.lineWidth = 0.05
      ctx.strokeStyle = `hsl(${(f.x * 97 + f.t * 900) % 360} 95% 70%)`
      ctx.beginPath()
      ctx.moveTo(f.x, f.y)
      for (let k = 1; k < segs; k++) {
        const t = k / segs
        const j = (k % 2 ? 1 : -1) * 0.12
        ctx.lineTo(f.x + (f.x2! - f.x) * t - (f.y2! - f.y) * j * 0.6, f.y + (f.y2! - f.y) * t + (f.x2! - f.x) * j * 0.6)
      }
      ctx.lineTo(f.x2!, f.y2!)
      ctx.stroke()
    } else if (f.k === 'nova') {
      // icy / magic shockwave filling the spirit's range
      ctx.globalAlpha = Math.max(0, 0.45 * (1 - p))
      ctx.fillStyle = f.color
      ctx.beginPath()
      arc(ctx, f.x, f.y, f.r! * (0.25 + 0.75 * p), 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = Math.max(0, 1 - p)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.04
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

function drawGhost(ctx: CanvasRenderingContext2D, side: Side, ui: UiState, now: number) {
  const src = ui.drag ? side.units[ui.drag.from] : null
  if (ui.drag && ui.drag.moved && src) drawUnit(ctx, src, ui.drag.x, ui.drag.y, 1.15, 0.9, now)
}

function shake(ctx: CanvasRenderingContext2D, t: number) {
  if (t <= 0) return
  const a = t * 0.12
  ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a)
}

/** Draws the whole field. `w` is the canvas CSS width in px. `fancy` = type-specific attack effects. */
export function drawSide(
  ctx: CanvasRenderingContext2D,
  w: number,
  dpr: number,
  side: Side,
  ui: UiState,
  now: number,
  fancy = true,
) {
  const k = (w / FIELD_W) * dpr
  freshFrame(ctx, k)
  ctx.clearRect(0, 0, FIELD_W, FIELD_H)
  shake(ctx, side.shake)
  drawBackground(ctx, FIELD_H)
  drawPath(ctx, 0, now)
  drawPortal(ctx, 0.5, 0.5, now)
  drawFreeze(ctx, side, now)
  drawSlots(ctx, side, ui, now)
  drawSelRange(ctx, side, ui, now)
  drawUnits(ctx, side, ui, now)
  drawMonsters(ctx, side, now, fancy)
  drawFx(ctx, side, now, fancy)
  if (fancy) drawParticles(ctx, side, now)
  drawBanners(ctx, side, now)
  drawGhost(ctx, side, ui, now)
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
  // both loops run through it left to right, side by side
  ctx.strokeStyle = 'rgba(255,240,200,0.35)'
  ctx.lineWidth = 0.03
  ctx.setLineDash([0.18, 0.18])
  for (const dy of [-0.12, 0.12]) {
    ctx.lineDashOffset = -now * 0.6
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
  fancy = true,
) {
  const k = (w / FIELD_W) * dpr
  freshFrame(ctx, k)
  ctx.clearRect(0, 0, FIELD_W, COOP_H)
  shake(ctx, Math.max(...sides.map((s) => s.shake)))
  drawBackground(ctx, COOP_H)
  // faint owner tint behind each grid
  sides.forEach((_, i) => {
    ctx.fillStyle = hexA(COOP_COLORS[i], 0.07)
    roundRect(ctx, 0.92, 0.92 + i * COOP_OFFSET, FIELD_W - 1.84, FIELD_H - 1.84, 0.2)
    ctx.fill()
  })
  drawPath(ctx, 0, now, sides[0].rev)
  drawPath(ctx, COOP_OFFSET, now, sides[1].rev)
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
  each((s) => drawFreeze(ctx, s, now))
  each((s, i) => drawSlots(ctx, s, uis[i], now))
  each((s, i) => drawUnits(ctx, s, uis[i], now, flipTop && i === 0))
  each((s, i) => drawSelRange(ctx, s, uis[i], now))
  each((s, i) => drawMonsters(ctx, s, now, fancy, COOP_COLORS[i]))
  each((s) => drawFx(ctx, s, now, fancy))
  if (fancy) each((s) => drawParticles(ctx, s, now))
  each((s, i) => drawBanners(ctx, s, now, flipTop && i === 0))
  each((s, i) => drawGhost(ctx, s, uis[i], now))
}

// ---------------------------------------------------------------------------
// Fancy attack effects: one look per spirit type, plus a small particle pool.
// Pure visuals — they read the logic's 'shot' fx (with src / tier) and never touch the game.
// ---------------------------------------------------------------------------

/** How long the simple line of an attack shows (the classic look). */
const SIMPLE_SHOT = 0.14
/** Live particles per board (two boards in versus / co-op stay around 250 in total). */
export const PARTICLE_CAP = 125

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  t: number
  life: number
  r: number
  color: string
  kind: 'dot' | 'puff' | 'spark' | 'crystal' | 'star'
  /** Upward pull (embers / bubbles rise, dust settles). */
  g: number
}

const pools = new WeakMap<Side, { list: Particle[]; last: number }>()
/** Bit 1: start burst done, bit 2: impact burst done. */
const burst = new WeakMap<Fx, number>()

function pool(side: Side) {
  let p = pools.get(side)
  if (!p) pools.set(side, (p = { list: [], last: 0 }))
  return p
}

/** Live particle count of a board (tests / perf checks). */
export const particleCount = (side: Side) => pools.get(side)?.list.length ?? 0

function emit(side: Side, n: number, make: (k: number) => Particle) {
  const list = pool(side).list
  for (let k = 0; k < n && list.length < PARTICLE_CAP; k++) list.push(make(k))
}

/** Runs the burst `bit` of an attack fx once. */
function once(f: Fx, bit: number): boolean {
  const done = burst.get(f) ?? 0
  if (done & bit) return false
  burst.set(f, done | bit)
  return true
}

function drawParticles(ctx: CanvasRenderingContext2D, side: Side, now: number) {
  const p = pool(side)
  const dt = p.last ? Math.min(0.05, Math.max(0, now - p.last)) : 0
  p.last = now
  if (!p.list.length) return
  let w = 0
  ctx.save()
  for (const q of p.list) {
    q.t += dt
    if (q.t >= q.life) continue
    q.vy += q.g * dt
    q.x += q.vx * dt
    q.y += q.vy * dt
    p.list[w++] = q
    const a = 1 - q.t / q.life
    ctx.globalAlpha = a
    ctx.fillStyle = q.color
    if (q.kind === 'puff') {
      ctx.globalAlpha = a * 0.45
      ctx.beginPath()
      arc(ctx, q.x, q.y, q.r * (1 + 1.5 * (q.t / q.life)), 0, Math.PI * 2)
      ctx.fill()
    } else if (q.kind === 'crystal') diamond(ctx, q.x, q.y, q.r, q.r * 0.5, Math.atan2(q.vy, q.vx))
    else if (q.kind === 'star') star(ctx, q.x, q.y, q.r)
    else if (q.kind === 'spark') {
      ctx.strokeStyle = q.color
      ctx.lineWidth = q.r
      ctx.beginPath()
      ctx.moveTo(q.x, q.y)
      ctx.lineTo(q.x - q.vx * 0.04, q.y - q.vy * 0.04)
      ctx.stroke()
    } else {
      ctx.beginPath()
      arc(ctx, q.x, q.y, q.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  p.list.length = w
  ctx.restore()
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, wid: number, a: number) {
  const c = Math.cos(a)
  const s = Math.sin(a)
  ctx.beginPath()
  ctx.moveTo(x + c * len, y + s * len)
  ctx.lineTo(x - s * wid, y + c * wid)
  ctx.lineTo(x - c * len, y - s * len)
  ctx.lineTo(x + s * wid, y - c * wid)
  ctx.closePath()
  ctx.fill()
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4
    const rr = k % 2 ? r * 0.4 : r
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fill()
}

const monR = (m: Monster) => (m.kind === 'boss' ? 0.42 : m.kind === 'elite' ? 0.29 : 0.19)

/**
 * Fancy status looks, batched into one path per look so a crowded loop stays cheap:
 * frost tint + crystals, circling stun stars, rising poison bubbles, electric crackle.
 */
function drawStatuses(ctx: CanvasRenderingContext2D, monsters: Monster[], now: number) {
  // a crowded loop drops the small decorations (crystals, second bubble) to keep frames cheap
  const busy = monsters.length > STATUS_DETAIL_MAX
  ctx.save()
  // frost tint
  ctx.beginPath()
  for (const m of monsters) {
    if (m.slowT <= 0) continue
    const { x, y } = monsterLocal(m)
    ctx.moveTo(x + monR(m), y)
    arc(ctx, x, y, monR(m), 0, Math.PI * 2)
  }
  ctx.fillStyle = 'rgba(150,220,255,0.38)'
  ctx.fill()
  // ice crystals
  ctx.beginPath()
  for (const m of monsters) {
    if (m.slowT <= 0 || busy) continue
    const { x, y } = monsterLocal(m)
    const r = monR(m)
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3 + m.id
      const cx = x + Math.cos(a) * r * 0.95
      const cy = y + Math.sin(a) * r * 0.95
      const c = Math.cos(a) * 0.045
      const s = Math.sin(a) * 0.045
      ctx.moveTo(cx + c, cy + s)
      ctx.lineTo(cx - s * 0.55, cy + c * 0.55)
      ctx.lineTo(cx - c, cy - s)
      ctx.lineTo(cx + s * 0.55, cy - c * 0.55)
      ctx.closePath()
    }
  }
  ctx.fillStyle = '#e6f8ff'
  ctx.fill()
  // stun stars (small diamonds circling the head)
  ctx.beginPath()
  for (const m of monsters) {
    if (m.stunT <= 0) continue
    const { x, y } = monsterLocal(m)
    const r = monR(m)
    for (let k = 0; k < 3; k++) {
      const a = now * 5 + (k * Math.PI * 2) / 3
      const sx = x + Math.cos(a) * r * 0.9
      const sy = y - r - 0.06 + Math.sin(a) * 0.06
      ctx.moveTo(sx, sy - 0.055)
      ctx.lineTo(sx + 0.022, sy)
      ctx.lineTo(sx, sy + 0.055)
      ctx.lineTo(sx - 0.022, sy)
      ctx.closePath()
      ctx.moveTo(sx - 0.055, sy)
      ctx.lineTo(sx, sy - 0.022)
      ctx.lineTo(sx + 0.055, sy)
      ctx.lineTo(sx, sy + 0.022)
      ctx.closePath()
    }
  }
  ctx.fillStyle = '#ffe066'
  ctx.fill()
  // poison bubbles
  ctx.beginPath()
  for (const m of monsters) {
    if (m.poisonT <= 0) continue
    const { x, y } = monsterLocal(m)
    const r = monR(m)
    for (let k = 0; k < (busy ? 1 : 2); k++) {
      const q = (now * 0.9 + k * 0.5 + (m.id % 1) * 3) % 1
      const bx = x + (k ? 0.5 : -0.4) * r + Math.sin(now * 5 + k) * 0.03
      const by = y - r * 0.2 - q * 0.45
      const br = 0.03 + 0.02 * q
      ctx.moveTo(bx + br, by)
      arc(ctx, bx, by, br, 0, Math.PI * 2)
    }
  }
  ctx.fillStyle = 'rgba(125,220,90,0.8)'
  ctx.fill()
  // 찌릿찌릿: random crackle around zapped monsters
  ctx.beginPath()
  for (const m of monsters) {
    if (!m.zapT || m.zapT <= 0) continue
    const { x, y } = monsterLocal(m)
    const r = monR(m)
    for (let k = 0; k < 2; k++) {
      const a = Math.random() * Math.PI * 2
      let px = x + Math.cos(a) * r * 1.1
      let py = y + Math.sin(a) * r * 1.1
      ctx.moveTo(px, py)
      for (let j = 0; j < 3; j++) {
        px += (Math.random() - 0.5) * 0.14
        py += (Math.random() - 0.5) * 0.14
        ctx.lineTo(px, py)
      }
    }
  }
  ctx.strokeStyle = '#fff6a8'
  ctx.lineWidth = 0.025
  ctx.stroke()
  ctx.restore()
}

const FLAME_PUFFS = 6
/** Above this many monsters on a loop the status looks get simpler. */
const STATUS_DETAIL_MAX = 50
const FLAME_COLORS = Array.from({ length: FLAME_PUFFS }, (_, k) => `hsl(${18 + 32 * ((k + 1) / FLAME_PUFFS)} 100% 58%)`)

const lerp = (a: number, b: number, q: number) => a + (b - a) * q
const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** Radial burst of `n` particles at (x, y). */
function spray(side: Side, x: number, y: number, n: number, kind: Particle['kind'], color: string, speed: number, r: number, life: number, g = 0) {
  emit(side, n, () => {
    const a = Math.random() * Math.PI * 2
    const v = speed * rand(0.4, 1)
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: life * rand(0.7, 1), r, color, kind, g }
  })
}

/** Glow line under hidden / awakened attacks so they read as stronger. */
function glowLine(ctx: CanvasRenderingContext2D, f: Fx, color: string, width: number) {
  ctx.save()
  ctx.globalAlpha *= 0.35
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(f.x, f.y)
  ctx.lineTo(f.x2!, f.y2!)
  ctx.stroke()
  ctx.restore()
}

/** A projectile that flies from the spirit to the target over the first `fly` share of the fx. */
function flight(f: Fx, p: number, fly: number, arc = 0) {
  const q = Math.min(1, p / fly)
  return {
    q,
    x: lerp(f.x, f.x2!, q),
    y: lerp(f.y, f.y2!, q) - arc * Math.sin(Math.PI * q),
    a: Math.atan2(f.y2! - f.y, f.x2! - f.x),
    hit: q >= 1,
  }
}

/** One type-specific attack frame (fancy effects). */
function drawAttack(ctx: CanvasRenderingContext2D, side: Side, f: Fx, p: number, now: number) {
  const tier = f.tier ?? 1
  const sc = 1 + 0.08 * (tier - 1)
  const awake = tier >= AWAKEN_TIER
  const tx = f.x2!
  const ty = f.y2!
  const fade = Math.max(0, 1 - p)
  ctx.save()
  ctx.lineCap = 'round'
  if (awake) glowLine(ctx, f, '#ffffff', 0.16)
  switch (f.src) {
    case 'fire': {
      // flamethrower: a flickering cone of orange→yellow puffs, embers and a scorch glow
      const dx = tx - f.x
      const dy = ty - f.y
      const len = Math.hypot(dx, dy) || 1
      const nx = -dy / len
      const ny = dx / len
      for (let k = 1; k <= FLAME_PUFFS; k++) {
        const q = k / FLAME_PUFFS
        const j = (Math.random() - 0.5) * 0.16 * q
        ctx.globalAlpha = 0.6 * fade
        ctx.fillStyle = FLAME_COLORS[k - 1]
        ctx.beginPath()
        arc(ctx, f.x + dx * q + nx * j, f.y + dy * q + ny * j, (0.035 + 0.08 * q) * sc, 0, Math.PI * 2)
        ctx.fill()
      }
      // scorch glow: two soft discs (cheaper than a gradient every frame)
      ctx.fillStyle = '#ff7a1a'
      ctx.globalAlpha = 0.3 * fade
      ctx.beginPath()
      arc(ctx, tx, ty, 0.28 * sc, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffe08a'
      ctx.globalAlpha = 0.5 * fade
      ctx.beginPath()
      arc(ctx, tx, ty, 0.13 * sc, 0, Math.PI * 2)
      ctx.fill()
      if (once(f, 1))
        emit(side, 3 + (awake ? 2 : 0), () => ({
          x: tx + rand(-0.1, 0.1),
          y: ty + rand(-0.1, 0.1),
          vx: rand(-0.3, 0.3),
          vy: rand(-0.9, -0.4),
          t: 0,
          life: rand(0.4, 0.7),
          r: 0.025,
          color: '#ffb347',
          kind: 'dot',
          g: 0.6,
        }))
      break
    }
    case 'thunder': {
      // crackling zig-zag (new shape every frame): yellow glow, white core and a side branch
      const pts: [number, number][] = [[f.x, f.y]]
      const segs = 6
      for (let k = 1; k < segs; k++) {
        const q = k / segs
        pts.push([lerp(f.x, tx, q) + rand(-0.14, 0.14), lerp(f.y, ty, q) + rand(-0.14, 0.14)])
      }
      pts.push([tx, ty])
      const mid = pts[3]
      const branch: [number, number] = [mid[0] + rand(-0.35, 0.35), mid[1] + rand(-0.35, 0.35)]
      for (const [col, lw, al] of [
        ['#ffd23f', 0.11 * sc, 0.4],
        ['#ffffff', 0.03 * sc, 1],
      ] as const) {
        ctx.globalAlpha = al * fade
        ctx.strokeStyle = col
        ctx.lineWidth = lw
        ctx.beginPath()
        pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.moveTo(mid[0], mid[1])
        ctx.lineTo(branch[0], branch[1])
        ctx.stroke()
      }
      if (once(f, 1)) spray(side, tx, ty, 5 + (awake ? 3 : 0), 'spark', '#fff3a0', 2.4, 0.025, 0.28)
      break
    }
    case 'ice': {
      // ice shard flies and shatters into crystals
      const s = flight(f, p, 0.6)
      if (!s.hit) {
        ctx.globalAlpha = 0.35
        ctx.strokeStyle = '#bfefff'
        ctx.lineWidth = 0.03
        ctx.beginPath()
        ctx.moveTo(lerp(f.x, s.x, 0.5), lerp(f.y, s.y, 0.5))
        ctx.lineTo(s.x, s.y)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.fillStyle = '#e6f8ff'
        diamond(ctx, s.x, s.y, 0.13 * sc, 0.05 * sc, s.a)
        ctx.strokeStyle = '#7fd6ff'
        ctx.lineWidth = 0.02
        ctx.stroke()
      } else if (once(f, 2)) spray(side, tx, ty, 5 + (awake ? 3 : 0), 'crystal', '#cfefff', 1.1, 0.05, 0.4, 1.2)
      break
    }
    case 'rock': {
      // a rock lobbed in an arc, dust puff on impact
      const s = flight(f, p, 0.75, 0.55)
      if (!s.hit) {
        ctx.globalAlpha = 1
        ctx.fillStyle = '#8b6b4f'
        ctx.beginPath()
        arc(ctx, s.x, s.y, 0.11 * sc, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#5e4632'
        ctx.beginPath()
        arc(ctx, s.x + Math.cos(now * 12) * 0.03, s.y + Math.sin(now * 12) * 0.03, 0.025 * sc, 0, Math.PI * 2)
        ctx.fill()
      } else if (once(f, 2)) spray(side, tx, ty + 0.05, 5, 'puff', '#c8b8a2', 0.6, 0.06 * sc, 0.45, -0.4)
      break
    }
    case 'poison': {
      // spore glob, then a little toxic cloud
      const s = flight(f, p, 0.65, 0.22)
      if (!s.hit) {
        ctx.globalAlpha = 1
        ctx.fillStyle = '#7ddc5a'
        ctx.beginPath()
        arc(ctx, s.x, s.y, 0.09 * sc, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.7)'
        ctx.beginPath()
        arc(ctx, s.x - 0.02, s.y - 0.025, 0.02, 0, Math.PI * 2)
        ctx.fill()
      } else if (once(f, 2)) spray(side, tx, ty, 3, 'puff', '#8fe36a', 0.3, 0.09 * sc, 0.6, -0.3)
      break
    }
    case 'luck': {
      // a spinning clover with a golden sparkle trail; a gold glint on hit
      const s = flight(f, p, 0.65)
      if (!s.hit) {
        ctx.fillStyle = '#ffe066'
        for (let k = 1; k <= 3; k++) {
          ctx.globalAlpha = 0.6 * (1 - k / 4)
          star(ctx, lerp(f.x, s.x, 1 - 0.12 * k), lerp(f.y, s.y, 1 - 0.12 * k), 0.035)
        }
        ctx.globalAlpha = 1
        ctx.fillStyle = '#3ecf8e'
        for (let k = 0; k < 4; k++) {
          const a = now * 10 + (k * Math.PI) / 2
          ctx.beginPath()
          arc(ctx, s.x + Math.cos(a) * 0.04 * sc, s.y + Math.sin(a) * 0.04 * sc, 0.035 * sc, 0, Math.PI * 2)
          ctx.fill()
        }
      } else if (once(f, 2)) spray(side, tx, ty, 4, 'star', '#ffd23f', 0.9, 0.05, 0.4)
      break
    }
    case 'wind': {
      // crescent wind slash with a swirl trail
      const s = flight(f, p, 0.7)
      if (!s.hit) {
        ctx.strokeStyle = '#e3dcff'
        for (let k = 2; k >= 0; k--) {
          const q = Math.max(0, s.q - 0.12 * k)
          ctx.globalAlpha = k ? 0.3 / k : 1
          ctx.lineWidth = (k ? 0.025 : 0.05) * sc
          const cx = lerp(f.x, tx, q)
          const cy = lerp(f.y, ty, q)
          ctx.beginPath()
          arc(ctx, cx - Math.cos(s.a) * 0.08, cy - Math.sin(s.a) * 0.08, 0.15 * sc, s.a - 1.1 + now * (k ? 6 : 0), s.a + 1.1 + now * (k ? 6 : 0))
          ctx.stroke()
        }
      } else if (once(f, 2)) spray(side, tx, ty, 3, 'puff', '#d9ceff', 0.5, 0.05, 0.35)
      break
    }
    case 'curse': {
      // a wavy violet hex bolt
      glowLine(ctx, f, '#c77dff', 0.16 * sc)
      ctx.globalAlpha = fade
      ctx.strokeStyle = '#e2b6ff'
      ctx.lineWidth = 0.04 * sc
      ctx.beginPath()
      const n = 8
      for (let k = 0; k <= n; k++) {
        const q = k / n
        const w = Math.sin(q * Math.PI * 3 + now * 20) * 0.07
        const x = lerp(f.x, tx, q) - Math.sin(Math.atan2(ty - f.y, tx - f.x)) * w
        const y = lerp(f.y, ty, q) + Math.cos(Math.atan2(ty - f.y, tx - f.x)) * w
        if (k) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
      }
      ctx.stroke()
      if (once(f, 1)) spray(side, tx, ty, 4, 'puff', '#9b4dff', 0.4, 0.06, 0.5, -0.5)
      break
    }
    case 'rainbow': {
      // rainbow beam, every segment its own hue
      glowLine(ctx, f, '#ff7eb6', 0.16 * sc)
      ctx.globalAlpha = fade
      ctx.lineWidth = 0.05 * sc
      const n = 6
      for (let k = 0; k < n; k++) {
        ctx.strokeStyle = `hsl(${(k / n) * 360 + now * 400} 95% 65%)`
        ctx.beginPath()
        ctx.moveTo(lerp(f.x, tx, k / n), lerp(f.y, ty, k / n))
        ctx.lineTo(lerp(f.x, tx, (k + 1) / n), lerp(f.y, ty, (k + 1) / n))
        ctx.stroke()
      }
      if (once(f, 1)) spray(side, tx, ty, 4, 'star', '#ffffff', 1, 0.04, 0.35)
      break
    }
    default: {
      // ☄️ meteor (its blast is a separate fx): a hot glowing streak
      glowLine(ctx, f, f.color, 0.16 * sc)
      ctx.globalAlpha = fade
      ctx.strokeStyle = '#fff1d6'
      ctx.lineWidth = 0.05 * sc
      ctx.beginPath()
      ctx.moveTo(f.x, f.y)
      ctx.lineTo(tx, ty)
      ctx.stroke()
    }
  }
  ctx.restore()
}
