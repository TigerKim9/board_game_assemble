import { useEffect, useMemo, useRef, useState } from 'react'
import { useStored } from '../../lib/storage'
import {
  MAX_ITEMS,
  MIN_ITEMS,
  PRESETS,
  cleanItems,
  indexAtRotation,
  pickIndex,
  segmentColors,
  shortLabel,
  spinTo,
} from './logic'
import './roulette.css'

const SPIN_MS = 4800
const R = 96

function polar(angle: number, r: number) {
  const rad = (angle * Math.PI) / 180
  return [r * Math.sin(rad), -r * Math.cos(rad)]
}

function segmentPath(i: number, n: number) {
  const a = 360 / n
  const [x1, y1] = polar(i * a, R)
  const [x2, y2] = polar((i + 1) * a, R)
  const large = a > 180 ? 1 : 0
  return `M0 0 L${x1.toFixed(3)} ${y1.toFixed(3)} A${R} ${R} 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`
}

export default function Roulette() {
  const [stored, setStored] = useStored<string[]>('roulette:items', PRESETS[0].items)
  const [removeWinner, setRemoveWinner] = useStored('roulette:remove', false)
  const [editing, setEditing] = useState(false)
  const [removed, setRemoved] = useState<number[]>([])
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<{ label: string; color: string } | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const all = cleanItems(stored)
  const active = useMemo(() => all.map((label, i) => ({ label, i })).filter(({ i }) => !removed.includes(i)), [all, removed])
  const n = active.length
  const colors = segmentColors(n)

  const spin = () => {
    if (spinning || n < 1) return
    const target = pickIndex(n)
    const next = spinTo(rotation, target, n)
    setResult(null)
    setSpinning(true)
    setRotation(next)
    timer.current = window.setTimeout(() => {
      const idx = indexAtRotation(next, n)
      const item = active[idx]
      setSpinning(false)
      setResult({ label: item.label, color: colors[idx] })
      setHistory((h) => [item.label, ...h].slice(0, 12))
      if (removeWinner && n > 1) setRemoved((r) => [...r, item.i])
    }, SPIN_MS)
  }

  const setItems = (items: string[]) => {
    setStored(items)
    setRemoved([])
    setResult(null)
  }

  return (
    <>
      <div className="roulette-stage card-panel">
        <div className="roulette-wheel-wrap">
          <svg className="roulette-wheel" viewBox="-110 -110 220 220" aria-label="룰렛 돌림판">
            <circle r="106" className="roulette-rim" />
            <g
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.6, 0.12, 1)` : 'none',
              }}
            >
              {n === 1 ? (
                <circle r={R} fill={colors[0]} />
              ) : (
                active.map((item, k) => <path key={item.i} d={segmentPath(k, n)} fill={colors[k]} className="roulette-seg" />)
              )}
              {active.map((item, k) => {
                const mid = (k + 0.5) * (360 / n)
                return (
                  <g key={item.i} transform={`rotate(${mid})`}>
                    <text
                      x={0}
                      y={-R * 0.6}
                      transform={`rotate(${mid > 180 ? 90 : -90} 0 ${-R * 0.6})`}
                      className="roulette-label"
                      fontSize={n > 8 ? 9.5 : 11}
                    >
                      {shortLabel(item.label, n)}
                    </text>
                  </g>
                )
              })}
              {Array.from({ length: 24 }, (_, i) => {
                const [x, y] = polar(i * 15, 101)
                return <circle key={i} cx={x} cy={y} r="1.8" className="roulette-bulb" />
              })}
            </g>
            <polygon points="0,-92 -10,-112 10,-112" className={`roulette-pointer ${spinning ? 'ticking' : ''}`} />
          </svg>
          <button className="roulette-hub" onClick={spin} disabled={spinning || n < 1}>
            {spinning ? '…' : '돌려!'}
          </button>
        </div>
        <div className="roulette-result" aria-live="polite">
          {result ? (
            <div className="roulette-result-card" style={{ ['--c' as string]: result.color }}>
              🎉 <strong>{result.label}</strong>
            </div>
          ) : (
            <span className="muted">{spinning ? '두근두근…' : '가운데 버튼을 눌러 돌려 보세요'}</span>
          )}
        </div>
        <button className="btn accent big roulette-spin" onClick={spin} disabled={spinning || n < 1}>
          {spinning ? '돌아가는 중…' : '룰렛 돌리기'}
        </button>
        {removed.length > 0 && (
          <p className="roulette-note">
            남은 항목 {n}개 ·{' '}
            <button className="btn small ghost" onClick={() => setRemoved([])} disabled={spinning}>
              모두 되돌리기
            </button>
          </p>
        )}
      </div>

      {history.length > 0 && (
        <div className="roulette-history">
          <span className="muted">기록</span>
          {history.map((h, i) => (
            <span key={i} className={`tag ${i === 0 ? 'latest' : ''}`}>
              {h}
            </span>
          ))}
        </div>
      )}

      <div className="card-panel roulette-editor">
        <div className="roulette-editor-head">
          <h3>항목 ({all.length}/{MAX_ITEMS})</h3>
          <button className="btn small" onClick={() => setEditing((e) => !e)} disabled={spinning}>
            {editing ? '완료' : '편집'}
          </button>
        </div>
        <div className="roulette-presets">
          {PRESETS.map((p) => (
            <button key={p.name} className="btn small" disabled={spinning} onClick={() => setItems(p.items)}>
              {p.emoji} {p.name}
            </button>
          ))}
        </div>
        {editing ? (
          <ul className="roulette-items">
            {stored.map((item, i) => (
              <li key={i}>
                <span className="roulette-swatch" style={{ background: segmentColors(stored.length)[i] }} />
                <input
                  className="seat-input"
                  value={item}
                  maxLength={14}
                  placeholder={`항목 ${i + 1}`}
                  onChange={(e) => setItems(stored.map((s, j) => (j === i ? e.target.value : s)))}
                />
                <button
                  className="btn small ghost"
                  aria-label="항목 삭제"
                  disabled={stored.length <= MIN_ITEMS}
                  onClick={() => setItems(stored.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
            {stored.length < MAX_ITEMS && (
              <li>
                <button className="btn small roulette-add" onClick={() => setItems([...stored, ''])}>
                  ＋ 항목 추가
                </button>
              </li>
            )}
          </ul>
        ) : (
          <p className="roulette-item-preview">{all.join(' · ')}</p>
        )}
        <label className="toggle roulette-toggle">
          <input type="checkbox" checked={removeWinner} onChange={(e) => setRemoveWinner(e.target.checked)} />
          뽑힌 항목은 다음 판에서 빼기
        </label>
      </div>
    </>
  )
}
