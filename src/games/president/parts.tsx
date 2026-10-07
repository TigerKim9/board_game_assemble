/** 대통령 presentational pieces shared by local and online play: the trick on the table and the score table. */
import type { ReactNode } from 'react'
import { PlayingCard } from '../../cards'
import { TITLE_EMOJI, TITLE_KO, TITLE_POINTS, type PRState } from './logic'

export function PresidentTrick({
  current,
  byName,
  plays,
  emptyText,
}: {
  current: PRState['current']
  byName: string
  /** Changes on every play (re-runs the drop animation). */
  plays: number
  emptyText: string
}) {
  return (
    <div className="president-trick">
      {current ? (
        <div className="president-play" key={plays}>
          <div className="president-cards">
            {current.cards.map((c) => (
              <PlayingCard key={c.id} card={c} width={58} />
            ))}
          </div>
          <span className="president-by">{byName}</span>
        </div>
      ) : (
        <div className="president-empty">{emptyText}</div>
      )}
    </div>
  )
}

export function ScoreTable({
  titles,
  scores,
  order,
  label,
}: {
  titles: PRState['titles']
  scores: number[]
  order: number[]
  label: (p: number) => ReactNode
}) {
  return (
    <table className="president-scores">
      <thead>
        <tr>
          <th>이름</th>
          <th>이번 판</th>
          <th>총점</th>
        </tr>
      </thead>
      <tbody>
        {order.map((p) => {
          const t = titles[p]
          return (
            <tr key={p}>
              <td>{label(p)}</td>
              <td>{t ? `${TITLE_EMOJI[t]} ${TITLE_KO[t]} +${TITLE_POINTS[t]}` : '-'}</td>
              <td>
                <strong>{scores[p]}</strong>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
