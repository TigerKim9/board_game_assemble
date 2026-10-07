/**
 * 민화투 화면 조각 (표시 전용). 로컬 게임과 온라인 화면이 함께 써요.
 */
import { useState } from 'react'
import { CaptureRows, FloorGroups, HwatuCard, HwatuPile, HwatuStyleButton, ProgressChips, getCard, groupByKind, type Progress } from '../../hwatu'
import { YAKS, matchesOnFloor, scoreOf, type MState } from './logic'
import './minhwatu.css'

/** 가운데 판: 더미·뒤집은 카드·메시지와 바닥 */
export function MinhwatuTable({
  s,
  deckCount,
  message,
  highlight,
  clickable,
  onPick,
}: {
  s: Pick<MState, 'phase' | 'flipped' | 'played' | 'floor'>
  deckCount: number
  message: string
  highlight: number[]
  clickable: number[]
  onPick: (id: number) => void
}) {
  const { phase } = s
  const pending = phase.kind === 'chooseHand' || phase.kind === 'chooseFlip' ? phase.card : null
  return (
    <div className="minhwatu-table felt">
      <div className="minhwatu-center">
        <HwatuPile count={deckCount} width={40} />
        <div className="minhwatu-flip">
          {pending != null && <HwatuCard card={pending} width={44} className="hw-deal" />}
          {pending == null && s.flipped != null && phase.kind === 'play' && (
            <HwatuCard key={s.flipped} card={s.flipped} width={44} className="hw-flip minhwatu-last" title="방금 뒤집은 카드" />
          )}
        </div>
        <div className="minhwatu-msg">{message || '같은 달 카드를 맞춰 가져오세요'}</div>
      </div>
      <FloorGroups
        floor={s.floor}
        width={44}
        highlight={highlight}
        clickable={clickable}
        fresh={new Set([s.played, s.flipped].filter((x): x is number => x != null))}
        onPick={onPick}
      />
    </div>
  )
}

/** 내 손패 */
export function HandCards({
  title,
  hand,
  floor,
  live,
  selected,
  onHand,
}: {
  title: string
  hand: number[]
  floor: number[]
  live: boolean
  selected: number | null
  onHand: (id: number) => void
}) {
  return (
    <div className="minhwatu-hand card-panel">
      <div className="minhwatu-hand-head">
        <strong>
          {title} <span className="muted">{hand.length}장</span>
        </strong>
        <HwatuStyleButton />
      </div>
      <div className="minhwatu-hand-cards">
        {hand.map((id) => {
          const canMatch = matchesOnFloor(floor, id).length > 0
          return (
            <HwatuCard
              key={id}
              card={id}
              width={64}
              selected={selected === id}
              match={live && canMatch}
              marker={live && canMatch ? '짝' : undefined}
              onClick={live ? () => onHand(id) : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}

function yakProgress(captured: number[], all: boolean): Progress[] {
  const set = new Set(captured)
  const kindOf = (key: string): Progress['kind'] => (key === 'hong' || key === 'cheong' || key === 'cho' ? key : key === 'pung' ? 'gwang' : 'tti')
  return YAKS.map((y) => ({ key: y.key, label: y.name, have: y.ids.filter((id) => set.has(id)).length, need: y.ids.length, kind: kindOf(y.key) })).filter(
    (p) => p.have > 0 || (all && (p.key === 'hong' || p.key === 'cheong' || p.key === 'cho')),
  )
}

export function OpponentRow({ name, isAI, hand, captured, active }: { name: string; isAI: boolean; hand: number; captured: number[]; active: boolean }) {
  const sc = scoreOf(captured)
  const [open, setOpen] = useState(false)
  return (
    <div className={`minhwatu-opp ${active ? 'active' : ''}`}>
      <button className="minhwatu-opp-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="minhwatu-opp-name">
          {isAI ? '🤖 ' : ''}
          {name}
        </span>
        <span className="minhwatu-opp-hand">
          <HwatuCard faceDown width={14} /> {hand}
        </span>
        <span className="minhwatu-opp-score">
          {sc.total}점{sc.yaks.length > 0 && <small> ({sc.yaks.map((y) => y.name).join('·')})</small>}
        </span>
        <span className="minhwatu-opp-toggle">{open ? '▲' : '▼'}</span>
      </button>
      <div className="minhwatu-opp-body">
        <KindCounts captured={captured} />
        <ProgressChips items={yakProgress(captured, false)} />
        {open && <CapturedRows captured={captured} width={26} hideEmpty />}
      </div>
    </div>
  )
}

function KindCounts({ captured }: { captured: number[] }) {
  const g = groupByKind(captured.map(getCard))
  return (
    <div className="minhwatu-counts">
      {(['gwang', 'yeol', 'tti', 'pi'] as const).map((k) => (
        <span key={k} className={`minhwatu-count k-${k}`}>
          {{ gwang: '광', yeol: '열끗', tti: '띠', pi: '피' }[k]} <b>{g[k].length}</b>
        </span>
      ))}
    </div>
  )
}

export function Captured({ name, captured }: { name: string; captured: number[] }) {
  const sc = scoreOf(captured)
  return (
    <div className="minhwatu-captured card-panel">
      <div className="minhwatu-hand-head">
        <strong>{name}</strong>
        <span>
          <strong className="minhwatu-score">{sc.total}점</strong>
          {sc.yaks.length > 0 && <span className="minhwatu-yaks"> {sc.yaks.map((y) => `${y.name}+${y.bonus}`).join(' ')}</span>}
        </span>
      </div>
      <ProgressChips items={yakProgress(captured, true)} className="minhwatu-progress" />
      <CapturedRows captured={captured} width={30} />
      <p className="muted minhwatu-pts">광 20 · 열끗 10 · 띠 5점 · 피 0점</p>
    </div>
  )
}

function CapturedRows({ captured, width, hideEmpty }: { captured: number[]; width: number; hideEmpty?: boolean }) {
  const sorted = captured.slice().sort((a, b) => a - b)
  const g = { gwang: [] as number[], yeol: [] as number[], tti: [] as number[], pi: [] as number[] }
  for (const id of sorted) g[getCard(id).kind].push(id)
  return <CaptureRows groups={g} width={width} hideEmpty={hideEmpty} />
}

