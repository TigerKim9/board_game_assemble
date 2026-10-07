import { useEffect, useRef, useState } from 'react'
import { Result } from '../../components/Result'
import { HwatuCard, HwatuStyleButton, HwatuStyleToggle, MONTH_NAMES, monthOf } from '../../hwatu'
import { sleep } from '../../lib/random'
import { useStored } from '../../lib/storage'
import {
  allPairs,
  bestPair,
  canRemove,
  cleared,
  completedMonths,
  hasMoves,
  meaningOf,
  newFortune,
  removePair,
  summary,
  type FortuneState,
} from './logic'
import './hwatu-fortune.css'

interface Saved {
  date: string
  months: number[]
  cleared: boolean
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export default function HwatuFortune() {
  const [round, setRound] = useState(0)
  const [last, setLast] = useStored<Saved | null>('hwatu-fortune:last', null)
  if (round === 0) {
    const todays = last && last.date === today() ? last : null
    return (
      <div className="hwf-start card-panel">
        <div className="hwf-fan" aria-hidden>
          {[0, 12, 28, 44, 20].map((id, i) => (
            <HwatuCard key={id} card={id} width={54} showMonth={false} style={{ transform: `rotate(${(i - 2) * 9}deg) translateY(${Math.abs(i - 2) * 4}px)` }} />
          ))}
        </div>
        <h2>오늘의 화투 운수</h2>
        <p className="muted">
          화투 16장을 깔고 붙어 있는 같은 달끼리 떼어 내요. 네 장을 모두 떼어 낸 달이 오늘의 운수를 알려 줘요.
        </p>
        {todays && (
          <div className="hwf-today">
            <strong>오늘 본 운수: {summary(todays.months.length, todays.cleared).title}</strong>
            <span className="muted">
              {todays.months.length ? todays.months.map((m) => `${meaningOf(m).emoji} ${meaningOf(m).word}`).join(' · ') : '풀린 달 없음'}
            </span>
          </div>
        )}
        <HwatuStyleToggle />
        <button className="btn primary big" onClick={() => setRound(1)}>
          {todays ? '한 번 더 떼어 보기' : '운수 떼기 시작'}
        </button>
        <p className="hwf-note muted">재미로 보는 운세예요 🙂</p>
      </div>
    )
  }
  return <Play key={round} onAgain={() => setRound((r) => r + 1)} onSave={setLast} />
}

function Play({ onAgain, onSave }: { onAgain: () => void; onSave: (s: Saved) => void }) {
  const [s, setS] = useState<FortuneState>(() => newFortune())
  const [sel, setSel] = useState<number | null>(null)
  const [hint, setHint] = useState<[number, number] | null>(null)
  const [msg, setMsg] = useState('붙어 있는(가로·세로·대각선) 같은 달 두 장을 차례로 누르세요.')
  const [auto, setAuto] = useState(false)
  const [stopped, setStopped] = useState(false)
  const [shake, setShake] = useState<number | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const done = completedMonths(s.removed)
  const finished = stopped || !hasMoves(s)

  useEffect(() => {
    if (finished) onSave({ date: today(), months: done, cleared: cleared(s) })
  }, [finished]) // eslint-disable-line react-hooks/exhaustive-deps

  // 자동 떼기
  useEffect(() => {
    if (!auto || finished) return
    let cancel = false
    ;(async () => {
      await sleep(380)
      if (cancel || !alive.current) return
      setS((cur) => {
        const p = bestPair(cur)
        return p ? removePair(cur, p[0], p[1]) : cur
      })
    })()
    return () => {
      cancel = true
    }
  }, [auto, s, finished])

  const prevDone = useRef(0)
  useEffect(() => {
    if (done.length > prevDone.current) {
      const m = done[done.length - 1]
      setMsg(`${meaningOf(m).emoji} ${m}월 ${MONTH_NAMES[m]} 네 장을 모두 뗐어요! — ${meaningOf(m).word}`)
    }
    prevDone.current = done.length
  }, [done.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const tap = (pos: number) => {
    if (auto || s.board[pos] == null) return
    setHint(null)
    if (sel == null) {
      setSel(pos)
      return
    }
    if (sel === pos) {
      setSel(null)
      return
    }
    if (canRemove(s, sel, pos)) {
      setS(removePair(s, sel, pos))
      setSel(null)
      setMsg('좋아요! 계속 떼어 보세요.')
    } else {
      const same = monthOf(s.board[sel]!) === monthOf(s.board[pos]!)
      setMsg(same ? '같은 달이지만 붙어 있지 않아요.' : '달이 달라요. 같은 그림끼리 골라 보세요.')
      setShake(pos)
      setTimeout(() => alive.current && setShake(null), 400)
      setSel(pos)
    }
  }

  if (finished) {
    const sm = summary(done.length, cleared(s))
    return (
      <Result title={sm.title} onAgain={onAgain} againLabel="다시 떼기">
        <p>{sm.text}</p>
        {done.length > 0 && (
          <ul className="hwf-readings">
            {done.map((m) => {
              const mean = meaningOf(m)
              return (
                <li key={m}>
                  <HwatuCard card={(m - 1) * 4} width={40} />
                  <div>
                    <strong>
                      {mean.emoji} {m}월 {MONTH_NAMES[m]} · {mean.word}
                    </strong>
                    <p>{mean.text}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="muted hwf-note">
          뗀 카드 {s.removed.length}/48장 · 재미로 보는 운세예요
        </p>
      </Result>
    )
  }

  const pairsLeft = allPairs(s).length
  return (
    <div className="hwf">
      <div className="hwf-top">
        <span className="hwf-stat">🎴 더미 {s.deck.length}</span>
        <span className="hwf-stat">✂️ 뗀 카드 {s.removed.length}</span>
        <span className="hwf-stat">🔓 풀린 달 {done.length}</span>
      </div>
      <div className="hwf-msg">{msg}</div>
      <div className="hwf-grid">
        {s.board.map((id, pos) =>
          id == null ? (
            <span key={`e${pos}`} className="hwf-empty" />
          ) : (
            <HwatuCard
              key={id}
              card={id}
              width={72}
              selected={sel === pos}
              highlight={hint != null && hint.includes(pos)}
              className={`hw-deal ${shake === pos ? 'hwf-shake' : ''}`}
              onClick={() => tap(pos)}
            />
          ),
        )}
      </div>
      {done.length > 0 && (
        <div className="hwf-done">
          {done.map((m) => (
            <span key={m} className="hwf-chip">
              {meaningOf(m).emoji} {m}월 {meaningOf(m).word}
            </span>
          ))}
        </div>
      )}
      <div className="btn-row">
        <button className="btn" disabled={auto} onClick={() => setHint(bestPair(s))}>
          💡 힌트 ({pairsLeft})
        </button>
        <button className={`btn ${auto ? 'accent' : ''}`} onClick={() => setAuto((a) => !a)}>
          {auto ? '⏸ 멈추기' : '⏩ 자동으로 떼기'}
        </button>
        <button className="btn ghost" onClick={() => setStopped(true)}>
          풀이 보기
        </button>
        <HwatuStyleButton />
      </div>
    </div>
  )
}
