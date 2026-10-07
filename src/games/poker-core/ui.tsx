/** 포커 공용 UI 조각: 칩 저장소 안내, 칩 표시, 가림막. 스타일은 poker.css (접두사 pk-). */
import type { ReactNode } from 'react'
import { formatChips } from './betting'
import './poker.css'

export type ChipBank = Record<string, number>

/** 설정 화면에 붙이는 저장된 칩 안내 + 초기화 버튼 */
export function BankPanel({ bank, start, onReset, note }: { bank: ChipBank; start: number; onReset: () => void; note?: ReactNode }) {
  const saved = Object.entries(bank)
  return (
    <div className="pk-bank">
      <div className="pk-bank-head">
        <span>💰 보유 칩 (가상)</span>
        {saved.length > 0 && (
          <button className="btn small ghost" onClick={onReset}>
            칩 초기화
          </button>
        )}
      </div>
      <p className="muted">
        {saved.length === 0
          ? `처음이면 ${formatChips(start)}칩으로 시작해요.`
          : saved
              .slice(0, 6)
              .map(([n, c]) => `${n} ${formatChips(c)}`)
              .join(' · ')}
      </p>
      <p className="muted pk-small">{note ?? `칩이 바닥나면 ${formatChips(start)}칩으로 다시 채워 드려요. 진짜 돈은 쓰지 않아요.`}</p>
    </div>
  )
}

/** 판돈·베팅 칩 표시 */
export function Chips({ amount, className }: { amount: number; className?: string }) {
  return (
    <span className={`pk-chips ${className ?? ''}`}>
      <span className="pk-chip-dot" aria-hidden />
      {formatChips(amount)}
    </span>
  )
}

/** 핫시트: 다음 사람에게 화면 넘기기 */
export function PassCover({ name, onReveal, hint }: { name: string; onReveal: () => void; hint?: string }) {
  return (
    <div className="pk-cover card-panel">
      <div className="pk-cover-emoji">🙈</div>
      <h2>{name}님 차례</h2>
      <p className="muted">{hint ?? '다른 사람이 패를 보지 않도록 화면을 넘겨주세요.'}</p>
      <button className="btn primary big" onClick={onReveal}>
        내 패 보기
      </button>
    </div>
  )
}
