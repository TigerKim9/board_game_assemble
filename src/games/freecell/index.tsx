import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CardSlot,
  Celebration,
  PlayingCard,
  SolitaireBar,
  SUITS,
  formatTime,
  isDragged,
  useCardDrag,
  useElementWidth,
  useStopwatch,
  useViewportHeight,
} from '../../cards'
import { Result } from '../../components/Result'
import { sleep } from '../../lib/random'
import { useBestScore } from '../../lib/storage'
import {
  MAX_DEAL,
  autoSolve,
  autoTarget,
  hasAnyMove,
  isWon,
  maxMovable,
  move,
  newGame,
  pickUp,
  randomDeal,
  type FState,
  type PileId,
} from './logic'
import './freecell.css'

export default function FreeCell() {
  const [game, setGame] = useState<{ deal: number; key: number } | null>(null)
  const [input, setInput] = useState('')
  const { best } = useBestScore('freecell', true)

  if (!game) {
    const n = Math.floor(Number(input))
    const valid = n >= 1 && n <= MAX_DEAL
    return (
      <div className="setup card-panel">
        <p className="muted freecell-note">
          모든 딜에는 번호가 있어요. 친구와 같은 번호로 누가 더 빨리 푸는지 겨뤄 보세요!
          {best != null && (
            <>
              <br />
              최고 기록: <strong>{formatTime(best)}</strong>
            </>
          )}
        </p>
        <div className="setup-row">
          <span>딜 번호</span>
          <input
            className="seat-input freecell-input"
            inputMode="numeric"
            placeholder="비우면 무작위"
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </div>
        <button className="btn primary big" onClick={() => setGame({ deal: valid ? n : randomDeal(), key: 1 })}>
          {valid ? `#${n} 딜 시작` : '무작위 딜 시작'}
        </button>
      </div>
    )
  }
  return (
    <Board
      key={game.key}
      deal={game.deal}
      onNew={() => setGame({ deal: randomDeal(), key: game.key + 1 })}
      onRestart={() => setGame({ deal: game.deal, key: game.key + 1 })}
      onExit={() => setGame(null)}
    />
  )
}

interface Sel {
  pile: PileId
  index: number
}

function Board({
  deal,
  onNew,
  onRestart,
  onExit,
}: {
  deal: number
  onNew: () => void
  onRestart: () => void
  onExit: () => void
}) {
  const [hist, setHist] = useState<FState[]>(() => [newGame(deal)])
  const s = hist[hist.length - 1]
  const [sel, setSel] = useState<Sel | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const won = isWon(s)
  const seconds = useStopwatch(s.moves > 0 && !won, 0)
  const { best, submit } = useBestScore('freecell', true)
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

  const push = (n: FState) => {
    lastMoveAt.current = performance.now()
    setNotice('')
    setHist((h) => [...h, n])
  }

  const tryMove = (pile: PileId, index: number, target: PileId) => {
    const n = move(s, pile, index, target)
    if (n) {
      push(n)
      return true
    }
    const cards = pickUp(s, pile, index)
    if (cards && cards.length > 1 && target[0] === 't' && cards.length > maxMovable(s, target)) {
      setNotice(`지금은 한 번에 ${maxMovable(s, target)}장까지만 옮길 수 있어요 (빈 칸·빈 줄이 더 필요해요).`)
    }
    return false
  }

  const solution = useMemo(() => (won ? null : autoSolve(s)), [s, won])
  const stuck = useMemo(() => !won && !hasAnyMove(s), [s, won])

  const runAuto = async () => {
    if (!solution || busy) return
    setBusy(true)
    setSel(null)
    for (const st of solution) {
      await sleep(60)
      if (!alive.current) return
      setHist((h) => [...h, st])
    }
    setBusy(false)
  }

  const onTap = (pile: PileId, index: number) => {
    if (busy || won) return
    if (sel) {
      if (sel.pile !== pile) {
        if (tryMove(sel.pile, sel.index, pile)) {
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
    if (busy || won || performance.now() - lastMoveAt.current < 400) return
    const t = autoTarget(s, pile, index)
    if (t) tryMove(pile, index, t)
    setSel(null)
  }

  const { drag, bind } = useCardDrag({
    disabled: busy || won,
    canDrag: (pile, index) => !!pickUp(s, pile, index),
    onTap,
    onDoubleTap,
    onDrop: (pile, index, target) => {
      tryMove(pile, index, target)
      setSel(null)
    },
  })

  const undo = () => {
    if (hist.length < 2 || busy) return
    setHist((h) => h.slice(0, -1))
    setSel(null)
    setNotice('')
  }

  // ---------- layout ----------
  const wrapRef = useRef<HTMLDivElement>(null)
  const W = useElementWidth(wrapRef)
  const vh = useViewportHeight()
  const gap = W < 420 ? 3 : 8
  const cw = Math.min(88, Math.floor((W - gap * 7) / 8))
  const ch = Math.round(cw * 1.4)
  const x = (i: number) => i * (cw + gap)
  const avail = Math.max(ch * 3, vh - 260 - ch)
  const offs = s.cols.map((c) => {
    const want = ch * 0.3
    return c.length > 1 && (c.length - 1) * want > avail - ch ? Math.max(ch * 0.2, (avail - ch) / (c.length - 1)) : want
  })
  const tabHeight = Math.max(ch * 2.5, ...s.cols.map((c, i) => (c.length ? (c.length - 1) * offs[i] + ch : ch)))

  const cardProps = (pile: PileId, index: number) => {
    const dragged = isDragged(drag, pile, index)
    return {
      ...bind(pile, index),
      width: cw,
      selected: !!sel && sel.pile === pile && index >= sel.index,
      className: dragged ? 'freecell-dragged' : undefined,
      style: dragged ? { transform: `translate(${drag!.dx}px, ${drag!.dy}px)` } : undefined,
    }
  }

  if (won) {
    return (
      <>
        <Celebration />
        <Result title={`🎉 딜 #${deal} 성공!`} onAgain={onNew} againLabel="새 딜">
          <p>
            시간 <strong>{formatTime(seconds)}</strong> · 이동 <strong>{s.moves}</strong>번
          </p>
          <p>{newRecord ? '🏆 새로운 최고 기록!' : best != null ? `최고 기록: ${formatTime(best)}` : ''}</p>
          <button className="btn ghost" onClick={onExit}>
            딜 번호 고르기
          </button>
        </Result>
      </>
    )
  }

  const free = s.cells.filter((c) => !c).length
  const empty = s.cols.filter((c) => !c.length).length

  return (
    <div className="freecell">
      <SolitaireBar
        seconds={seconds}
        moves={s.moves}
        best={best}
        canUndo={hist.length > 1 && !busy}
        onUndo={undo}
        onNew={onNew}
      />
      <div className="freecell-info">
        <span>
          딜 <strong>#{deal}</strong>
        </span>
        <span>
          한 번에 최대 <strong>{maxMovable(s, null)}</strong>장 이동 (빈 칸 {free} · 빈 줄 {empty})
        </span>
      </div>
      <div className={`freecell-board felt ${drag ? 'freecell-dragging' : ''}`}>
        <div ref={wrapRef} className="freecell-measure" />
        <div className="freecell-inner" style={{ width: x(8) - gap }}>
          <div className="freecell-top" style={{ height: ch }}>
            {s.cells.map((c, i) => (
              <div
                key={`c${i}`}
                className="freecell-pos"
                style={{ left: x(i), width: cw, height: ch }}
                data-drop={`c${i}`}
              >
                {c ? (
                  <PlayingCard card={c} {...cardProps(`c${i}`, 0)} />
                ) : (
                  <CardSlot width={cw} className="freecell-cell" onClick={() => onTap(`c${i}`, -1)} />
                )}
              </div>
            ))}
            {s.found.map((f, i) => (
              <div
                key={`f${i}`}
                className="freecell-pos"
                style={{ left: x(4 + i), width: cw, height: ch }}
                data-drop={`f${i}`}
              >
                {f.length === 0 ? (
                  <CardSlot width={cw} suit={SUITS[i]} onClick={() => onTap(`f${i}`, -1)} />
                ) : (
                  f.slice(-2).map((c, k) => {
                    const idx = f.length - Math.min(2, f.length) + k
                    return (
                      <div key={c.id} className="freecell-abs">
                        <PlayingCard card={c} {...(idx === f.length - 1 ? cardProps(`f${i}`, idx) : { width: cw })} />
                      </div>
                    )
                  })
                )}
              </div>
            ))}
          </div>
          <div className="freecell-tab" style={{ height: tabHeight }}>
            {s.cols.map((col, ci) => {
              const pile = `t${ci}`
              return (
                <div
                  key={ci}
                  className="freecell-col"
                  style={{ left: x(ci), width: cw, height: tabHeight }}
                  data-drop={pile}
                >
                  {col.length === 0 && <CardSlot width={cw} onClick={() => onTap(pile, -1)} />}
                  {col.map((card, i) => (
                    <div key={card.id} className="freecell-abs" style={{ top: i * offs[ci], zIndex: i }}>
                      <PlayingCard card={card} {...cardProps(pile, i)} />
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {notice && <p className="freecell-notice">{notice}</p>}
      {stuck && (
        <p className="freecell-notice">더 이상 둘 수 있는 수가 없어요. 되돌리기를 써 보거나 처음부터 다시 해 보세요.</p>
      )}
      <div className="btn-row freecell-actions">
        {solution && (
          <button className="btn accent" onClick={runAuto} disabled={busy}>
            ✨ 자동 완성
          </button>
        )}
        <button className="btn small ghost" onClick={onRestart}>
          🔁 이 딜 처음부터
        </button>
      </div>
      <p className="muted freecell-tip">
        카드를 눌러 고른 뒤 옮길 곳을 누르거나 끌어다 놓으세요. 두 번 누르면 자동 이동!
      </p>
    </div>
  )
}
