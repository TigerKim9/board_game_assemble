import { cardPoints, marginalCost, scores } from '../../games/no-thanks/logic'
import { ChipStack, NumberCard, Seats } from '../../games/no-thanks/parts'
import '../../games/no-thanks/no-thanks.css'
import type { NoThanksAction, NoThanksView } from '../games/no-thanks'
import type { OnlineGameProps } from './types'

export default function OnlineNoThanks({ view: s, seat, toAct, seats, result, act }: OnlineGameProps<NoThanksView, NoThanksAction>) {
  const myTurn = seat != null && toAct.includes(seat)
  const names = seats.map((p) => p.name)
  const players = seats.map((p) => ({ name: `${p.name}${p.seat === seat ? ' (나)' : ''}${p.connected === false ? ' 📴' : ''}`, isAI: p.bot }))
  const sc = scores({ deck: [], card: s.card, pot: s.pot, hands: s.hands, chips: s.chips, turn: s.turn, removed: s.removed })
  const over = s.card == null
  const turnName = names[s.turn] ?? ''
  const log = s.last

  return (
    <>
      {!over && (
        <div className="nt-table felt">
          <div className="status">
            {myTurn ? '내 차례' : `${seats[s.turn]?.bot ? '🤖 ' : ''}${turnName} ${seats[s.turn]?.bot ? '고민 중…' : '차례'}`}
            {seat == null && ' (구경 중)'}
          </div>
          <div className="nt-center">
            <div className="nt-deck" aria-label={`남은 카드 ${s.deckCount}장`}>
              <span className="nt-deck-card" />
              <span className="nt-deck-count">{s.deckCount}</span>
            </div>
            <div key={s.flipNo} className="nt-offer">
              <NumberCard value={s.card as number} big />
            </div>
            <div className="nt-pot" aria-label={`칩 ${s.pot}개`}>
              <ChipStack n={s.pot} />
              <span className="nt-pot-count">🪙 {s.pot}</span>
            </div>
          </div>
          <div className="nt-log">
            {log ? (
              log.kind === 'pass' ? (
                <span>
                  {names[log.who]}: <strong>노 땡큐!</strong> 🙅
                </span>
              ) : (
                <span>
                  {names[log.who]} → <strong>{log.card}</strong> 가져감 (+🪙{log.pot})
                </span>
              )
            ) : (
              <span>첫 카드가 나왔어요!</span>
            )}
          </div>
          {myTurn && seat != null && (
            <>
              <p className="nt-hint">
                가져가면 카드 점수 +{marginalCost(s.hands[seat], s.card as number)}
                {s.pot > 0 ? `, 칩 +${s.pot}` : ''} → 순 {marginalCost(s.hands[seat], s.card as number) - s.pot >= 0 ? '+' : ''}
                {marginalCost(s.hands[seat], s.card as number) - s.pot}점
              </p>
              <div className="nt-actions">
                <button className="btn accent big" disabled={s.chips[seat] <= 0} onClick={() => act({ type: 'pass' })}>
                  🙅 노 땡큐 <small>(칩 1개)</small>
                </button>
                <button className="btn primary big" onClick={() => act({ type: 'take' })}>
                  ✋ 가져가기
                </button>
              </div>
              {s.chips[seat] <= 0 && <p className="nt-hint">칩이 없어서 가져가야 해요!</p>}
            </>
          )}
        </div>
      )}
      {over && (
        <div className="card-panel">
          <p className="muted">점수가 낮을수록 좋아요</p>
          <ol className="nt-ranking">
            {seats
              .map((p, i) => ({ p, i, t: sc[i] }))
              .sort((a, b) => a.t - b.t)
              .map(({ p, i, t }) => (
                <li key={i}>
                  {p.bot ? '🤖 ' : ''}
                  {p.name} — <strong>{t}점</strong>{' '}
                  <small className="muted">
                    (카드 {cardPoints(s.hands[i])} − 칩 {s.chips[i]})
                  </small>
                </li>
              ))}
          </ol>
        </div>
      )}
      <Seats players={players} s={s} sc={sc} over={over || !!result} />
      {!over && <p className="nt-removed muted">빠진 카드 9장은 끝날 때까지 비밀이에요 🤫</p>}
    </>
  )
}
