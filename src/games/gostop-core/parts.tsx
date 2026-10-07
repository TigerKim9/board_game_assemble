/**
 * 맞고·고스톱 화면 조각 (표시 전용). 로컬 게임(GostopGame)과 온라인 화면이 함께 써요.
 */
import { useState } from 'react'
import { CaptureRows, FloorGroups, HwatuCard, HwatuPile, HwatuStyleButton, ProgressChips, getCard } from '../../hwatu'
import { WON_PER_POINT, canBomb, canShake, goBonus, matchesOnFloor, progressOf, scoreOf, type GEvent, type GPlayer, type GState, type Mode, type PlayAction, type RoundResult } from './logic'
import './gostop.css'

export const won = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('ko-KR')}원`

export function goLabel(n: number): string {
  const { add, mult } = goBonus(n)
  return mult > 1 ? `+${add}점 ×${mult}` : `+${add}점`
}

/** 플레이어별 점수 변화 (점) */
export function pointsDelta(r: RoundResult, n: number): number[] {
  const d = Array.from({ length: n }, () => 0)
  if (r.winner == null) return d
  for (const p of r.payments) {
    d[p.from] -= p.points
    d[r.winner] += p.points
  }
  return d
}

/** 플레이어별 돈 변화 (원) */
export function moneyDelta(r: RoundResult, n: number): number[] {
  return pointsDelta(r, n).map((x) => x * WON_PER_POINT)
}

export interface Toast {
  id: number
  text: string
  type: GEvent['type']
  who: string
}

function Badges({ p }: { p: GPlayer }) {
  return (
    <>
      {p.goCount > 0 && <span className="gostop-badge go">{p.goCount}고</span>}
      {p.shakes - p.bombs > 0 && <span className="gostop-badge">흔들 {p.shakes - p.bombs > 1 ? `×${p.shakes - p.bombs}` : ''}</span>}
      {p.bombs > 0 && <span className="gostop-badge">💣{p.bombs > 1 ? `×${p.bombs}` : ''}</span>}
      {p.ppeoks > 0 && <span className="gostop-badge dim">뻑 {p.ppeoks}</span>}
    </>
  )
}

export function PlayerPanel({
  p,
  active,
  threshold,
  compact,
  mine,
  defaultOpen,
  handCount,
}: {
  p: GPlayer
  active: boolean
  threshold: number
  compact?: boolean
  mine?: boolean
  defaultOpen?: boolean
  /** 손패 장수 (손패가 가려져 있을 때) */
  handCount?: number
}) {
  const [open, setOpen] = useState(mine || !!defaultOpen)
  const sc = scoreOf(p.captured)
  const g = { gwang: [] as number[], yeol: [] as number[], tti: [] as number[], pi: [] as number[] }
  for (const id of p.captured.slice().sort((a, b) => a - b)) {
    const c = getCard(id)
    if (c.isGukjin && sc.gukjinAsPi) g.pi.push(id)
    else g[c.kind].push(id)
  }
  const counts = { gwang: g.gwang.length, yeol: g.yeol.length, tti: g.tti.length, pi: sc.pi }
  const prog = progressOf(p.captured)
  const hand = handCount ?? p.hand.length
  // 고/스톱까지 남은 점수 (고를 했다면 지난 점수보다 올라야 함)
  const target = Math.max(threshold, p.goCount > 0 ? p.lastGoScore + 1 : 0)
  const left = target - sc.total
  return (
    <div className={`gostop-player ${active ? 'active' : ''} ${compact ? 'compact' : ''} ${mine ? 'mine' : ''}`}>
      <button className="gostop-player-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="gostop-player-name">
          {p.isAI ? '🤖 ' : ''}
          {mine ? `${p.name} (나)` : p.name}
        </span>
        {compact && (
          <span className="gostop-backs" aria-label={`손패 ${hand}장`}>
            <HwatuCard faceDown width={14} />
            <b>{hand}</b>
          </span>
        )}
        <Badges p={p} />
        <span className="gostop-scorebox">
          <span className={`gostop-score ${sc.total >= threshold ? 'ready' : ''}`}>{sc.total}점</span>
          <small className={`gostop-goal ${left <= 0 ? 'ready' : ''}`}>{left <= 0 ? (p.goCount > 0 ? '다시 고/스톱!' : '고/스톱!') : `${p.goCount > 0 ? '다음 고' : '고'}까지 ${left}점`}</small>
        </span>
        <span className="gostop-toggle">{open ? '▲' : '▼'}</span>
      </button>
      {sc.items.length > 0 && <div className="gostop-items">{sc.items.map((it) => `${it.label} ${it.points}점`).join(' · ')}</div>}
      <ProgressChips items={prog} hideZero={!mine || !open} className="gostop-prog" />
      {open ? (
        <div className="gostop-rows">
          <CaptureRows groups={g} counts={counts} width={compact ? 26 : 30} hideEmpty={compact} />
          {compact && p.captured.length === 0 && <span className="muted gostop-none">아직 먹은 패가 없어요</span>}
        </div>
      ) : (
        p.captured.length === 0 && <div className="muted gostop-none gostop-rows">아직 먹은 패가 없어요</div>
      )}
    </div>
  )
}

/** 가운데 판: 사건 토스트, 바닥, 더미·뒤집은 카드·메시지 */
export function GostopTable({
  s,
  deckCount,
  message,
  toasts,
  highlight,
  clickable,
  onPick,
}: {
  s: Pick<GState, 'floor' | 'ppeok' | 'ctx' | 'phase' | 'nagariMult' | 'cfg'>
  deckCount: number
  message: string
  toasts: Toast[]
  highlight: number[]
  clickable: number[]
  onPick: (id: number) => void
}) {
  const { ctx, phase } = s
  const showFlip = ctx?.flipped != null && (phase.kind === 'chooseFlip' || phase.kind === 'resolve')
  const fresh = new Set(ctx?.played ?? [])
  return (
    <div className="gostop-table felt">
      <div className="gostop-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`gostop-toast gostop-toast-${t.type}`}>
            <small>{t.who}</small>
            {t.text}
          </div>
        ))}
      </div>
      <FloorGroups floor={s.floor} width={44} ppeok={s.ppeok} highlight={highlight} clickable={clickable} fresh={fresh} onPick={onPick} />
      <div className="gostop-center">
        <HwatuPile count={deckCount} width={40} />
        <div className="gostop-flip">{showFlip && <HwatuCard key={ctx!.flipped!} card={ctx!.flipped!} width={44} className="hw-flip" title="뒤집은 카드" />}</div>
        <div className="gostop-msg">
          {s.nagariMult > 1 && <span className="gostop-badge hot">판돈 ×{s.nagariMult}</span>}
          {message || `${s.cfg.threshold}점부터 고·스톱!`}
        </div>
      </div>
    </div>
  )
}

/** 고/스톱 결정 패널 */
export function GoStopPanel({
  score,
  goCount,
  stopPreview,
  onDecide,
}: {
  score: number
  goCount: number
  stopPreview: number | null
  onDecide: (go: boolean) => void
}) {
  return (
    <div className="gostop-decide card-panel">
      <p>
        지금 <strong>{score}점</strong>
        {goCount > 0 && ` · ${goCount}고 중`}
        {stopPreview != null && (
          <>
            <br />
            스톱하면 <strong>{stopPreview}점</strong> ({won(stopPreview * WON_PER_POINT)}) 획득
          </>
        )}
      </p>
      <div className="btn-row">
        <button className="btn accent big" onClick={() => onDecide(true)}>
          {goCount + 1}고!
          <small> ({goLabel(goCount + 1)})</small>
        </button>
        <button className="btn primary big" onClick={() => onDecide(false)}>
          스톱
        </button>
      </div>
      <p className="muted gostop-hint">고를 하면 더 큰 점수를 노리지만, 상대가 먼저 나면 고박이에요.</p>
    </div>
  )
}

/** 내 손패와 내기 버튼 (흔들기·폭탄·빈 차례) */
export function HandPanel({
  s,
  me,
  canPlay,
  selected,
  onHand,
  onPlay,
}: {
  s: GState
  me: GPlayer
  canPlay: boolean
  selected: number | null
  onHand: (id: number) => void
  onPlay: (a: PlayAction) => void
}) {
  return (
    <div className="gostop-hand card-panel">
      <div className="gostop-hand-head">
        <strong>
          내 손패 <span className="muted">{me.hand.length}장</span>
        </strong>
        {canPlay && <span className="gostop-legend">✨ 짝 = 바닥에 같은 달 있음</span>}
        <HwatuStyleButton />
      </div>
      <div className="gostop-hand-cards">
        {me.hand.map((id) => {
          const canMatch = matchesOnFloor(s, id).length > 0
          const bomb = canPlay && canBomb(s, id)
          const shake = canPlay && canShake(s, id)
          return (
            <HwatuCard
              key={id}
              card={id}
              width={64}
              selected={selected === id}
              match={canPlay && canMatch}
              marker={!canPlay ? undefined : bomb ? '💣폭탄' : shake ? '흔들' : canMatch ? '짝' : undefined}
              onClick={canPlay ? () => onHand(id) : undefined}
            />
          )
        })}
        {me.hand.length === 0 && <span className="muted">손패가 없어요</span>}
      </div>
      {canPlay && (selected != null || me.dummies > 0) && (
        <div className="gostop-actions">
          {selected != null && canBomb(s, selected) && (
            <button className="btn accent" onClick={() => onPlay({ type: 'card', card: selected, bomb: true })}>
              💣 폭탄 (3장 한꺼번에)
            </button>
          )}
          {selected != null && canShake(s, selected) && (
            <button className="btn accent" onClick={() => onPlay({ type: 'card', card: selected, shake: true })}>
              🫨 흔들고 내기 (×2)
            </button>
          )}
          {selected != null && (
            <button className="btn primary" onClick={() => onPlay({ type: 'card', card: selected })}>
              {canBomb(s, selected) || canShake(s, selected) ? '그냥 한 장 내기' : '이 카드 내기'}
            </button>
          )}
          {me.dummies > 0 && (
            <button className="btn ghost" onClick={() => onPlay({ type: 'dummy' })}>
              빈 차례 쓰기 (더미만 뒤집기 · {me.dummies}번 남음)
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** 판 정산 내역 (족보·배수·누가 얼마 내는지) */
export function RoundBreakdown({ r, mode, names }: { r: RoundResult; mode: Mode; names: string[] }) {
  const { add } = goBonus(r.goCount)
  if (r.kind === 'nagari') return <p>아무도 스톱하지 못하고 더미가 떨어졌어요. 다음 판 점수는 {r.nextMult}배!</p>
  return (
    <div className="gostop-break">
      {r.kind === 'chongtong' && <p className="gostop-break-note">같은 달 네 장을 들고 시작해 바로 이겼어요!</p>}
      {r.note && <p className="gostop-break-note">{r.note}</p>}
      <table>
        <tbody>
          {r.items.map((it) => (
            <tr key={it.key}>
              <th>{it.label}</th>
              <td>{it.points ? `${it.points}점` : ''}</td>
            </tr>
          ))}
          {r.goCount > 0 && (
            <tr>
              <th>{r.goCount}고 보너스</th>
              <td>+{add}점</td>
            </tr>
          )}
          <tr className="sum">
            <th>기본 점수</th>
            <td>{r.base}점</td>
          </tr>
          {r.multipliers.map((m) => (
            <tr key={m.label} className="mult">
              <th>{m.label}</th>
              <td>×{m.factor}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="gostop-pay">
        {r.payments.map((p) => (
          <li key={p.from}>
            <span>
              {names[p.from]}
              {p.reasons.map((x) => (
                <span key={x} className="gostop-badge hot">
                  {x} {x === '고박' && mode === 'gostop' ? '(독박)' : '×2'}
                </span>
              ))}
            </span>
            <strong>
              {p.points}점 → {won(-p.points * WON_PER_POINT)}
            </strong>
            {p.paysFor.length > 0 && <small className="muted">{p.paysFor.map((i) => names[i]).join(', ')} 몫까지 대신 내요</small>}
          </li>
        ))}
      </ul>
    </div>
  )
}
