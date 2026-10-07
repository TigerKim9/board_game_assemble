import type { ReactNode } from 'react'
import { BONUS, BONUS_THRESHOLD, CATEGORIES, LABELS, bonusFor, scoreFor, total, upperTotal, type Category, type Scores } from './logic'

interface Props {
  /** Column headers, one per player. */
  names: ReactNode[]
  scores: Scores[]
  /** Highlighted column (current player), or null. */
  turn: number | null
  dice: number[]
  /** The current player may pick a box now (previews shown in their column). */
  canPick: boolean
  onPick: (c: Category) => void
}

/** Yacht score sheet shared by the local and online games. */
export function YachtScoreboard({ names, scores, turn, dice, canPick, onPick }: Props) {
  return (
    <div className="scoreboard-wrap">
      <table className="scoreboard">
        <thead>
          <tr>
            <th></th>
            {names.map((n, i) => (
              <th key={i} className={i === turn ? 'active' : ''}>
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((cat) => (
            <ScoreRow
              key={cat}
              cat={cat}
              scores={scores}
              turn={turn}
              dice={dice}
              canPick={canPick}
              onPick={onPick}
              after={cat === 'sixes'}
            />
          ))}
          <tr className="total-row">
            <th>합계</th>
            {scores.map((s, i) => (
              <td key={i}>{total(s)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function ScoreRow({
  cat,
  scores,
  turn,
  dice,
  canPick,
  onPick,
  after,
}: {
  cat: Category
  scores: Scores[]
  turn: number | null
  dice: number[]
  canPick: boolean
  onPick: (c: Category) => void
  after: boolean
}) {
  return (
    <>
      <tr>
        <th>{LABELS[cat]}</th>
        {scores.map((s, i) => {
          const v = s[cat]
          if (v !== undefined) return <td key={i}>{v}</td>
          if (i === turn && canPick) {
            const preview = scoreFor(cat, dice)
            return (
              <td key={i}>
                <button className={`pick ${preview > 0 ? 'good' : ''}`} onClick={() => onPick(cat)}>
                  {preview}
                </button>
              </td>
            )
          }
          return <td key={i} className="empty"></td>
        })}
      </tr>
      {after && (
        <tr className="bonus-row">
          <th>
            보너스 <small>({BONUS_THRESHOLD}↑ +{BONUS})</small>
          </th>
          {scores.map((s, i) => (
            <td key={i}>
              {bonusFor(s) ? `+${BONUS}` : <small className="muted">{upperTotal(s)}/{BONUS_THRESHOLD}</small>}
            </td>
          ))}
        </tr>
      )}
    </>
  )
}
