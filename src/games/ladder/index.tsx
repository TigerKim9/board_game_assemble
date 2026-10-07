import { useEffect, useMemo, useRef, useState } from 'react'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import {
  MAX_PEOPLE,
  MIN_PEOPLE,
  fitList,
  makeLadder,
  mapping,
  presetResults,
  tracePath,
  type Ladder,
  type PathPoint,
  type Preset,
} from './logic'
import './ladder.css'

const COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)', 'var(--p6)', '#e84393', '#6c5ce7', '#00a884', '#b8860b']
const defaultName = (i: number) => `참가자 ${i + 1}`
const PRESETS: { id: Preset; label: string }[] = [
  { id: 'one-win', label: '당첨 1명' },
  { id: 'one-penalty', label: '벌칙 1명' },
  { id: 'order', label: '순서 정하기' },
  { id: 'half', label: '팀 나누기' },
]
const TRACE_MS = 1800

interface Game {
  names: string[]
  results: string[]
  ladder: Ladder
  hidden: boolean
}

export default function LadderGame() {
  const [game, setGame] = useState<Game | null>(null)
  if (!game) return <Setup onStart={setGame} />
  return (
    <Play
      key={game.ladder.map((r) => r.join()).join('|')}
      game={game}
      onReshuffle={() => setGame({ ...game, ladder: makeLadder(game.names.length) })}
      onSetup={() => setGame(null)}
    />
  )
}

function Setup({ onStart }: { onStart: (g: Game) => void }) {
  const [count, setCount] = useStored('ladder:count', 4)
  const [names, setNames] = useStored<string[]>('ladder:names', [])
  const [results, setResults] = useStored<string[]>('ladder:results', presetResults('one-win', 4))
  const [hidden, setHidden] = useStored('ladder:hidden', true)
  const n = Math.min(MAX_PEOPLE, Math.max(MIN_PEOPLE, count))
  const resList = fitList(results, n, () => '꽝')

  const changeCount = (next: number) => {
    setCount(next)
    setResults(fitList(results, next, () => '꽝'))
  }
  const edit = (list: string[], i: number, v: string) => {
    const next = list.slice()
    next[i] = v
    return next
  }

  return (
    <div className="setup card-panel ladder-setup">
      <div className="setup-row">
        <span>인원</span>
        <div className="stepper">
          <button className="btn small" disabled={n <= MIN_PEOPLE} onClick={() => changeCount(n - 1)}>
            −
          </button>
          <strong>{n}명</strong>
          <button className="btn small" disabled={n >= MAX_PEOPLE} onClick={() => changeCount(n + 1)}>
            +
          </button>
        </div>
      </div>
      <div className="ladder-presets">
        {PRESETS.map((p) => (
          <button key={p.id} className="btn small" onClick={() => setResults(presetResults(p.id, n))}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="ladder-table">
        <div className="ladder-table-head">
          <span>이름</span>
          <span>결과</span>
        </div>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="ladder-table-row">
            <span className="ladder-dot" style={{ background: COLORS[i] }} />
            <input
              className="seat-input"
              value={names[i] ?? ''}
              maxLength={8}
              placeholder={defaultName(i)}
              onChange={(e) => setNames(edit(fitList(names, n, () => ''), i, e.target.value))}
            />
            <input
              className="seat-input"
              value={resList[i]}
              maxLength={8}
              placeholder="꽝"
              onChange={(e) => setResults(edit(resList, i, e.target.value))}
            />
          </div>
        ))}
      </div>
      <label className="toggle">
        <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
        사다리 가리기 (결과 볼 때까지 가로줄 숨김)
      </label>
      <button
        className="btn primary big"
        onClick={() =>
          onStart({
            names: Array.from({ length: n }, (_, i) => names[i]?.trim() || defaultName(i)),
            results: resList.map((r) => r.trim() || '꽝'),
            ladder: makeLadder(n),
            hidden,
          })
        }
      >
        사다리 만들기
      </button>
    </div>
  )
}

function partial(points: PathPoint[], t: number): PathPoint[] {
  if (t >= 1) return points
  const seg = points.slice(1).map((p, i) => Math.abs(p.col - points[i].col) + Math.abs(p.level - points[i].level))
  const total = seg.reduce((a, b) => a + b, 0)
  let left = total * t
  const out: PathPoint[] = [points[0]]
  for (let i = 0; i < seg.length; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (left >= seg[i]) {
      out.push(b)
      left -= seg[i]
    } else {
      const f = seg[i] === 0 ? 1 : left / seg[i]
      out.push({ col: a.col + (b.col - a.col) * f, level: a.level + (b.level - a.level) * f })
      break
    }
  }
  return out
}

function Play({ game, onReshuffle, onSetup }: { game: Game; onReshuffle: () => void; onSetup: () => void }) {
  const { names, results, ladder, hidden } = game
  const n = names.length
  const rows = ladder.length
  const paths = useMemo(() => names.map((_, i) => tracePath(ladder, i)), [ladder, names])
  const ends = useMemo(() => mapping(ladder, n), [ladder, n])
  // progress per start column: undefined = not started, 0..1 animating, 1 = done
  const [progress, setProgress] = useState<Record<number, number>>({})
  const [showAll, setShowAll] = useState(false)
  const starts = useRef<Record<number, number>>({})
  const raf = useRef(0)

  const tick = () => {
    const now = performance.now()
    let running = false
    const next: Record<number, number> = {}
    for (const [k, s] of Object.entries(starts.current)) {
      const p = Math.min(1, (now - s) / TRACE_MS)
      next[+k] = p
      if (p < 1) running = true
    }
    setProgress(next)
    raf.current = running ? requestAnimationFrame(tick) : 0
  }

  const trace = (cols: number[]) => {
    const now = performance.now()
    let added = false
    for (const c of cols) {
      if (starts.current[c] == null) {
        starts.current[c] = now
        added = true
      }
    }
    if (added && !raf.current) raf.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const doneCount = Object.values(progress).filter((p) => p >= 1).length
  const allDone = doneCount === n
  const revealRungs = !hidden || showAll || allDone
  const endOwner = (end: number) => ends.indexOf(end)
  const x = (col: number) => (col + 0.5) * 100
  const y = (level: number) => (level * 1000) / (rows + 1)
  const W = n * 100

  return (
    <>
      <div className="ladder-board card-panel" style={{ ['--ladder-cols' as string]: n }}>
        <div className="ladder-names">
          {names.map((name, i) => (
            <button
              key={i}
              className={`ladder-name ${progress[i] != null ? 'used' : ''}`}
              style={{ ['--c' as string]: COLORS[i] }}
              onClick={() => trace([i])}
              disabled={progress[i] != null}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="ladder-canvas">
          <svg viewBox={`0 0 ${W} 1000`} preserveAspectRatio="none" aria-label="사다리">
            {names.map((_, i) => (
              <line key={i} x1={x(i)} x2={x(i)} y1={0} y2={1000} className="ladder-rail" vectorEffect="non-scaling-stroke" />
            ))}
            {revealRungs &&
              ladder.map((row, r) =>
                row.map((on, c) =>
                  on ? (
                    <line
                      key={`${r}-${c}`}
                      x1={x(c)}
                      x2={x(c + 1)}
                      y1={y(r + 1)}
                      y2={y(r + 1)}
                      className="ladder-rung"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null,
                ),
              )}
          </svg>
          {!revealRungs && <div className="ladder-cover">🙈 이름을 눌러 길을 따라가 보세요</div>}
          <svg viewBox={`0 0 ${W} 1000`} preserveAspectRatio="none" className="ladder-paths" aria-hidden>
            {Object.entries(progress).map(([k, p]) => {
              const pts = partial(paths[+k].points, p)
              return (
                <polyline
                  key={k}
                  points={pts.map((pt) => `${x(pt.col)},${y(pt.level)}`).join(' ')}
                  className="ladder-path"
                  style={{ stroke: COLORS[+k] }}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </svg>
          {Object.entries(progress).map(([k, p]) => {
            if (p >= 1) return null
            const pts = partial(paths[+k].points, p)
            const head = pts[pts.length - 1]
            return (
              <span
                key={k}
                className="ladder-runner"
                style={{
                  left: `${((head.col + 0.5) / n) * 100}%`,
                  top: `${(head.level / (rows + 1)) * 100}%`,
                  background: COLORS[+k],
                }}
              />
            )
          })}
        </div>
        <div className="ladder-results">
          {results.map((r, end) => {
            const owner = endOwner(end)
            const reached = progress[owner] != null && progress[owner] >= 1
            return (
              <div
                key={end}
                className={`ladder-result ${reached ? 'reached' : ''}`}
                style={reached ? { ['--c' as string]: COLORS[owner] } : undefined}
              >
                {r}
              </div>
            )
          })}
        </div>
      </div>

      {!allDone && (
        <p className="status ladder-hint">
          {doneCount === 0 ? '위의 이름을 눌러 보세요!' : `${doneCount}/${n}명 확인`}
        </p>
      )}

      {allDone ? (
        <Result title="🪜 사다리 결과" onAgain={onReshuffle} againLabel="새 사다리로 다시 하기">
          <ul className="ladder-summary">
            {names.map((name, i) => (
              <li key={i}>
                <span className="ladder-dot" style={{ background: COLORS[i] }} />
                <span className="ladder-summary-name">{name}</span>
                <span className="muted">→</span>
                <strong>{results[ends[i]]}</strong>
              </li>
            ))}
          </ul>
          <button className="btn ghost" onClick={onSetup}>
            이름·결과 바꾸기
          </button>
        </Result>
      ) : (
        <div className="btn-row">
          <button
            className="btn accent"
            onClick={() => {
              setShowAll(true)
              trace(names.map((_, i) => i))
            }}
          >
            전체 결과
          </button>
          <button className="btn" onClick={onReshuffle}>
            사다리 다시 그리기
          </button>
          <button className="btn ghost" onClick={onSetup}>
            설정으로
          </button>
        </div>
      )}
    </>
  )
}
