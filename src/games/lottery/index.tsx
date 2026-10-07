import { useState } from 'react'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import {
  MAX_TICKETS,
  MIN_TICKETS,
  clampWins,
  customLabels,
  makeTickets,
  openAll,
  openTicket,
  openedCount,
  winLoseLabels,
  winsLeft,
  type Ticket,
} from './logic'
import './lottery.css'

type Mode = 'winlose' | 'custom'

interface Config {
  labels: { label: string; win: boolean }[]
  mode: Mode
}

export default function Lottery() {
  const [config, setConfig] = useState<Config | null>(null)
  if (!config) return <Setup onStart={setConfig} />
  return <Draw config={config} onSetup={() => setConfig(null)} />
}

function Setup({ onStart }: { onStart: (c: Config) => void }) {
  const [total, setTotal] = useStored('lottery:total', 6)
  const [wins, setWins] = useStored('lottery:wins', 1)
  const [mode, setMode] = useStored<Mode>('lottery:mode', 'winlose')
  const [winLabel, setWinLabel] = useStored('lottery:winLabel', '당첨')
  const [loseLabel, setLoseLabel] = useStored('lottery:loseLabel', '꽝')
  const [custom, setCustom] = useStored('lottery:custom', '1등\n2등\n3등')
  const n = Math.min(MAX_TICKETS, Math.max(MIN_TICKETS, total))
  const w = clampWins(wins, n)
  const customCount = custom.split('\n').filter((s) => s.trim()).length

  return (
    <div className="setup card-panel lottery-setup">
      <div className="setup-row">
        <span>제비 수 (인원)</span>
        <div className="stepper">
          <button className="btn small" disabled={n <= MIN_TICKETS} onClick={() => setTotal(n - 1)}>
            −
          </button>
          <strong>{n}장</strong>
          <button className="btn small" disabled={n >= MAX_TICKETS} onClick={() => setTotal(n + 1)}>
            +
          </button>
        </div>
      </div>
      <div className="setup-row">
        <span>내용</span>
        <div className="segmented">
          <button className={mode === 'winlose' ? 'active' : ''} onClick={() => setMode('winlose')}>
            당첨 / 꽝
          </button>
          <button className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>
            직접 입력
          </button>
        </div>
      </div>
      {mode === 'winlose' ? (
        <>
          <div className="setup-row">
            <span>당첨 개수</span>
            <div className="stepper">
              <button className="btn small" disabled={w <= 1} onClick={() => setWins(w - 1)}>
                −
              </button>
              <strong>{w}장</strong>
              <button className="btn small" disabled={w >= n - 1} onClick={() => setWins(w + 1)}>
                +
              </button>
            </div>
          </div>
          <div className="lottery-labels">
            <label>
              <span>당첨 문구</span>
              <input className="seat-input" value={winLabel} maxLength={10} placeholder="당첨" onChange={(e) => setWinLabel(e.target.value)} />
            </label>
            <label>
              <span>꽝 문구</span>
              <input className="seat-input" value={loseLabel} maxLength={10} placeholder="꽝" onChange={(e) => setLoseLabel(e.target.value)} />
            </label>
          </div>
          <p className="muted lottery-sum">
            {winLabel || '당첨'} {w}장 + {loseLabel || '꽝'} {n - w}장
          </p>
        </>
      ) : (
        <>
          <textarea
            className="seat-input lottery-textarea"
            rows={5}
            value={custom}
            placeholder={'한 줄에 하나씩 적어요\n예) 1등\n2등\n설거지'}
            onChange={(e) => setCustom(e.target.value)}
          />
          <p className="muted lottery-sum">
            {customCount > n
              ? `${customCount}개 중 위에서부터 ${n}개만 써요.`
              : `적은 ${customCount}개 + 꽝 ${n - customCount}장`}
          </p>
        </>
      )}
      <button
        className="btn primary big"
        onClick={() =>
          onStart({ mode, labels: mode === 'winlose' ? winLoseLabels(n, w, winLabel, loseLabel) : customLabels(custom, n) })
        }
      >
        제비 섞기
      </button>
    </div>
  )
}

function Draw({ config, onSetup }: { config: Config; onSetup: () => void }) {
  const [tickets, setTickets] = useState<Ticket[]>(() => makeTickets(config.labels))
  const opened = openedCount(tickets)
  const allOpen = opened === tickets.length
  const left = winsLeft(tickets)
  const lastOpened = tickets.find((t) => t.openedAt === opened)

  const reshuffle = () => setTickets(makeTickets(config.labels))

  return (
    <>
      <div className="status lottery-status">
        {allOpen ? '모든 제비를 뽑았어요!' : `${opened + 1}번째 사람, 제비를 하나 고르세요`}
        {!allOpen && config.mode === 'winlose' && (
          <div className="lottery-left">
            남은 제비 {tickets.length - opened}장 · 그중 당첨 {left}장
          </div>
        )}
      </div>
      {lastOpened && !allOpen && (
        <div className={`lottery-last ${lastOpened.win ? 'win' : ''}`} key={opened}>
          {opened}번째: <strong>{lastOpened.label}</strong> {lastOpened.win ? '🎉' : ''}
        </div>
      )}
      <div className="lottery-grid">
        {tickets.map((t, i) => (
          <button
            key={i}
            className={`lottery-ticket ${t.openedAt != null ? 'open' : ''} ${t.win ? 'win' : ''}`}
            onClick={() => setTickets((ts) => openTicket(ts, i))}
            disabled={t.openedAt != null}
            aria-label={t.openedAt != null ? `${t.openedAt}번째: ${t.label}` : '접힌 제비'}
          >
            <span className="lottery-inner">
              <span className="lottery-back">
                <span className="lottery-fold" />
                <span className="lottery-q">?</span>
              </span>
              <span className="lottery-face">
                <small>{t.openedAt}번째</small>
                <strong>{t.label}</strong>
              </span>
            </span>
          </button>
        ))}
      </div>

      {allOpen ? (
        <Result title="🎟️ 제비뽑기 결과" onAgain={reshuffle} againLabel="다시 섞어서 뽑기">
          <ol className="lottery-summary">
            {tickets
              .slice()
              .sort((a, b) => (a.openedAt ?? 0) - (b.openedAt ?? 0))
              .map((t) => (
                <li key={t.openedAt} className={t.win ? 'win' : ''}>
                  <span>{t.openedAt}번째</span>
                  <strong>{t.label}</strong>
                </li>
              ))}
          </ol>
          <button className="btn ghost" onClick={onSetup}>
            제비 내용 바꾸기
          </button>
        </Result>
      ) : (
        <div className="btn-row">
          <button className="btn accent" onClick={() => setTickets(openAll)}>
            남은 제비 모두 열기
          </button>
          <button className="btn" onClick={reshuffle}>
            처음부터 다시 섞기
          </button>
          <button className="btn ghost" onClick={onSetup}>
            설정으로
          </button>
        </div>
      )}
    </>
  )
}
