import { useEffect, useRef, useState } from 'react'
import {
  CardSlot,
  cardLabel,
  Celebration,
  PlayingCard,
  SolitaireBar,
  formatTime,
  isDragged,
  makeCard,
  useCardDrag,
  useElementWidth,
  useStopwatch,
  useViewportHeight,
} from '../../cards'
import { Result } from '../../components/Result'
import { useBestScore, useStored } from '../../lib/storage'
import {
  autoTarget,
  dealBlocked,
  dealRow,
  findHint,
  isWon,
  move,
  newGame,
  pickUp,
  stateKey,
  type Hint,
  type PileId,
  type SState,
  type SuitCount,
} from './logic'
import './spider.css'

const LEVELS: { n: SuitCount; label: string; desc: string }[] = [
  {
    n: 1,
    label: '1무늬 (쉬움)',
    desc: '스페이드만 사용해요. 처음이라면 여기서 시작!',
  },
  { n: 2, label: '2무늬 (보통)', desc: '스페이드와 하트를 사용해요.' },
  {
    n: 4,
    label: '4무늬 (어려움)',
    desc: '네 무늬 모두 사용하는 진짜 도전이에요.',
  },
]

export default function Spider() {
  const [suits, setSuits] = useStored<SuitCount>('spider:suits', 1)
  const [game, setGame] = useState<number | null>(null)
  const b1 = useBestScore('spider-1', true).best
  const b2 = useBestScore('spider-2', true).best
  const b4 = useBestScore('spider-4', true).best
  const bests: Record<SuitCount, number | null> = { 1: b1, 2: b2, 4: b4 }

  if (game == null) {
    return (
      <div className="setup card-panel">
        <div className="setup-row">
          <span>난이도</span>
          <div className="segmented">
            {LEVELS.map((l) => (
              <button key={l.n} className={suits === l.n ? 'active' : ''} onClick={() => setSuits(l.n)}>
                {l.n}무늬
              </button>
            ))}
          </div>
        </div>
        <p className="muted spider-note">
          {LEVELS.find((l) => l.n === suits)!.desc}
          <br />
          최고 기록: {bests[suits] != null ? formatTime(bests[suits]!) : '없음'}
        </p>
        <button className="btn primary big" onClick={() => setGame(1)}>
          게임 시작
        </button>
      </div>
    )
  }
  return <Board key={game} suits={suits} onNew={() => setGame(game + 1)} onExit={() => setGame(null)} />
}

interface Sel {
  pile: PileId
  index: number
}

function Board({ suits, onNew, onExit }: { suits: SuitCount; onNew: () => void; onExit: () => void }) {
  const [hist, setHist] = useState<SState[]>(() => [newGame(suits)])
  const s = hist[hist.length - 1]
  const [sel, setSel] = useState<Sel | null>(null)
  const [hint, setHint] = useState<Hint | null>(null)
  const [notice, setNotice] = useState('')
  const won = isWon(s)
  const seconds = useStopwatch(s.moves > 0 && !won, 0)
  const { best, submit } = useBestScore(`spider-${suits}`, true)
  const [newRecord, setNewRecord] = useState(false)
  const lastMoveAt = useRef(0)

  useEffect(() => {
    if (won) setNewRecord(submit(seconds))
  }, [won]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), 2500)
    return () => clearTimeout(t)
  }, [hint])

  const push = (n: SState) => {
    lastMoveAt.current = performance.now()
    setNotice('')
    setHint(null)
    setHist((h) => [...h, n])
  }

  const deal = () => {
    setSel(null)
    const block = dealBlocked(s)
    if (block === 'empty') {
      setNotice('빈 줄이 있으면 카드를 나눌 수 없어요. 먼저 빈 줄을 채워 주세요.')
      return
    }
    const n = dealRow(s)
    if (n) push(n)
  }

  const onTap = (pile: PileId, index: number) => {
    if (won) return
    if (pile === 'stock') return deal()
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
    if (pile === 'stock') return deal()
    if (won || performance.now() - lastMoveAt.current < 400) return
    const t = autoTarget(s, pile, index)
    const n = t && move(s, pile, index, t)
    if (n) push(n)
    setSel(null)
  }

  const { drag, bind } = useCardDrag({
    disabled: won,
    canDrag: (pile, index) => !!pickUp(s, pile, index),
    onTap,
    onDoubleTap,
    onDrop: (pile, index, target) => {
      const n = move(s, pile, index, target)
      if (n) push(n)
      setSel(null)
    },
  })

  const undo = () => {
    if (hist.length < 2) return
    setHist((h) => h.slice(0, -1))
    setSel(null)
    setNotice('')
  }

  const showHint = () => {
    setSel(null)
    const h = findHint(s, new Set(hist.map(stateKey)))
    if (h) {
      setHint(h)
      const card = pickUp(s, h.pile, h.index)![0]
      const t = s.cols[+h.target.slice(1)].up.at(-1)
      setNotice(
        `💡 ${cardLabel(card)}${pickUp(s, h.pile, h.index)!.length > 1 ? ' 묶음' : ''}을 ${t ? `${cardLabel(t)} 위로` : '빈 줄로'} 옮겨 보세요.`,
      )
    } else
      setNotice(
        s.stock.length
          ? '옮길 만한 카드가 없어요. 오른쪽 위 더미를 눌러 카드를 더 나눠 보세요.'
          : '더 이상 쓸 만한 수가 없어요. 되돌리기를 써 보세요.',
      )
  }

  // ---------- layout ----------
  const wrapRef = useRef<HTMLDivElement>(null)
  const W = useElementWidth(wrapRef)
  const vh = useViewportHeight()
  const gap = W < 420 ? 2 : 6
  const cw = Math.min(80, Math.floor((W - gap * 9) / 10))
  const ch = Math.round(cw * 1.4)
  const x = (i: number) => i * (cw + gap)
  const avail = Math.max(ch * 4, vh - 250 - ch)
  const offsets = s.cols.map((c) => {
    let dOff = ch * 0.12
    let uOff = ch * 0.3
    const need = c.down.length * dOff + Math.max(0, c.up.length - 1) * uOff
    if (need > avail - ch) {
      const k = (avail - ch) / need
      dOff = Math.max(ch * 0.05, dOff * k)
      uOff = Math.max(ch * 0.24, uOff * k)
    }
    return { dOff, uOff }
  })
  const colTop = (ci: number, i: number) => {
    const c = s.cols[ci]
    const { dOff, uOff } = offsets[ci]
    return i < c.down.length ? i * dOff : c.down.length * dOff + (i - c.down.length) * uOff
  }
  const tabHeight = Math.max(
    ch * 3,
    ...s.cols.map((c, ci) => (c.down.length + c.up.length ? colTop(ci, c.down.length + c.up.length - 1) + ch : ch)),
  )

  const cardProps = (pile: PileId, index: number) => {
    const dragged = isDragged(drag, pile, index)
    return {
      ...bind(pile, index),
      width: cw,
      selected: !!sel && sel.pile === pile && index >= sel.index,
      highlight:
        !!hint && ((hint.pile === pile && index >= hint.index) || (hint.target === pile && index === lastIndex(pile))),
      'data-hint':
        hint && hint.pile === pile && index === hint.index
          ? 'src'
          : hint && hint.target === pile && index === lastIndex(pile)
            ? 'dst'
            : undefined,
      className: dragged ? 'spider-dragged' : undefined,
      style: dragged ? { transform: `translate(${drag!.dx}px, ${drag!.dy}px)` } : undefined,
    }
  }
  const lastIndex = (pile: PileId) => {
    const c = s.cols[+pile.slice(1)]
    return c.down.length + c.up.length - 1
  }

  if (won) {
    return (
      <>
        <Celebration />
        <Result title="🎉 8줄을 모두 완성했어요!" onAgain={onNew} againLabel="새 게임">
          <p>
            시간 <strong>{formatTime(seconds)}</strong> · 이동 <strong>{s.moves}</strong>번
          </p>
          <p>{newRecord ? '🏆 새로운 최고 기록!' : best != null ? `최고 기록: ${formatTime(best)}` : ''}</p>
          <button className="btn ghost" onClick={onExit}>
            난이도 바꾸기
          </button>
        </Result>
      </>
    )
  }

  const dealsLeft = s.stock.length / 10
  const doneW = Math.min(cw, 40)

  return (
    <div className="spider">
      <SolitaireBar seconds={seconds} moves={s.moves} best={best} canUndo={hist.length > 1} onUndo={undo} onNew={onNew}>
        <button className="btn small" onClick={showHint}>
          💡 힌트
        </button>
      </SolitaireBar>
      <div className={`spider-board felt ${drag ? 'spider-dragging' : ''}`}>
        <div ref={wrapRef} className="spider-measure" />
        <div className="spider-inner" style={{ width: x(10) - gap }}>
          <div className="spider-top" style={{ height: ch }}>
            <div className="spider-done" aria-label={`완성 ${s.done.length}/8`}>
              {s.done.map((suit, i) => (
                <div key={i} className="spider-done-card" style={{ left: i * doneW * 0.45 }}>
                  <PlayingCard card={makeCard(suit, 13, i)} width={doneW} variant="simple" />
                </div>
              ))}
              {s.done.length === 0 && <span className="spider-done-label">완성 0/8</span>}
            </div>
            <div
              className="spider-stock"
              style={{
                width: cw + (Math.max(1, dealsLeft) - 1) * cw * 0.22,
                height: ch,
              }}
            >
              {dealsLeft > 0 ? (
                Array.from({ length: dealsLeft }, (_, i) => (
                  <div key={i} className="spider-abs" style={{ left: i * cw * 0.22 }}>
                    <PlayingCard faceDown width={cw} {...(i === dealsLeft - 1 ? bind('stock', 0) : {})} />
                  </div>
                ))
              ) : (
                <CardSlot width={cw} />
              )}
            </div>
          </div>
          <div className="spider-tab" style={{ height: tabHeight }}>
            {s.cols.map((c, ci) => {
              const all = [...c.down, ...c.up]
              const pile = `t${ci}`
              return (
                <div
                  key={ci}
                  className="spider-col"
                  style={{ left: x(ci), width: cw, height: tabHeight }}
                  data-drop={pile}
                >
                  {all.length === 0 && (
                    <CardSlot
                      width={cw}
                      className={hint?.target === pile ? 'pc-slot-active' : ''}
                      onClick={() => onTap(pile, -1)}
                    />
                  )}
                  {all.map((card, i) => (
                    <div key={card.id} className="spider-abs" style={{ top: colTop(ci, i), zIndex: i }}>
                      <PlayingCard card={card} faceDown={i < c.down.length} {...cardProps(pile, i)} />
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {notice && <p className="spider-notice">{notice}</p>}
      <p className="muted spider-tip">
        같은 무늬로 이어진 카드만 한꺼번에 옮길 수 있어요. K부터 A까지 한 무늬로 모으면 자동으로 치워져요. 오른쪽 위
        더미를 누르면 모든 줄에 1장씩 나눠요 (남은 {dealsLeft}번).
      </p>
    </div>
  )
}
