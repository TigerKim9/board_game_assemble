import { useState } from 'react'
import { Die } from '../../components/Die'
import { countMatching, facesFor, isHigher, minRaise, type Bid, type Reveal } from './logic'

export function BidView({ bid, size = 30 }: { bid: Bid; size?: number }) {
  return (
    <span className="ld-bid">
      <strong>{bid.qty}</strong>
      <span className="ld-x">×</span>
      <Die value={bid.face} size={size} />
    </span>
  )
}

/** Everyone's dice after a challenge, matching dice highlighted. */
export function RevealPanel({
  names,
  hands,
  reveal: rv,
  wild,
  children,
}: {
  names: string[]
  hands: number[][]
  reveal: Reveal
  wild: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="ld-reveal">
      <p className="ld-reveal-result">
        실제로 <strong>{rv.actual}개</strong> → {rv.actual >= rv.bid.qty ? '베팅이 맞았어요!' : '거짓말이었어요!'}
        <br />
        <strong>{names[rv.loser]}</strong>님이 주사위 하나를 잃어요
        {hands[rv.loser].length === 1 && ' (탈락!)'}
      </p>
      <ul className="ld-reveal-list">
        {names.map((name, i) =>
          hands[i].length === 0 ? null : (
            <li key={i}>
              <span className="ld-reveal-name">{name}</span>
              <span className="ld-reveal-dice">
                {hands[i].map((d, j) => {
                  const hit = countMatching([d], rv.bid.face, wild) > 0
                  return (
                    <span key={j} className={hit ? 'hit' : 'miss'}>
                      <Die value={d} size={30} />
                    </span>
                  )
                })}
              </span>
            </li>
          ),
        )}
      </ul>
      {children}
    </div>
  )
}

/**
 * Quantity/face picker with bid and challenge buttons.
 * Give it a `key` that changes every turn so the draft resets to the minimal raise.
 */
export function BidControls({
  cur,
  total,
  wild,
  onBid,
  onChallenge,
}: {
  cur: Bid | null
  total: number
  wild: boolean
  onBid: (b: Bid) => void
  onChallenge: () => void
}) {
  const [draft, setDraft] = useState<Bid>(() => minRaise(cur, wild))
  const faces = facesFor(wild)
  const draftValid = isHigher(draft, cur) && draft.qty <= total
  const setFace = (f: number) => {
    let qty = draft.qty
    while (!isHigher({ qty, face: f }, cur)) qty++
    setDraft({ qty: Math.min(qty, total), face: f })
  }
  return (
    <div className="ld-controls">
      <div className="ld-qty">
        <button className="btn" onClick={() => setDraft((d) => ({ ...d, qty: Math.max(1, d.qty - 1) }))} disabled={draft.qty <= 1}>
          −
        </button>
        <span>
          <strong>{draft.qty}</strong>개
        </span>
        <button className="btn" onClick={() => setDraft((d) => ({ ...d, qty: Math.min(total, d.qty + 1) }))} disabled={draft.qty >= total}>
          +
        </button>
      </div>
      <div className="ld-faces">
        {faces.map((f) => (
          <Die key={f} value={f} size={40} held={draft.face === f} onClick={() => setFace(f)} />
        ))}
      </div>
      <div className="ld-actions">
        <button className="btn accent big" disabled={!draftValid} onClick={() => onBid(draft)}>
          베팅: {draft.qty}×{draft.face}
        </button>
        <button className="btn danger big" disabled={!cur} onClick={onChallenge}>
          거짓말!
        </button>
      </div>
    </div>
  )
}

/** Recent bids, newest first. */
export function BidLog({ names, bids }: { names: string[]; bids: { player: number; bid: Bid }[] }) {
  if (bids.length === 0) return null
  return (
    <ol className="ld-log card-panel">
      {bids
        .slice(-6)
        .reverse()
        .map((b, i) => (
          <li key={bids.length - i}>
            <span>{names[b.player]}</span>
            <BidView bid={b.bid} size={22} />
          </li>
        ))}
    </ol>
  )
}
