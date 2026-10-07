import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CardSlot,
  Celebration,
  PlayingCard,
  SolitaireBar,
  formatTime,
  isDragged,
  useCardDrag,
  useElementWidth,
  useStopwatch,
  useViewportHeight,
} from '../../cards'
import { Result } from '../../components/Result'
import { sleep } from '../../lib/random'
import { useBestScore, useStored } from '../../lib/storage'
import {
  autoSolve,
  autoTarget,
  drawStock,
  isWon,
  move,
  newGame,
  noHiddenCards,
  pickUp,
  type KState,
  type PileId,
} from './logic'
import './klondike.css'

export default function Klondike() {
  const [draw, setDraw] = useStored<1 | 3>('klondike:draw', 1)
  const [game, setGame] = useState<number | null>(null)
  const best1 = useBestScore('klondike-d1', true).best
  const best3 = useBestScore('klondike-d3', true).best

  if (game == null) {
    return (
      <div className="setup card-panel">
        <div className="setup-row">
          <span>카드 넘기기</span>
          <div className="segmented">
            <button className={draw === 1 ? 'active' : ''} onClick={() => setDraw(1)}>
              1장씩
            </button>
            <button className={draw === 3 ? 'active' : ''} onClick={() => setDraw(3)}>
              3장씩
            </button>
          </div>
        </div>
        <p className="muted klondike-note">
          {draw === 1 ? '1장씩: 편하게 즐기는 기본 모드예요.' : '3장씩: 맨 위 카드만 쓸 수 있어 더 어려워요.'}
          <br />
          최고 기록 — 1장씩 {best1 != null ? formatTime(best1) : '없음'} · 3장씩{' '}
          {best3 != null ? formatTime(best3) : '없음'}
        </p>
        <button className="btn primary big" onClick={() => setGame(1)}>
          게임 시작
        </button>
      </div>
    )
  }
  return <Board key={game} draw={draw} onNew={() => setGame(game + 1)} onExit={() => setGame(null)} />
}

interface Sel {
  pile: PileId
  index: number
}

function Board({ draw, onNew, onExit }: { draw: 1 | 3; onNew: () => void; onExit: () => void }) {
  const [hist, setHist] = useState<KState[]>(() => [newGame(draw)])
  const s = hist[hist.length - 1]
  const [sel, setSel] = useState<Sel | null>(null)
  const [busy, setBusy] = useState(false)
  const won = isWon(s)
  const seconds = useStopwatch(s.moves > 0 && !won, 0)
  const { best, submit } = useBestScore(`klondike-d${draw}`, true)
  const [newRecord, setNewRecord] = useState(false)
  const alive = useRef(true)
  const lastMoveAt = useRef(0)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (won) setNewRecord(submit(seconds))
  }, [won]) // eslint-disable-line react-hooks/exhaustive-deps

  const push = (n: KState) => {
    lastMoveAt.current = performance.now()
    setHist((h) => [...h, n])
  }

  const solution = useMemo(() => (!won && noHiddenCards(s) ? autoSolve(s) : null), [s, won])

  const runAuto = async () => {
    if (!solution || busy) return
    setBusy(true)
    setSel(null)
    for (const st of solution) {
      await sleep(70)
      if (!alive.current) return
      setHist((h) => [...h, st])
    }
    setBusy(false)
  }

  const onTap = (pile: PileId, index: number) => {
    if (busy || won) return
    if (pile === 'stock') {
      setSel(null)
      const n = drawStock(s)
      if (n) push(n)
      return
    }
    if (sel) {
      if (sel.pile !== pile) {
        const n = move(s, sel.pile, sel.index, pile)
        if (n) {
          push(n)
          setSel(null)
          return
        }
      } else if (sel.index === index) {
        setSel(null)
        return
      }
    }
    setSel(index >= 0 && pickUp(s, pile, index) ? { pile, index } : null)
  }

  const onDoubleTap = (pile: PileId, index: number) => {
    if (pile === 'stock') return onTap(pile, index)
    if (busy || won || performance.now() - lastMoveAt.current < 400) return
    const t = autoTarget(s, pile, index)
    const n = t && move(s, pile, index, t)
    if (n) push(n)
    setSel(null)
  }

  const { drag, bind } = useCardDrag({
    disabled: busy || won,
    canDrag: (pile, index) => pile !== 'stock' && !!pickUp(s, pile, index),
    onTap,
    onDoubleTap,
    onDrop: (pile, index, target) => {
      const n = move(s, pile, index, target)
      if (n) push(n)
      setSel(null)
    },
  })

  const undo = () => {
    if (hist.length < 2 || busy) return
    setHist((h) => h.slice(0, -1))
    setSel(null)
  }

  // ---------- layout ----------
  const wrapRef = useRef<HTMLDivElement>(null)
  const W = useElementWidth(wrapRef)
  const vh = useViewportHeight()
  const gap = W < 420 ? 4 : 8
  const cw = Math.min(92, Math.floor((W - gap * 6) / 7))
  const ch = Math.round(cw * 1.4)
  const x = (i: number) => i * (cw + gap)
  const avail = Math.max(ch * 3, vh - 250 - ch)
  const offsets = s.tab.map((c) => {
    let dOff = ch * 0.13
    let uOff = ch * 0.28
    const need = c.down.length * dOff + Math.max(0, c.up.length - 1) * uOff
    if (need > avail - ch) {
      const k = (avail - ch) / need
      dOff = Math.max(ch * 0.06, dOff * k)
      uOff = Math.max(ch * 0.22, uOff * k)
    }
    return { dOff, uOff }
  })
  const colTop = (ci: number, i: number) => {
    const c = s.tab[ci]
    const { dOff, uOff } = offsets[ci]
    return i < c.down.length ? i * dOff : c.down.length * dOff + (i - c.down.length) * uOff
  }
  const tabHeight = Math.max(
    ch * 2,
    ...s.tab.map((c, ci) => (c.down.length + c.up.length ? colTop(ci, c.down.length + c.up.length - 1) + ch : ch)),
  )

  const cardProps = (pile: PileId, index: number) => {
    const dragged = isDragged(drag, pile, index)
    const selected = !!sel && sel.pile === pile && index >= sel.index
    return {
      ...bind(pile, index),
      width: cw,
      selected,
      className: dragged ? 'klondike-dragged' : undefined,
      style: dragged ? { transform: `translate(${drag!.dx}px, ${drag!.dy}px)` } : undefined,
    }
  }

  const wasteShown = s.waste.slice(-(draw === 3 ? 3 : 2))
  const fanStep = draw === 3 ? cw * 0.3 : 0

  if (won) {
    return (
      <>
        <Celebration />
        <Result title="🎉 모두 정리했어요!" onAgain={onNew} againLabel="새 게임">
          <p>
            시간 <strong>{formatTime(seconds)}</strong> · 이동 <strong>{s.moves}</strong>번
          </p>
          <p>{newRecord ? '🏆 새로운 최고 기록!' : best != null ? `최고 기록: ${formatTime(best)}` : ''}</p>
          <button className="btn ghost" onClick={onExit}>
            설정으로
          </button>
        </Result>
      </>
    )
  }

  return (
    <div className="klondike">
      <SolitaireBar
        seconds={seconds}
        moves={s.moves}
        best={best}
        canUndo={hist.length > 1 && !busy}
        onUndo={undo}
        onNew={onNew}
      />
      <div className={`klondike-board felt ${drag ? 'klondike-dragging' : ''}`}>
        <div ref={wrapRef} className="klondike-measure" />
        <div className="klondike-inner" style={{ width: x(7) - gap }}>
          {/* top row */}
          <div className="klondike-top" style={{ height: ch }}>
            <div className="klondike-pos" style={{ left: x(0), width: cw, height: ch }}>
              {s.stock.length ? (
                <div className="klondike-stock">
                  <PlayingCard faceDown width={cw} {...bind('stock', 0)} />
                  <span className="klondike-count">{s.stock.length}</span>
                </div>
              ) : (
                <CardSlot
                  width={cw}
                  label={s.waste.length ? '↻' : ''}
                  className="klondike-recycle"
                  onClick={() => onTap('stock', 0)}
                />
              )}
            </div>
            {s.waste.length === 0 && (
              <div className="klondike-pos" style={{ left: x(1), width: cw, height: ch }}>
                <CardSlot width={cw} />
              </div>
            )}
            {wasteShown.map((c, i) => {
              const idx = s.waste.length - wasteShown.length + i
              const isTop = idx === s.waste.length - 1
              const fanIndex = draw === 3 ? i : 0
              return (
                <div
                  key={c.id}
                  className="klondike-pos"
                  style={{
                    left: x(1) + fanIndex * fanStep,
                    width: cw,
                    height: ch,
                    zIndex: i + 1,
                  }}
                >
                  <PlayingCard card={c} {...(isTop ? cardProps('waste', idx) : { width: cw })} />
                </div>
              )
            })}
            {s.found.map((f, fi) => (
              <div
                key={fi}
                className="klondike-pos"
                style={{ left: x(3 + fi), width: cw, height: ch }}
                data-drop={`f${fi}`}
              >
                {f.length === 0 ? (
                  <CardSlot width={cw} label="A" onClick={() => onTap(`f${fi}`, -1)} />
                ) : (
                  f.slice(-2).map((c, k) => {
                    const idx = f.length - Math.min(2, f.length) + k
                    return (
                      <div key={c.id} className="klondike-abs">
                        <PlayingCard card={c} {...(idx === f.length - 1 ? cardProps(`f${fi}`, idx) : { width: cw })} />
                      </div>
                    )
                  })
                )}
              </div>
            ))}
          </div>
          {/* tableau */}
          <div className="klondike-tab" style={{ height: tabHeight }}>
            {s.tab.map((c, ci) => {
              const all = [...c.down, ...c.up]
              const pile = `t${ci}`
              return (
                <div
                  key={ci}
                  className="klondike-col"
                  style={{ left: x(ci), width: cw, height: tabHeight }}
                  data-drop={pile}
                >
                  {all.length === 0 && <CardSlot width={cw} label="K" onClick={() => onTap(pile, -1)} />}
                  {all.map((card, i) => (
                    <div key={card.id} className="klondike-abs" style={{ top: colTop(ci, i), zIndex: i }}>
                      <PlayingCard card={card} faceDown={i < c.down.length} {...cardProps(pile, i)} />
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="btn-row klondike-actions">
        {solution && (
          <button className="btn accent" onClick={runAuto} disabled={busy}>
            ✨ 자동 완성
          </button>
        )}
        <span className="muted klondike-tip">
          카드를 눌러 고른 뒤 옮길 곳을 누르거나 끌어다 놓으세요. 두 번 누르면 자동 이동!
        </span>
      </div>
    </div>
  )
}
