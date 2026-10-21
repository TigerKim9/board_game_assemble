// UI pieces shared by the solo / versus board (index.tsx) and the co-op field (coop.tsx).
import { useEffect, useRef, useState } from 'react'
import { Modal } from '../../components/Modal'
import { load, save, useStored } from '../../lib/storage'
import type { PlayerConfig } from '../../lib/types'
import {
  AWAKEN_TIER,
  CARDS,
  MISSIONS,
  SKILLS,
  SKILL_INFO,
  canGamble,
  canInvest,
  canSkill,
  invest,
  investCost,
  investGain,
  MAX_INCOME,
  passiveRate,
  gamble,
  gamblePrice,
  missionReward,
  skillIndex,
  castSkill,
  CARD_IDS,
  CLASS_NAMES,
  HIDDEN_TYPES,
  INFO,
  MAX_TIER,
  MAX_UPGRADE,
  TIER_COLORS,
  UNLOCK_WAVES,
  act,
  auraInfo,
  canMerge,
  canMergeRecipe,
  canSummon,
  cardDesc,
  cardN,
  canTransform,
  canUnlock,
  canUpgrade,
  fmt,
  isHidden,
  isStuck,
  newDiscoveries,
  pickCard,
  recipeFor,
  refundOf,
  sell,
  slotAt,
  summon,
  summonPrice,
  transform,
  transformPrice,
  transformable,
  unitDamage,
  unitInterval,
  unlock,
  unlockCost,
  upgrade,
  upgradeCost,
  type CardId,
  type Game,
  type HiddenType,
  type Side,
} from './logic'
import type { UiState } from './render'

// ---- randomness: daily challenges draw from seeded streams, normal games from Math.random ----

export interface Rngs {
  summon: () => number
  merge: () => number
  card: () => number
}
export const uiRngs = (g: Game): Rngs =>
  g.streams
    ? { summon: g.streams.summon, merge: g.streams.merge, card: g.streams.card }
    : { summon: Math.random, merge: Math.random, card: Math.random }

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

export function transformSelected(side: Side, ui: UiState, rng: () => number = Math.random): boolean {
  if (ui.sel < 0 || !transform(side, ui.sel, rng)) return false
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
export function boardDown(side: Side, ui: UiState, x: number, y: number, pointerId: number, rng: () => number = Math.random): boolean {
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
    act(side, ui.sel, slot, rng)
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
export function boardUp(side: Side, ui: UiState, x: number, y: number, blocked: boolean, rng: () => number = Math.random) {
  const d = ui.drag
  if (!d) return
  ui.drag = null
  if (blocked) return
  const target = slotAt(x, y)
  if (d.moved) {
    if (target >= 0 && target !== d.from) act(side, d.from, target, rng)
    select(ui, -1)
  } else if (ui.sel < 0 || ui.sel === d.from) {
    select(ui, ui.sel === d.from ? -1 : d.from)
  } else if (canMerge(side.units[ui.sel], side.units[d.from])) {
    act(side, ui.sel, d.from, rng)
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
      <MissionChip side={side} />
      <CardChips side={side} />
      <span className="rd-coins">
        🪙 {Math.floor(side.coins)}
        {/* passive income; the key re-runs a small pulse every couple of seconds */}
        <small className="rd-rate" key={Math.floor(side.incomeT / 2)}>
          +{fmtRate(passiveRate(side))}/s
        </small>
      </span>
    </div>
  )
}

export function Controls({ side, press, rngs }: { side: Side; press: Press; rngs: Rngs }) {
  const cost = summonPrice(side)
  return (
    <div className="rd-controls">
      <button className="btn accent rd-summon" disabled={!canSummon(side)} {...press(() => summon(side, rngs.summon))}>
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

const fmtRate = (r: number) => (r < 10 ? r.toFixed(1).replace(/\.0$/, '') : String(Math.round(r)))

/** 🎰 gamble summon, 💹 income investment and the two ⚡ skills (with a cooldown sweep). */
export function SkillBar({ side, press, rngs }: { side: Side; press: Press; rngs: Rngs }) {
  return (
    <div className="rd-skillbar">
      <button className="btn rd-gamble" disabled={!canGamble(side)} {...press(() => gamble(side, rngs.summon))} aria-label="도박 소환">
        <b>🎰 도박</b>
        <small>🪙 {gamblePrice(side)}</small>
      </button>
      <button
        className="btn rd-invest"
        disabled={!canInvest(side)}
        {...press(() => invest(side))}
        aria-label="수입 투자"
        title={
          side.incomeLvl >= MAX_INCOME
            ? '수입 투자 최대 레벨'
            : `자동 수입 +${fmtRate(passiveRate(side))}/s → +${fmtRate(passiveRate(side) + investGain(side))}/s`
        }
      >
        <b>💹 투자</b>
        <small>
          Lv{side.incomeLvl}·{side.incomeLvl >= MAX_INCOME ? '최대' : `🪙${investCost(side.incomeLvl)}`}
        </small>
      </button>
      {SKILLS.map((k) => {
        const cd = side.skillCd[skillIndex(k)]
        const ready = canSkill(side, k)
        const info = SKILL_INFO[k]
        const active = k === 'freeze' && side.freezeT > 0
        return (
          <button
            key={k}
            className={`btn rd-skill ${ready ? 'ready' : ''} ${active ? 'active' : ''}`}
            disabled={!ready}
            style={{ '--cd': `${Math.min(1, cd / info.cd)}` } as React.CSSProperties}
            {...press(() => castSkill(side, k))}
            aria-label={info.name}
            title={info.desc}
          >
            <b>
              {info.emoji} {k === 'freeze' ? '정지' : info.name}
            </b>
            <small>{ready ? '준비!' : `${Math.ceil(cd)}초`}</small>
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
export function ActionOverlay({
  side,
  ui,
  press,
  className = '',
  rngs,
  info = false,
}: {
  side: Side
  ui: UiState
  press: Press
  className?: string
  rngs?: Rngs
  /** Also show a one-line summary of the selected spirit (cramped layouts without an InfoLine). */
  info?: boolean
}) {
  const selUnit = ui.sel >= 0 ? side.units[ui.sel] : null
  const selLocked = ui.sel >= 0 && !side.open[ui.sel]
  const stuck = isStuck(side)
  if (selUnit) {
    const confirming = ui.confirm === selUnit.id
    const tCost = transformPrice(side, selUnit.tier)
    const rng = rngs?.merge ?? Math.random
    const aura = info ? auraInfo(side)[ui.sel] : null
    return (
      <div className={`rd-actions ${stuck ? 'stuck' : ''} ${info ? 'with-info' : ''} ${className}`}>
        {info && (
          <span className="rd-sel-info">
            <span>
              {INFO[selUnit.type].emoji} <span style={{ color: TIER_COLORS[selUnit.tier] }}>{'★'.repeat(selUnit.tier)}</span> · 공격{' '}
              {fmt(unitDamage(selUnit, side))} · 초당 {((aura?.mult ?? 1) / unitInterval(selUnit)).toFixed(1)}회
              {aura && aura.count > 0 && ` · 🌪️+${Math.round((aura.mult - 1) * 100)}%`}
            </span>
          </span>
        )}
        <button className={`btn small rd-act-sell ${confirming ? 'confirm' : ''}`} {...press(() => sellSelected(side, ui))}>
          {confirming ? '한 번 더 누르면 판매' : '💰 판매'} <b>+{refundOf(selUnit)}</b>
        </button>
        {transformable(selUnit) && (
          <button className="btn small rd-act-swap" disabled={!canTransform(side, ui.sel)} {...press(() => transformSelected(side, ui, rng))}>
            🔄 바꾸기 <b>🪙{tCost}</b>
          </button>
        )}
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
  const special = selUnit ? side.units.filter((u) => canMergeRecipe(selUnit, u)).length : 0
  const stuck = isStuck(side)
  const freeWave = UNLOCK_WAVES.find((w) => w > game.wave)
  return (
    <p className={`rd-info ${stuck && !selUnit && !selLocked ? 'rd-info-stuck' : ''}`}>
      {selUnit ? (
        <>
          {INFO[selUnit.type].emoji} <b>{isHidden(selUnit.type) ? `✨${INFO[selUnit.type].name}` : INFO[selUnit.type].name}</b>{' '}
          <span style={{ color: TIER_COLORS[selUnit.tier] }}>{'★'.repeat(selUnit.tier)}</span> · {INFO[selUnit.type].role} ·
          공격력 {fmt(unitDamage(selUnit, side))} · 초당 {((selAura?.mult ?? 1) / unitInterval(selUnit)).toFixed(1)}회
          {selAura && selAura.count > 0 && (
            <span className="rd-haste">
              {' '}
              · 🌪️×{selAura.count} 공격 속도 +{Math.round((selAura.mult - 1) * 100)}%
            </span>
          )}
          {selUnit.tier >= AWAKEN_TIER
            ? ' · ✨각성: 공격이 두 번'
            : partners
              ? ` · 합칠 짝 ${partners}${special ? ` (✨특별 ${special})` : ''}`
              : selUnit.tier >= MAX_TIER - 1
                ? ' · 같은 정령 ★6끼리 합치면 각성!'
                : ' · 같은 정령·같은 별이 필요해요'}
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

// ---- augment cards ----

/**
 * The 3-pick-1 card offer. `center`: solo, over the whole arena (the game waits);
 * `board`: over a versus board; `top` / `bottom`: over one half of the co-op field.
 */
interface PickerProps {
  side: Side
  rng?: () => number
  variant: 'center' | 'board' | 'top' | 'bottom'
  flipped?: boolean
  /** Show the 1 / 2 / 3 key hints. */
  keys?: boolean
  onPick: () => void
}

export function CardPicker(props: PickerProps) {
  const offer = props.side.offer
  if (!offer) return null
  // a fresh picker (and arming delay) for every offer
  return <OfferPicker key={offer.join(',') + props.side.offerQueue} offer={offer} {...props} />
}

function OfferPicker({ side, variant, flipped = false, keys = false, onPick, offer, rng = Math.random }: PickerProps & { offer: CardId[] }) {
  // ignore taps in the first moment so a tap meant for the board doesn't pick a card by accident
  const shownAt = useRef(Infinity)
  useEffect(() => {
    shownAt.current = performance.now()
  }, [])
  const take = (id: CardId) => {
    if (performance.now() - shownAt.current < 350) return
    if (pickCard(side, id, rng)) onPick()
  }
  return (
    <div className={`rd-cards ${variant} ${flipped ? 'flipped' : ''}`}>
      <div className="rd-cards-box">
        <div className="rd-cards-title">
          🃏 증강 카드 — 하나를 골라요
          {side.offerQueue > 0 && <span className="rd-cards-more"> +{side.offerQueue}장 더</span>}
        </div>
        <div className="rd-cards-row">
          {offer.map((id, k) => {
            const n = cardN(side, id)
            return (
              <button
                key={id}
                className="rd-card"
                onPointerDown={(e) => {
                  if (e.button !== 0) return
                  e.preventDefault()
                  take(id)
                }}
                onClick={(e) => e.detail === 0 && take(id)}
              >
                <span className="rd-card-emoji">{CARDS[id].emoji}</span>
                <b>{CARDS[id].name}</b>
                <small>{cardDesc(id, side)}</small>
                {n > 0 && <i className="rd-card-own">보유 {n}</i>}
                {keys && <kbd>{k + 1}</kbd>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Owned cards as small emoji chips; tapping opens the list with descriptions. */
export function CardChips({ side }: { side: Side }) {
  const [open, setOpen] = useState(false)
  const owned = CARD_IDS.filter((id) => cardN(side, id) > 0)
  if (!owned.length) return null
  const shown = owned.slice(0, 3)
  return (
    <span className="rd-chips-wrap">
      <button className="rd-chips" onClick={() => setOpen((v) => !v)} aria-label="내 증강 카드" aria-expanded={open}>
        {shown.map((id) => (
          <span key={id}>
            {CARDS[id].emoji}
            {cardN(side, id) > 1 && <sub>{cardN(side, id)}</sub>}
          </span>
        ))}
        {owned.length > shown.length && <span className="rd-chips-more">+{owned.length - shown.length}</span>}
      </button>
      {open && (
        <div className="rd-chips-pop" onClick={() => setOpen(false)} role="dialog" aria-label="내 증강 카드">
          {owned.map((id) => (
            <p key={id}>
              <span>{CARDS[id].emoji}</span>
              <span>
                <b>
                  {CARDS[id].name}
                  {cardN(side, id) > 1 ? ` ×${cardN(side, id)}` : ''}
                </b>{' '}
                <small>{id === 'chest' ? '코인을 받았어요' : CARDS[id].desc}</small>
              </span>
            </p>
          ))}
        </div>
      )}
    </span>
  )
}

// ---- codex (도감) ----

/** Discovered hidden spirits, kept across games. */
const CODEX_KEY = 'random-defense-codex'

export function CodexModal({ onClose }: { onClose: () => void }) {
  const [known] = useStored<string[]>(CODEX_KEY, [])
  const count = HIDDEN_TYPES.filter((h) => known.includes(h)).length
  return (
    <Modal title="📖 정령 도감" onClose={onClose}>
      <p className="muted rd-codex-note">
        특정한 두 정령을 같은 별(★3 이상)로 합치면 숨겨진 정령이 태어나요. 발견 <b>{count}</b>/{HIDDEN_TYPES.length}
      </p>
      <ul className="rd-codex">
        {HIDDEN_TYPES.map((h) => {
          const r = recipeFor(h)
          const found = known.includes(h)
          return (
            <li key={h} className={found ? 'found' : 'unknown'}>
              <span className="rd-codex-emoji" style={found ? { background: INFO[h].color } : undefined}>
                {found ? INFO[h].emoji : '❔'}
              </span>
              <span>
                <b>{found ? INFO[h].name : '???'}</b>
                <small>{found ? INFO[h].role : '아직 발견하지 못했어요'}</small>
                <small className="rd-codex-recipe">
                  {INFO[r.a].emoji} + {found ? INFO[r.b].emoji : '❓'}
                  {found ? '' : ' …?'}
                </small>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="muted rd-codex-note">✨ ★7 각성: 같은 정령 ★6 두 마리를 합치면 종류가 그대로인 ★7이 돼요. 공격이 두 번씩!</p>
    </Modal>
  )
}

/**
 * Watches the human sides for hidden spirits made for the first time and celebrates them with a
 * slim banner along the top edge of the board (render it inside `.rd-board`).
 */
export function Discoveries({ sides, humans, className = '' }: { sides: Side[]; humans: number[]; className?: string }) {
  const [toast, setToast] = useState<{ types: HiddenType[]; key: number } | null>(null)
  const found = humans.flatMap((i) => sides[i].found).join(',')
  // record new kinds in the codex (localStorage) and celebrate them
  useEffect(() => {
    if (!found) return
    const known = load<string[]>(CODEX_KEY, [])
    const fresh = newDiscoveries(known, found.split(',') as HiddenType[])
    if (!fresh.length) return
    save(CODEX_KEY, [...known, ...fresh])
    const show = setTimeout(() => setToast({ types: fresh, key: Date.now() }), 0)
    return () => clearTimeout(show)
  }, [found])
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])
  if (!toast) return null
  return (
    <div className={`rd-toast ${className}`} key={toast.key} role="status">
      ✨ 새로운 정령 발견! {toast.types.map((t) => `${INFO[t].emoji} ${INFO[t].name}`).join(' · ')}
    </div>
  )
}

// ---- 🎯 missions ----

/** Mission chip: three mini progress bars; tap for the list with progress and rewards. */
export function MissionChip({ side }: { side: Side }) {
  const [open, setOpen] = useState(false)
  if (!side.missions.length) return null
  return (
    <span className="rd-chips-wrap">
      <button className="rd-chips rd-mchip" onClick={() => setOpen((v) => !v)} aria-label="미션" aria-expanded={open}>
        🎯
        <span className="rd-mbars">
          {side.missions.map((m, k) => (
            <i key={k}>
              <i style={{ width: `${(100 * m.progress) / m.goal}%` }} />
            </i>
          ))}
        </span>
      </button>
      {open && (
        <div className="rd-chips-pop" onClick={() => setOpen(false)} role="dialog" aria-label="미션">
          <p className="rd-mhead">
            <b>🎯 미션</b> <small>완료하면 🪙 {missionReward(side.wave)} · 완료 {side.missionsDone}개</small>
          </p>
          {side.missions.map((m, k) => (
            <p key={k} className="rd-mrow">
              <span>{MISSIONS[m.id].emoji}</span>
              <span>
                {MISSIONS[m.id].text(m.goal)}
                <span className="rd-mbar">
                  <i style={{ width: `${(100 * m.progress) / m.goal}%` }} />
                </span>
              </span>
              <b>
                {m.progress}/{m.goal}
              </b>
            </p>
          ))}
        </div>
      )}
    </span>
  )
}

// ---- effects setting ----

export type FxMode = 'fancy' | 'simple'

/** 이펙트 「화려하게 / 간단히」, remembered; reduced-motion users start with 간단히. */
export function useFxSetting() {
  return useStored<FxMode>(
    'random-defense-fx',
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'simple' : 'fancy',
  )
}

export function FxToggle({ value, onChange }: { value: FxMode; onChange: (v: FxMode) => void }) {
  return (
    <div className="rd-fxrow">
      <span>✨ 이펙트</span>
      <div className="segmented" role="radiogroup" aria-label="이펙트">
        {(
          [
            ['fancy', '화려하게'],
            ['simple', '간단히'],
          ] as const
        ).map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
