import { ROW_LIMIT, heads, sumHeads } from './logic'

/** The four rows; when `pickable`, each row is a button showing its penalty. */
export function CowRows({
  rows,
  pickable,
  hit,
  onPick,
}: {
  rows: number[][]
  pickable: boolean
  /** Row a card is about to land on (highlighted), or -1. */
  hit: number
  onPick: (row: number) => void
}) {
  return (
    <div className="cd-rows">
      {rows.map((r, i) => {
        const danger = r.length >= ROW_LIMIT
        return (
          <button
            key={i}
            className={`cd-row ${pickable ? 'pickable' : ''} ${hit === i ? 'hit' : ''}`}
            disabled={!pickable}
            onClick={() => onPick(i)}
          >
            {Array.from({ length: ROW_LIMIT + 1 }, (_, j) =>
              r[j] != null ? (
                <CowCard key={j} value={r[j]} />
              ) : (
                <span key={j} className={`cd-slot ${j === ROW_LIMIT ? 'six' : ''} ${danger && j === ROW_LIMIT ? 'warn' : ''}`}>
                  {j === ROW_LIMIT ? '💥' : ''}
                </span>
              ),
            )}
            {pickable && <span className="cd-row-tag">🐮{sumHeads(r)}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function CowCard({
  value,
  small,
  selected,
  flip,
  onClick,
}: {
  value: number
  small?: boolean
  selected?: boolean
  flip?: boolean
  onClick?: () => void
}) {
  const h = heads(value)
  const cls = `cd-card h${h} ${small ? 'small' : ''} ${selected ? 'selected' : ''} ${flip ? 'flip' : ''}`
  const inner = (
    <>
      <span className="cd-num">{value}</span>
      <span className="cd-heads" aria-label={`소 ${h}마리`}>
        {h >= 5 ? `🐮×${h}` : '🐮'.repeat(h)}
      </span>
    </>
  )
  if (onClick)
    return (
      <button className={cls} onClick={onClick}>
        {inner}
      </button>
    )
  return <span className={cls}>{inner}</span>
}
