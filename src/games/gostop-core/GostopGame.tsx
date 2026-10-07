import { useEffect, useMemo, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { HwatuCard, HwatuPile, KIND_NAMES, KIND_ORDER, getCard, monthOf } from '../../hwatu'
import { sleep } from '../../lib/random'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  MODES,
  WON_PER_POINT,
  aiStep,
  advance,
  canBomb,
  canShake,
  choose,
  clone,
  decideGo,
  finishWin,
  goBonus,
  matchesOnFloor,
  newRound,
  play,
  scoreOf,
  type GEvent,
  type GPlayer,
  type GState,
  type Mode,
  type PlayAction,
  type RoundResult,
} from './logic'
import './gostop.css'

type Wallet = Record<string, number>
/** 맞고·고스톱이 함께 쓰는 가상 머니 지갑 */
export const WALLET_KEY = 'gostop:money'

export const won = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('ko-KR')}원`

interface Session {
  players: PlayerConfig[]
  difficulty: Difficulty
  round: number
  first: number
  nagariMult: number
}

export function GostopGame({ mode }: { mode: Mode }) {
  const cfg = MODES[mode]
  const [session, setSession] = useState<Session | null>(null)
  const [wallet, setWallet] = useStored<Wallet>(WALLET_KEY, {})

  if (!session) {
    const saved = Object.entries(wallet).sort((a, b) => b[1] - a[1])
    return (
      <PlayerSetup
        gameId={mode}
        min={cfg.players}
        max={cfg.players}
        showDifficulty
        onStart={(players, difficulty) =>
          setSession({ players, difficulty, round: 1, first: Math.floor(Math.random() * players.length), nagariMult: 1 })
        }
        extra={
          <div className="gostop-wallet">
            <div className="gostop-wallet-head">
              <span>💰 누적 손익 (가상 머니 · 점당 {WON_PER_POINT}원)</span>
              {saved.length > 0 && (
                <button className="btn small ghost" onClick={() => setWallet({})}>
                  초기화
                </button>
              )}
            </div>
            {saved.length === 0 ? (
              <p className="muted gostop-wallet-empty">아직 기록이 없어요. 진짜 돈은 오가지 않아요!</p>
            ) : (
              <ul className="gostop-wallet-list">
                {saved.map(([name, v]) => (
                  <li key={name}>
                    <span>{name}</span>
                    <strong className={v >= 0 ? 'plus' : 'minus'}>{won(v)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        }
      />
    )
  }
  return (
    <Game
      key={session.round}
      mode={mode}
      session={session}
      wallet={wallet}
      setWallet={setWallet}
      onNext={(r) =>
        setSession({
          ...session,
          round: session.round + 1,
          first: r.winner ?? session.first,
          nagariMult: r.kind === 'nagari' ? r.nextMult : 1,
        })
      }
      onReset={() => setSession(null)}
    />
  )
}

interface Toast {
  id: number
  text: string
  type: GEvent['type']
  who: string
}

const DELAY: Record<string, number> = { play: 850, chooseHand: 650, chooseFlip: 650, flip: 600, resolve: 700, goStop: 900 }

function Game({
  mode,
  session,
  wallet,
  setWallet,
  onNext,
  onReset,
}: {
  mode: Mode
  session: Session
  wallet: Wallet
  setWallet: (v: Wallet | ((p: Wallet) => Wallet)) => void
  onNext: (r: RoundResult) => void
  onReset: () => void
}) {
  const [s, setS] = useState<GState>(() => newRound(session.players, mode, { first: session.first, nagariMult: session.nagariMult }))
  const [selected, setSelected] = useState<number | null>(null)
  const [revealed, setRevealed] = useState<number | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [showResult, setShowResult] = useState(false)
  const busy = useRef(false)
  const alive = useRef(true)
  const settled = useRef(false)
  const toastId = useRef(0)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const { players, turn, phase } = s
  const current = players[turn]
  const humans = players.map((_, i) => i).filter((i) => !players[i].isAI)
  const multiHuman = humans.length >= 2
  const over = phase.kind === 'over'

  // 자동 진행: 뒤집기·정리, AI 차례
  useEffect(() => {
    if (over || busy.current) return
    const k = phase.kind
    const auto = k === 'flip' || k === 'resolve' || current.isAI
    if (!auto) return
    busy.current = true
    ;(async () => {
      await sleep(DELAY[k] ?? 700)
      busy.current = false
      if (!alive.current) return
      setS((st) => {
        if (st !== s) return st
        return st.phase.kind === 'flip' || st.phase.kind === 'resolve' ? advance(st) : aiStep(st, session.difficulty)
      })
    })()
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps

  // 사건 토스트
  useEffect(() => {
    if (!s.events.length) return
    const add = s.events.map((e) => ({ id: ++toastId.current, text: e.text, type: e.type, who: players[e.player].name }))
    setToasts((t) => [...t, ...add].slice(-4))
    const ids = add.map((a) => a.id)
    setTimeout(() => alive.current && setToasts((t) => t.filter((x) => !ids.includes(x.id))), 1900)
  }, [s.eventSeq]) // eslint-disable-line react-hooks/exhaustive-deps

  // 판이 끝나면 정산 (한 번만)
  useEffect(() => {
    if (!over || settled.current) return
    settled.current = true
    const r = s.result!
    const delta = moneyDelta(r, players.length)
    setWallet((w) => {
      const next = { ...w }
      players.forEach((p, i) => {
        if (delta[i]) next[p.name] = (next[p.name] ?? 0) + delta[i]
      })
      return next
    })
    const t = setTimeout(() => alive.current && setShowResult(true), r.kind === 'chongtong' ? 900 : 1500)
    return () => clearTimeout(t)
  }, [over]) // eslint-disable-line react-hooks/exhaustive-deps

  // 차례가 바뀌면 선택 해제 / 가림막
  useEffect(() => {
    setSelected(null)
    if (multiHuman && revealed !== turn) setRevealed(null)
  }, [turn]) // eslint-disable-line react-hooks/exhaustive-deps

  const viewer = !multiHuman ? (humans[0] ?? null) : !current.isAI && revealed === turn ? turn : null
  const needCover = !over && multiHuman && !current.isAI && revealed !== turn
  const myTurn = !over && viewer === turn && !current.isAI
  const me = viewer != null ? players[viewer] : null

  const stopPreview = useMemo(() => {
    if (phase.kind !== 'goStop') return null
    const r = finishWin(clone(s), s.turn).result!
    return r.payments.reduce((a, p) => a + p.points, 0)
  }, [s, phase.kind])

  if (over && showResult) {
    return <RoundEnd s={s} viewer={humans.length === 1 ? humans[0] : null} wallet={wallet} onNext={() => onNext(s.result!)} onReset={onReset} />
  }

  const doPlay = (a: PlayAction) => {
    setSelected(null)
    setS((st) => play(st, a))
  }
  const canPlay = myTurn && phase.kind === 'play'
  const choosing = myTurn && (phase.kind === 'chooseHand' || phase.kind === 'chooseFlip') ? phase.options : []
  const selMatches = selected != null && me?.hand.includes(selected) ? matchesOnFloor(s, selected) : []

  const onHand = (id: number) => {
    if (!canPlay) return
    if (selected === id && !canBomb(s, id) && !canShake(s, id)) doPlay({ type: 'card', card: id })
    else setSelected(id)
  }
  const onFloor = (id: number) => {
    if (choosing.includes(id)) setS((st) => choose(st, id))
    else if (canPlay && selected != null && selMatches.includes(id)) doPlay({ type: 'card', card: selected })
  }

  // 상태 문구
  let status: string
  if (over) status = s.result?.kind === 'nagari' ? '나가리!' : `${players[s.result!.winner!].name} 승리!`
  else if (phase.kind === 'goStop') status = myTurn ? `${phase.score}점! 고 할까요, 스톱 할까요?` : `🤖 ${current.name} 고민 중… (${phase.score}점)`
  else if (phase.kind === 'chooseHand' || phase.kind === 'chooseFlip')
    status = myTurn ? '같은 달이 두 장! 가져올 카드를 누르세요' : `${current.isAI ? '🤖 ' : ''}${current.name} 고르는 중…`
  else if (phase.kind === 'flip') status = '더미에서 한 장 뒤집는 중…'
  else if (phase.kind === 'resolve') status = '…'
  else if (current.isAI) status = `🤖 ${current.name} 차례…`
  else if (myTurn)
    status = selected != null ? (selMatches.length ? '한 번 더 누르거나 빛나는 바닥 카드를 누르세요' : '짝이 없어요. 한 번 더 누르면 바닥에 내려놔요') : '낼 카드를 고르세요'
  else status = `${current.name} 차례`

  const opponents = players.map((p, i) => ({ p, i })).filter(({ i }) => i !== viewer)
  const ctx = s.ctx
  const showFlip = ctx?.flipped != null && (phase.kind === 'chooseFlip' || phase.kind === 'resolve')
  const fresh = new Set(ctx?.played ?? [])
  const pendingOptions = (phase.kind === 'chooseHand' || phase.kind === 'chooseFlip') ? phase.options : []

  return (
    <div className={`gostop gostop-${mode}`}>
      <div className="gostop-opps">
        {opponents.map(({ p, i }) => (
          <PlayerPanel key={i} p={p} active={i === turn && !over} threshold={s.cfg.threshold} compact />
        ))}
      </div>

      <div className="gostop-table felt">
        <div className="gostop-toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`gostop-toast gostop-toast-${t.type}`}>
              <small>{t.who}</small>
              {t.text}
            </div>
          ))}
        </div>
        <Floor
          floor={s.floor}
          ppeok={s.ppeok}
          highlight={[...choosing, ...selMatches, ...(myTurn ? [] : pendingOptions)]}
          clickable={[...choosing, ...(canPlay ? selMatches : [])]}
          fresh={fresh}
          onPick={onFloor}
        />
        <div className="gostop-center">
          <HwatuPile count={s.deck.length} width={38} />
          <div className="gostop-flip">
            {showFlip && <HwatuCard key={ctx!.flipped!} card={ctx!.flipped!} width={42} className="hw-flip" title="뒤집은 카드" />}
          </div>
          <div className="gostop-msg">
            {s.nagariMult > 1 && <span className="gostop-badge hot">판돈 ×{s.nagariMult}</span>}
            {s.message || (mode === 'matgo' ? `${s.cfg.threshold}점부터 고·스톱!` : `${s.cfg.threshold}점부터 고·스톱!`)}
          </div>
        </div>
      </div>

      <div className="status gostop-status">{status}</div>

      {myTurn && phase.kind === 'goStop' && (
        <div className="gostop-decide card-panel">
          <p>
            지금 <strong>{phase.score}점</strong>
            {current.goCount > 0 && ` · ${current.goCount}고 중`}
            {stopPreview != null && (
              <>
                <br />
                스톱하면 <strong>{stopPreview}점</strong> ({won(stopPreview * WON_PER_POINT)}) 획득
              </>
            )}
          </p>
          <div className="btn-row">
            <button className="btn accent big" onClick={() => setS((st) => decideGo(st, true))}>
              {current.goCount + 1}고!
              <small> ({goLabel(current.goCount + 1)})</small>
            </button>
            <button className="btn primary big" onClick={() => setS((st) => decideGo(st, false))}>
              스톱
            </button>
          </div>
          <p className="muted gostop-hint">고를 하면 더 큰 점수를 노리지만, 상대가 먼저 나면 고박이에요.</p>
        </div>
      )}

      {needCover ? (
        <div className="gostop-cover card-panel">
          <div className="gostop-cover-emoji">🙈</div>
          <h2>{current.name}님 차례</h2>
          <p className="muted">다른 사람이 패를 보지 않도록 화면을 넘겨주세요.</p>
          <button className="btn primary big" onClick={() => setRevealed(turn)}>
            내 패 보기
          </button>
        </div>
      ) : (
        me &&
        viewer != null && (
          <>
            <PlayerPanel p={me} active={viewer === turn && !over} threshold={s.cfg.threshold} />
            <div className="gostop-hand card-panel">
              <div className="gostop-hand-head">
                <strong>내 손패</strong>
                <span className="muted">{me.hand.length}장</span>
              </div>
              <div className="gostop-hand-cards">
                {me.hand.map((id) => {
                  const canMatch = matchesOnFloor(s, id).length > 0
                  const triple = me.hand.filter((h) => monthOf(h) === monthOf(id)).length >= 3
                  return (
                    <HwatuCard
                      key={id}
                      card={id}
                      width={54}
                      selected={selected === id}
                      highlight={canPlay && triple && selected !== id}
                      dim={canPlay && !canMatch && selected !== id}
                      onClick={canPlay ? () => onHand(id) : undefined}
                    />
                  )
                })}
                {me.hand.length === 0 && <span className="muted">손패가 없어요</span>}
              </div>
              {canPlay && (selected != null || me.dummies > 0) && (
                <div className="gostop-actions">
                  {selected != null && canBomb(s, selected) && (
                    <button className="btn accent" onClick={() => doPlay({ type: 'card', card: selected, bomb: true })}>
                      💣 폭탄 (3장 한꺼번에)
                    </button>
                  )}
                  {selected != null && canShake(s, selected) && (
                    <button className="btn accent" onClick={() => doPlay({ type: 'card', card: selected, shake: true })}>
                      🫨 흔들고 내기 (×2)
                    </button>
                  )}
                  {selected != null && (
                    <button className="btn primary" onClick={() => doPlay({ type: 'card', card: selected })}>
                      {canBomb(s, selected) || canShake(s, selected) ? '그냥 한 장 내기' : '이 카드 내기'}
                    </button>
                  )}
                  {me.dummies > 0 && (
                    <button className="btn ghost" onClick={() => doPlay({ type: 'dummy' })}>
                      빈 차례 쓰기 (더미만 뒤집기 · {me.dummies}번 남음)
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )
      )}
    </div>
  )
}

function goLabel(n: number): string {
  const { add, mult } = goBonus(n)
  return mult > 1 ? `+${add}점 ×${mult}` : `+${add}점`
}

/** 플레이어별 돈 변화 (원) */
export function moneyDelta(r: RoundResult, n: number): number[] {
  const d = Array.from({ length: n }, () => 0)
  if (r.winner == null) return d
  for (const p of r.payments) {
    const m = p.points * WON_PER_POINT
    d[p.from] -= m
    d[r.winner] += m
  }
  return d
}

function Floor({
  floor,
  ppeok,
  highlight,
  clickable,
  fresh,
  onPick,
}: {
  floor: number[]
  ppeok: Record<number, number>
  highlight: number[]
  clickable: number[]
  fresh: Set<number>
  onPick: (id: number) => void
}) {
  const groups = new Map<number, number[]>()
  for (const id of floor.slice().sort((a, b) => a - b)) {
    const m = monthOf(id)
    groups.set(m, [...(groups.get(m) ?? []), id])
  }
  // 막 낸 카드는 그 달 묶음 맨 위에
  for (const [m, ids] of groups) groups.set(m, [...ids.filter((i) => !fresh.has(i)), ...ids.filter((i) => fresh.has(i))])
  if (!floor.length) return <div className="gostop-floor gostop-floor-empty">바닥이 비었어요</div>
  return (
    <div className="gostop-floor">
      {[...groups.entries()].map(([m, ids]) => (
        <div key={m} className={`gostop-group ${ppeok[m] != null ? 'ppeok' : ''} ${ids.some((i) => clickable.includes(i)) && ids.length > 1 ? 'spread' : ''}`}>
          {ppeok[m] != null && <span className="gostop-ppeok">뻑</span>}
          {ids.map((id) => (
            <HwatuCard
              key={id}
              card={id}
              width={40}
              highlight={highlight.includes(id)}
              className={fresh.has(id) ? 'hw-deal' : ''}
              onClick={clickable.includes(id) ? () => onPick(id) : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function Badges({ p }: { p: GPlayer }) {
  return (
    <>
      {p.goCount > 0 && <span className="gostop-badge go">{p.goCount}고</span>}
      {p.shakes - p.bombs > 0 && <span className="gostop-badge">흔들 {p.shakes - p.bombs > 1 ? `×${p.shakes - p.bombs}` : ''}</span>}
      {p.bombs > 0 && <span className="gostop-badge">💣{p.bombs > 1 ? `×${p.bombs}` : ''}</span>}
      {p.ppeoks > 0 && <span className="gostop-badge dim">뻑 {p.ppeoks}</span>}
    </>
  )
}

function PlayerPanel({ p, active, threshold, compact }: { p: GPlayer; active: boolean; threshold: number; compact?: boolean }) {
  const [open, setOpen] = useState(!compact)
  const sc = scoreOf(p.captured)
  const g = { gwang: [] as number[], yeol: [] as number[], tti: [] as number[], pi: [] as number[] }
  for (const id of p.captured.slice().sort((a, b) => a - b)) {
    const c = getCard(id)
    if (c.isGukjin && sc.gukjinAsPi) g.pi.push(id)
    else g[c.kind].push(id)
  }
  const counts: Record<string, number> = { gwang: g.gwang.length, yeol: g.yeol.length, tti: g.tti.length, pi: sc.pi }
  return (
    <div className={`gostop-player ${active ? 'active' : ''} ${compact ? 'compact' : ''}`}>
      <button className="gostop-player-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="gostop-player-name">
          {p.isAI ? '🤖 ' : ''}
          {p.name}
        </span>
        {compact && (
          <span className="gostop-backs" aria-label={`손패 ${p.hand.length}장`}>
            <HwatuCard faceDown width={14} />
            <b>{p.hand.length}</b>
          </span>
        )}
        <Badges p={p} />
        <span className={`gostop-score ${sc.total >= threshold ? 'ready' : ''}`}>{sc.total}점</span>
        <span className="gostop-toggle">{open ? '▲' : '▼'}</span>
      </button>
      <div className="gostop-counts">
        {KIND_ORDER.map((k) => (
          <span key={k} className={`gostop-count k-${k}`}>
            {KIND_NAMES[k]} <b>{counts[k]}</b>
          </span>
        ))}
        {sc.items.length > 0 && <span className="gostop-items">{sc.items.map((it) => `${it.label} ${it.points}`).join(' · ')}</span>}
      </div>
      {open && (
        <div className="gostop-rows">
          {p.captured.length === 0 && <span className="muted gostop-none">아직 먹은 패가 없어요</span>}
          {KIND_ORDER.map((k) =>
            g[k].length ? (
              <div key={k} className="gostop-row">
                <span className="gostop-kind">{KIND_NAMES[k]}</span>
                <span className="gostop-stack">
                  {g[k].map((id) => (
                    <HwatuCard key={id} card={id} width={compact ? 26 : 30} showMonth={false} />
                  ))}
                </span>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  )
}

function RoundEnd({
  s,
  viewer,
  wallet,
  onNext,
  onReset,
}: {
  s: GState
  viewer: number | null
  wallet: Wallet
  onNext: () => void
  onReset: () => void
}) {
  const r = s.result!
  const { players } = s
  const delta = moneyDelta(r, players.length)
  let title: string
  if (r.kind === 'nagari') title = '🤝 나가리!'
  else if (viewer != null) title = r.winner === viewer ? `🎉 승리! ${won(delta[viewer])}` : `😢 ${players[r.winner!].name} 승리`
  else title = `🏆 ${players[r.winner!].name} 승리!`
  const { add } = goBonus(r.goCount)
  return (
    <Result title={title} onAgain={onNext} againLabel={r.kind === 'nagari' ? `다음 판 (판돈 ×${r.nextMult})` : '다음 판'}>
      {r.kind === 'nagari' ? (
        <p>아무도 스톱하지 못하고 더미가 떨어졌어요. 다음 판 점수는 {r.nextMult}배!</p>
      ) : (
        <div className="gostop-break">
          {r.kind === 'chongtong' && <p className="gostop-break-note">같은 달 네 장을 들고 시작해 바로 이겼어요!</p>}
          {r.note && <p className="gostop-break-note">{r.note}</p>}
          <table>
            <tbody>
              {r.items.map((it) => (
                <tr key={it.key}>
                  <th>{it.label}</th>
                  <td>{it.points ? `${it.points}점` : ''}</td>
                </tr>
              ))}
              {r.goCount > 0 && (
                <tr>
                  <th>{r.goCount}고 보너스</th>
                  <td>+{add}점</td>
                </tr>
              )}
              <tr className="sum">
                <th>기본 점수</th>
                <td>{r.base}점</td>
              </tr>
              {r.multipliers.map((m) => (
                <tr key={m.label} className="mult">
                  <th>{m.label}</th>
                  <td>×{m.factor}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="gostop-pay">
            {r.payments.map((p) => (
              <li key={p.from}>
                <span>
                  {players[p.from].isAI ? '🤖 ' : ''}
                  {players[p.from].name}
                  {p.reasons.map((x) => (
                    <span key={x} className="gostop-badge hot">
                      {x} {x === '고박' && s.mode === 'gostop' ? '(독박)' : '×2'}
                    </span>
                  ))}
                </span>
                <strong>
                  {p.points}점 → {won(-p.points * WON_PER_POINT)}
                </strong>
                {p.paysFor.length > 0 && <small className="muted">{p.paysFor.map((i) => players[i].name).join(', ')} 몫까지 대신 내요</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="gostop-wallet-list gostop-wallet-now">
        {players.map((p, i) => (
          <li key={i}>
            <span>
              {p.isAI ? '🤖 ' : ''}
              {p.name}
              {delta[i] !== 0 && <small className={delta[i] > 0 ? 'plus' : 'minus'}> {won(delta[i])}</small>}
            </span>
            <strong className={(wallet[p.name] ?? 0) >= 0 ? 'plus' : 'minus'}>{won(wallet[p.name] ?? 0)}</strong>
          </li>
        ))}
      </ul>
      <button className="btn ghost" onClick={onReset}>
        처음으로
      </button>
    </Result>
  )
}
