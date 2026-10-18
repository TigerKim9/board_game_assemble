// UI pieces shared by the solo / versus board (index.tsx) and the co-op field (coop.tsx).
import type { PlayerConfig } from '../../lib/types'
import {
  CLASS_NAMES,
  INFO,
  MAX_TIER,
  MAX_UPGRADE,
  TIER_COLORS,
  UNLOCK_WAVES,
  act,
  auraInfo,
  canMerge,
  canSummon,
  canTransform,
  canUnlock,
  canUpgrade,
  fmt,
  isStuck,
  refundOf,
  sell,
  slotAt,
  summon,
  summonCost,
  transform,
  transformCost,
  unitDamage,
  unitInterval,
  unlock,
  unlockCost,
  upgrade,
  upgradeCost,
  type Game,
  type Side,
} from './logic'
import type { UiState } from './render'

// ---- selection actions shared by the action bar and the keyboard ----

export function select(ui: UiState, slot: number) {
  if (ui.sel !== slot) ui.confirm = 0
  ui.sel = slot
}

/** Sells the selected spirit; ★3+ needs a second press. Returns 'confirm' while waiting for it. */
export function sellSelected(side: Side, ui: UiState): 'sold' | 'confirm' | null {
  const u = ui.sel >= 0 ? side.units[ui.sel] : null
  if (!u) return null
  if (u.tier >= 3 && ui.confirm !== u.id) {
    ui.confirm = u.id
    return 'confirm'
  }
  sell(side, ui.sel)
  select(ui, -1)
  return 'sold'
}

export function transformSelected(side: Side, ui: UiState): boolean {
  if (ui.sel < 0 || !transform(side, ui.sel, Math.random)) return false
  ui.confirm = 0
  return true
}

/** Opens the selected locked slot, or the next one when no locked slot is selected. */
export function unlockSelected(side: Side, ui: UiState): boolean {
  const slot = ui.sel >= 0 && !side.open[ui.sel] ? ui.sel : undefined
  if (unlock(side, slot) < 0) return false
  if (slot != null) select(ui, -1)
  return true
}

// ---- board pointer input, in board-local field coordinates ----

/** Pointer down on a board. Returns true when a drag started (caller should capture the pointer). */
export function boardDown(side: Side, ui: UiState, x: number, y: number, pointerId: number): boolean {
  const slot = slotAt(x, y)
  if (slot < 0) {
    select(ui, -1)
    return false
  }
  if (!side.open[slot]) {
    select(ui, ui.sel === slot ? -1 : slot)
    return false
  }
  if (side.units[slot]) {
    ui.drag = { id: pointerId, from: slot, x, y, sx: x, sy: y, moved: false }
    return true
  }
  if (ui.sel >= 0) {
    act(side, ui.sel, slot, Math.random)
    select(ui, -1)
  }
  return false
}

export function boardMove(ui: UiState, x: number, y: number) {
  const d = ui.drag
  if (!d) return
  d.x = x
  d.y = y
  if (!d.moved && Math.hypot(x - d.sx, y - d.sy) > 0.25) d.moved = true
}

/** Pointer up: finish a drag (move / swap / merge) or treat it as a tap (select / tap-tap merge). */
export function boardUp(side: Side, ui: UiState, x: number, y: number, blocked: boolean) {
  const d = ui.drag
  if (!d) return
  ui.drag = null
  if (blocked) return
  const target = slotAt(x, y)
  if (d.moved) {
    if (target >= 0 && target !== d.from) act(side, d.from, target, Math.random)
    select(ui, -1)
  } else if (ui.sel < 0 || ui.sel === d.from) {
    select(ui, ui.sel === d.from ? -1 : d.from)
  } else if (canMerge(side.units[ui.sel], side.units[d.from])) {
    act(side, ui.sel, d.from, Math.random)
    select(ui, -1)
  } else select(ui, d.from)
}

export type Press = (fn: () => unknown) => {
  onPointerDown: (e: React.PointerEvent) => void
  onClick: (e: React.MouseEvent) => void
}

/** Buttons fire on pointerdown so two players can press at the same time; keyboard still works via click. */
export function makePress(blocked: () => boolean, onChange: () => void): Press {
  return (fn) => ({
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
}

// ---- widgets ----

export function Hud({
  player,
  side,
  count,
  limit,
  label,
  color,
}: {
  player: PlayerConfig
  side: Side
  count: number
  limit: number
  /** Text before the count (defaults to 👾). */
  label?: string
  color?: string
}) {
  const danger = count / limit
  return (
    <div className="rd-hud">
      <span className="rd-name">
        {color && <i className="rd-dot" style={{ background: color }} />}
        {player.isAI ? '🤖 ' : ''}
        {player.name}
      </span>
      <span className={`rd-count ${danger > 0.75 ? 'danger' : danger > 0.5 ? 'warn' : ''}`}>
        {label ?? '👾'} {count}/{limit}
        <i style={{ width: `${Math.min(100, danger * 100)}%` }} />
      </span>
      {side.bossT != null && <span className="rd-bosst">👹 {Math.max(0, Math.ceil(side.bossT))}초</span>}
      <span className="rd-coins">🪙 {Math.floor(side.coins)}</span>
    </div>
  )
}

export function Controls({ side, press }: { side: Side; press: Press }) {
  const cost = summonCost(side.summons)
  return (
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
  )
}

export function AiNote({ side }: { side: Side }) {
  return <div className="rd-ai-note muted">강화 {CLASS_NAMES.map((n, c) => `${n} ${side.upg[c]}`).join(' · ')}</div>
}

/** Sell / transform buttons for the selected spirit, the unlock button for a locked slot, or the stuck hint. */
export function ActionOverlay({ side, ui, press, className = '' }: { side: Side; ui: UiState; press: Press; className?: string }) {
  const selUnit = ui.sel >= 0 ? side.units[ui.sel] : null
  const selLocked = ui.sel >= 0 && !side.open[ui.sel]
  const stuck = isStuck(side)
  if (selUnit) {
    const confirming = ui.confirm === selUnit.id
    const tCost = transformCost(selUnit.tier, side.transforms)
    return (
      <div className={`rd-actions ${stuck ? 'stuck' : ''} ${className}`}>
        <button className={`btn small rd-act-sell ${confirming ? 'confirm' : ''}`} {...press(() => sellSelected(side, ui))}>
          {confirming ? '한 번 더 누르면 판매' : '💰 판매'} <b>+{refundOf(selUnit)}</b>
        </button>
        <button className="btn small rd-act-swap" disabled={!canTransform(side, ui.sel)} {...press(() => transformSelected(side, ui))}>
          🔄 바꾸기 <b>🪙{tCost}</b>
        </button>
      </div>
    )
  }
  if (selLocked) {
    return (
      <div className={`rd-actions ${className}`}>
        <button className="btn small primary rd-act-unlock" disabled={!canUnlock(side)} {...press(() => unlockSelected(side, ui))}>
          🔓 칸 열기 <b>🪙{unlockCost(side.unlocks)}</b>
        </button>
      </div>
    )
  }
  if (stuck) return <div className={`rd-hint ${className}`}>합칠 짝이 없어요 — 정령을 팔거나 바꿔 보세요</div>
  return null
}

/** One-line description of the selection (solo layout). */
export function InfoLine({ game, side, ui, idle }: { game: Game; side: Side; ui: UiState; idle?: string }) {
  const selUnit = ui.sel >= 0 ? side.units[ui.sel] : null
  const selAura = selUnit ? auraInfo(side)[ui.sel] : null
  const selLocked = ui.sel >= 0 && !side.open[ui.sel]
  const partners = selUnit ? side.units.filter((u) => u && u !== selUnit && canMerge(selUnit, u)).length : 0
  const stuck = isStuck(side)
  const freeWave = UNLOCK_WAVES.find((w) => w > game.wave)
  return (
    <p className={`rd-info ${stuck && !selUnit && !selLocked ? 'rd-info-stuck' : ''}`}>
      {selUnit ? (
        <>
          {INFO[selUnit.type].emoji} <b>{INFO[selUnit.type].name}</b>{' '}
          <span style={{ color: TIER_COLORS[selUnit.tier] }}>{'★'.repeat(selUnit.tier)}</span> · {INFO[selUnit.type].role} ·
          공격력 {fmt(unitDamage(selUnit, side))} · 초당 {((selAura?.mult ?? 1) / unitInterval(selUnit)).toFixed(1)}회
          {selAura && selAura.count > 0 && (
            <span className="rd-haste">
              {' '}
              · 🌪️×{selAura.count} 공격 속도 +{Math.round((selAura.mult - 1) * 100)}%
            </span>
          )}
          {selUnit.tier >= MAX_TIER ? ' · 최고 등급' : partners ? ` · 합칠 짝 ${partners}` : ' · 같은 정령·같은 별이 필요해요'}
        </>
      ) : selLocked ? (
        <>
          🔒 <b>잠긴 칸</b> · 코인으로 지금 열거나
          {freeWave ? `, 웨이브 ${freeWave}에 무료로 하나씩 열려요` : ' 기다려요'}
        </>
      ) : stuck ? (
        <>
          <b>정령을 탭</b>하면 💰판매 · 🔄바꾸기 버튼이 나와요. 바꾸기는 같은 별의 다른 정령으로 바꿔 줘요
        </>
      ) : (
        (idle ?? '같은 정령(같은 별)끼리 끌어 겹치면 합쳐져요 · 정령을 탭하면 판매·바꾸기 · 🔒칸은 코인으로 열 수 있어요')
      )}
    </p>
  )
}
