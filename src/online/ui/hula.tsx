import { useState } from 'react'
import { sortCards, type Card } from '../../cards'
import { attachTargets, bestPartition, canTakeDiscard, cardText, handPoints, isValidMeld, topDiscard, type HulaState } from '../../games/hula/logic'
import { Hand, HulaPlayers, HulaTable, RoundSummary } from '../../games/hula/parts'
import { useStored } from '../../lib/storage'
import type { HulaOnlineAction, HulaView } from '../games/hula'
import { SeatBar } from './SeatBar'
import type { OnlineGameProps } from './types'

export default function OnlineHula({ view, seat, toAct, seats, result, act }: OnlineGameProps<HulaView, HulaOnlineAction>) {
  const nameOf = (i: number) => seats[i]?.name || `${i + 1}번`
  // 로직 기록의 "#1" 자리 표시를 실제 이름으로
  const sub = (text: string) => text.replace(/#(\d)/g, (_, d: string) => nameOf(Number(d) - 1))
  const s: HulaState = {
    ...view.s,
    players: view.s.players.map((p, i) => ({ ...p, name: nameOf(i), isAI: !!seats[i]?.bot })),
    log: view.s.log.map(sub),
  }
  const { phase, players } = s
  const [sel, setSel] = useState<string[]>([])
  const [bySuit, setBySuit] = useStored('hula:bySuit', true)
  const [toast, setToast] = useState<string | null>(null)

  const myAct = seat != null && toAct.includes(seat)
  const myTurn = myAct && (phase === 'draw' || phase === 'play') && s.turn === seat
  // 차례가 바뀌면 선택 초기화
  const turnKey = `${s.round}-${phase}-${s.turn}`
  const [lastKey, setLastKey] = useState(turnKey)
  if (lastKey !== turnKey) {
    setLastKey(turnKey)
    setSel([])
    setToast(null)
  }

  const hand = seat != null ? s.hands[seat] : []
  const shown = sortCards(hand, { bySuit })
  const selCards = sel.map((id) => hand.find((c) => c.id === id)).filter((c): c is Card => !!c)
  const canRegister = myTurn && phase === 'play' && selCards.length > 0 && isValidMeld(selCards)
  const canDiscard = myTurn && phase === 'play' && selCards.length === 1 && !s.mustUse
  const attachable = new Set(myTurn && phase === 'play' && selCards.length === 1 && s.registered[seat!] ? attachTargets(s.melds, selCards[0]) : [])
  const top = topDiscard(s)
  const hulaChance = myTurn && phase === 'play' && !s.registered[seat!] && hand.length - bestPartition(hand).reduce((a, m) => a + m.length, 0) <= 1

  const send = (a: HulaOnlineAction) => {
    setSel([])
    setToast(null)
    act(a)
  }
  const toggle = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))
  const doTake = () => {
    if (!myTurn || phase !== 'draw') return
    if (!canTakeDiscard(s)) {
      setToast('버린 카드는 바로 등록·붙이기할 수 있을 때만 가져올 수 있어요')
      return
    }
    send({ type: 'take' })
  }

  const turnName = nameOf(s.turn)
  const statusText = (() => {
    if (result) return '게임 끝!'
    if (phase === 'roundEnd') return s.log[s.log.length - 1]
    if (phase === 'thankyou') {
      if (myAct) return '땡큐 기회! 방금 버린 카드를 가져올까요?'
      return `땡큐 기회: ${toAct.map(nameOf).join(', ')} 고르는 중…`
    }
    if (!myTurn) return `${players[s.turn].isAI ? '🤖 ' : ''}${turnName}님 차례${seat == null ? ' (구경 중)' : ''}`
    if (phase === 'draw') return '더미에서 뽑거나 버린 카드를 가져오세요'
    const must = s.mustUse ? hand.find((c) => c.id === s.mustUse) : undefined
    if (must) return `가져온 ${cardText(must)}를 꼭 등록하거나 붙이세요`
    return '등록·붙이기 후 카드 1장을 버리세요'
  })()

  return (
    <div className="hula">
      <SeatBar seats={seats} active={toAct} you={seat} />
      <HulaPlayers s={s} active={phase === 'roundEnd' ? [] : toAct} />
      <HulaTable
        s={s}
        canDraw={myTurn && phase === 'draw'}
        onDraw={() => send({ type: 'draw' })}
        onTake={doTake}
        status={statusText}
        attachable={attachable}
        onAttach={(meldId) => attachable.has(meldId) && send({ type: 'attach', cardId: sel[0], meldId })}
      />
      {toast && <div className="hula-toast">{toast}</div>}

      {phase === 'roundEnd' ? (
        <RoundSummary s={s}>
          {!result &&
            (myAct ? (
              <button className="btn primary big" onClick={() => send({ type: 'next' })}>
                다음 라운드
              </button>
            ) : (
              <p className="muted center">
                {toAct.length ? `${toAct.map(nameOf).join(', ')}님을 기다리는 중…` : ''}
              </p>
            ))}
        </RoundSummary>
      ) : (
        seat != null && (
          <div className="hula-me card-panel">
            <div className="hula-me-head">
              <span>
                <strong>{nameOf(seat)}</strong> <span className="muted">손패 {handPoints(hand)}점</span>
              </span>
              <button className="btn small ghost" onClick={() => setBySuit(!bySuit)}>
                {bySuit ? '숫자순' : '무늬순'} 정렬
              </button>
            </div>
            {hulaChance && <div className="hula-chance">🌺 지금 한 번에 다 내면 훌라!</div>}
            <Hand cards={shown} sel={sel} mustUse={s.mustUse} onTap={myTurn && phase === 'play' ? toggle : undefined} />
            {myAct && phase === 'thankyou' && top && (
              <div className="hula-thank">
                <span>
                  방금 버린 <strong>{cardText(top)}</strong> 를 땡큐 할까요?
                </span>
                <div className="hula-buttons">
                  <button className="btn ghost" onClick={() => send({ type: 'pass' })}>
                    넘기기
                  </button>
                  <button className="btn accent" onClick={() => send({ type: 'thank' })}>
                    땡큐!
                  </button>
                </div>
              </div>
            )}
            {myTurn && phase === 'play' && (
              <div className="hula-buttons">
                <button className="btn primary" disabled={!canRegister} onClick={() => send({ type: 'register', ids: sel })}>
                  등록
                </button>
                <button className="btn accent" disabled={!canDiscard} onClick={() => send({ type: 'discard', cardId: sel[0] })}>
                  버리기
                </button>
              </div>
            )}
            {myTurn && phase === 'play' && selCards.length === 1 && attachable.size > 0 && <p className="hula-hint">빛나는 등록 카드를 누르면 붙일 수 있어요</p>}
            {myTurn && phase === 'play' && selCards.length === 1 && !s.registered[seat] && (
              <p className="hula-hint muted">붙이기는 한 번 등록한 뒤에 할 수 있어요</p>
            )}
          </div>
        )
      )}
      <p className="muted hula-foot">
        {players.length}명 · {s.totalRounds}라운드 · 덱이 떨어지면 스톱
      </p>
    </div>
  )
}
