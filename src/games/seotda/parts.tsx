/**
 * 섯다 화면 조각 (표시 전용). 로컬 게임과 온라인 화면이 함께 써요.
 * 가려진 카드는 id 대신 음수(-1)로 넘기면 뒷면으로 그려요.
 */
import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { HwatuCard, HwatuStyleButton } from '../../hwatu'
import { ACTION_LABEL, evaluate, legalActions, raiseTarget, toCall, type Action, type Table } from './logic'
import './seotda.css'

export function SeotdaTable({
  table,
  names,
  canSee,
  showHands,
  winnings,
  thinking,
  status,
}: {
  table: Table
  /** 표시 이름 (🤖 포함) */
  names: string[]
  canSee: (i: number) => boolean
  /** 승부가 끝나 족보 이름을 보여줄지 */
  showHands: boolean
  winnings: number[]
  /** 이 사람 차례에 "…" 표시 */
  thinking: (i: number) => boolean
  status: string
}) {
  const { players, phase, turn } = table
  const betting = phase !== 'showdown'
  const winners = table.result?.kind === 'win' ? table.result.winners : []
  return (
    <div className="seotda-table felt">
      <div className="seotda-pot">
        <span className="seotda-pot-label">판돈</span>
        <strong>{table.pot}</strong>
        {table.carry > 0 && <span className="seotda-carry">(재경기 이월 {table.carry})</span>}
      </div>
      <ul className="seotda-seats">
        {players.map((p, i) => {
          const isTurn = betting && i === turn
          const won = winners.includes(i) && showHands
          return (
            <li
              key={i}
              className={`seotda-seat ${isTurn ? 'turn' : ''} ${p.folded || !p.inHand ? 'out' : ''} ${won ? 'won' : ''}`}
              style={{ ['--seat' as string]: `var(--p${i + 1})` }}
            >
              <div className="seotda-who">
                <span className="seotda-name">
                  {names[i]}
                  {i === table.dealer && (
                    <span className="seotda-dealer" title="선">
                      선
                    </span>
                  )}
                </span>
                <span className="seotda-chips">
                  💰 {p.chips}
                  {p.inHand && <span className="muted"> · 베팅 {p.bet}</span>}
                </span>
              </div>
              <div className="seotda-mini">
                {p.inHand ? (
                  [0, 1].map((k) =>
                    p.cards[k] != null ? (
                      <HwatuCard
                        key={k}
                        card={p.cards[k] >= 0 ? p.cards[k] : undefined}
                        faceDown={!canSee(i) || p.cards[k] < 0}
                        width={34}
                        showMonth={false}
                        className="hw-deal"
                      />
                    ) : (
                      <span key={k} className="seotda-slot" />
                    ),
                  )
                ) : (
                  <span className="seotda-tag">쉬는 중</span>
                )}
              </div>
              <div className="seotda-act">
                {showHands && canSee(i) && p.cards.length === 2 && p.cards[0] >= 0 ? (
                  <span className={`seotda-tag hand ${won ? 'win' : ''}`}>{evaluate(p.cards).name}</span>
                ) : p.lastAction ? (
                  <span className={`seotda-tag ${p.folded ? 'die' : ''}`}>{p.lastAction}</span>
                ) : isTurn && thinking(i) ? (
                  <span className="seotda-tag thinking">…</span>
                ) : null}
                {won && winnings[i] > 0 && <span className="seotda-gain">+{winnings[i]}</span>}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="status seotda-status">{status}</div>
    </div>
  )
}

/** 승부 결과 문구 */
export function showdownText(table: Table, names: string[]): string {
  const r = table.result
  if (!r) return ''
  if (r.kind === 'redeal') return `🔄 ${names[r.by]}: ${r.reason}`
  const w = r.winners.map((i) => names[i]).join(', ')
  return r.reason ? `🎉 ${r.reason} ${w} 승!` : `🎉 ${w} 승!`
}

/** 내 패 크게 */
export function SeotdaHand({ cards, name, folded }: { cards: number[]; name: string; folded: boolean }) {
  return (
    <div className="seotda-hand card-panel">
      <div className="seotda-hand-cards">
        {cards.map((id) => (
          <HwatuCard key={id} card={id} width={104} className="hw-flip" />
        ))}
        {cards.length < 2 && <span className="seotda-slot big">?</span>}
      </div>
      <div className="seotda-hand-info">
        <span className="muted">{name}님의 패</span>
        <strong className="seotda-hand-name">{cards.length === 2 ? evaluate(cards).name : `${(cards[0] >> 2) + 1}월 한 장`}</strong>
        <span className="seotda-hand-months">{cards.map((id) => `${(id >> 2) + 1}월`).join(' + ')}</span>
        {folded && <span className="seotda-tag die">다이</span>}
      </div>
    </div>
  )
}

/** 베팅 버튼 (다이·콜·삥·하프) */
export function BetButtons({ table, seat, onAct }: { table: Table; seat: number; onAct: (a: Action) => void }) {
  const legal = legalActions(table, seat)
  const call = toCall(table, seat)
  const bet = table.players[seat].bet
  return (
    <div className="seotda-actions">
      <button className="btn danger" onClick={() => onAct('die')}>
        다이
      </button>
      <button className="btn primary" onClick={() => onAct('call')}>
        {call === 0 ? '체크' : `콜 ${call}`}
      </button>
      <button className="btn" disabled={!legal.includes('bbing')} onClick={() => onAct('bbing')}>
        {ACTION_LABEL.bbing}
        {legal.includes('bbing') && <small> +{raiseTarget(table, seat, 'bbing')! - bet}</small>}
      </button>
      <button className="btn accent" disabled={!legal.includes('half')} onClick={() => onAct('half')}>
        {ACTION_LABEL.half}
        {legal.includes('half') && <small> +{raiseTarget(table, seat, 'half')! - bet}</small>}
      </button>
    </div>
  )
}

/** 족보표 버튼 + 카드 모양 버튼 */
export function SeotdaTools() {
  const [showChart, setShowChart] = useState(false)
  return (
    <>
      <div className="seotda-tools">
        <button className="btn ghost small seotda-chart-btn" onClick={() => setShowChart(true)}>
          📜 족보표 보기
        </button>
        <HwatuStyleButton />
      </div>
      {showChart && (
        <Modal title="섯다 족보" onClose={() => setShowChart(false)}>
          <Chart />
        </Modal>
      )}
    </>
  )
}

const CHART: [string, number[], string][] = [
  ['38광땡', [8, 28], '최강'],
  ['18광땡', [0, 28], ''],
  ['13광땡', [0, 8], ''],
  ['장땡', [36, 37], '10땡'],
  ['9땡 ~ 삥땡', [32, 33], '같은 달 두 장'],
  ['알리', [0, 5], '1 + 2'],
  ['독사', [1, 12], '1 + 4'],
  ['구삥', [1, 33], '1 + 9'],
  ['장삥', [1, 37], '1 + 10'],
  ['장사', [13, 37], '4 + 10'],
  ['세륙', [13, 21], '4 + 6'],
  ['갑오 ~ 망통', [5, 25], '두 장 합의 끝자리'],
  ['땡잡이', [8, 24], '3광 + 7열끗: 1~9땡을 잡음'],
  ['암행어사', [12, 24], '4열끗 + 7열끗: 13·18광땡을 잡음'],
  ['구사', [13, 32], '4 + 9: 상대가 알리 이하면 재경기'],
]

function Chart() {
  return (
    <ul className="seotda-chart">
      {CHART.map(([name, ids, note]) => (
        <li key={name}>
          <span className="seotda-chart-cards">
            {ids.map((id) => (
              <HwatuCard key={id} card={id} width={34} />
            ))}
          </span>
          <span>
            <strong>{name}</strong>
            {note && <small className="muted"> {note}</small>}
          </span>
        </li>
      ))}
    </ul>
  )
}
