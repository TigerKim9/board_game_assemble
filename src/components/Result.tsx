import type { ReactNode } from 'react'

/** Banner shown when a game round ends. */
export function Result({ title, children, onAgain, againLabel = '다시 하기' }: {
  title: string
  children?: ReactNode
  onAgain?: () => void
  againLabel?: string
}) {
  return (
    <div className="result card-panel">
      <h2>{title}</h2>
      {children}
      {onAgain && (
        <button className="btn primary big" onClick={onAgain}>
          {againLabel}
        </button>
      )}
    </div>
  )
}
