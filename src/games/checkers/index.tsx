import { useMemo, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import { DuelActions, DuelBar } from '../othello/duel'
import { turnText, useDuel } from '../othello/useDuel'
import {
  DRAW_PLIES,
  aiMove,
  applyMove,
  initialState,
  isDark,
  isKing,
  jumpedAlong,
  legalMoves,
  ownerOf,
  pieceCounts,
  type CheckersState,
  type Move,
} from './logic'
import './checkers.css'

interface Setup {
  players: PlayerConfig[]
  difficulty: Difficulty
}

export default function Checkers() {
  const [setup, setSetup] = useState<Setup | null>(null)
  if (!setup) {
    return (
      <PlayerSetup
        gameId="checkers"
        min={2}
        max={2}
        showDifficulty
        extra={<p className="checkers-note muted">첫 번째 자리가 검은 말(먼저 둠)이에요. 버튼으로 사람/컴퓨터를 바꿔 순서를 정하세요.</p>}
        onStart={(players, difficulty) => setSetup({ players, difficulty })}
      />
    )
  }
  return <Game setup={setup} onSetup={() => setSetup(null)} />
}

const Token = ({ p, size = 18 }: { p: number; size?: number }) => (
  <span className={`checkers-mini p${p}`} style={{ width: size, height: size }} />
)

function Game({ setup, onSetup }: { setup: Setup; onSetup: () => void }) {
  const { players, difficulty } = setup
  // Seen from the human's side when only player 2 is human.
  const flip = players[0].isAI && !players[1].isAI
  const [path, setPath] = useState<number[]>([])
  const duel = useDuel<CheckersState, Move>({
    players,
    initial: initialState,
    turnOf: (s) => s.turn,
    isOver: (s) => s.over,
    apply: applyMove,
    think: (s) => aiMove(s, difficulty),
    aiDelay: 600,
  })
  const { state: s, humanTurn, thinking, over } = duel
  const legal = useMemo(() => (over ? [] : legalMoves(s.board, s.turn)), [s, over])
  const mustCapture = legal.length > 0 && legal[0].captures.length > 0
  const movable = useMemo(() => new Set(legal.map((m) => m.path[0])), [legal])

  // Path is only valid for the current state.
  const [pathFor, setPathFor] = useState(s)
  if (pathFor !== s) {
    setPathFor(s)
    setPath([])
  }

  const candidates = path.length ? legal.filter((m) => path.every((p, i) => m.path[i] === p)) : []
  const targets = new Set(candidates.map((m) => m.path[path.length]).filter((x) => x != null))

  const tap = (i: number) => {
    if (!humanTurn) return
    if (targets.has(i)) {
      const next = [...path, i]
      const done = candidates.find((m) => m.path.length === next.length && m.path.every((p, k) => p === next[k]))
      if (done) duel.play(done)
      else setPath(next)
      return
    }
    if (path.length <= 1 && movable.has(i)) setPath(path[0] === i ? [] : [i])
    else if (path.length > 1 && i === path[path.length - 1]) setPath([path[0]])
    else if (path.length <= 1) setPath([])
  }

  // Display: move the selected piece along the partial path and fade jumped pieces.
  const displayIds = s.ids.slice()
  const displayBoard = s.board.slice()
  if (path.length > 1) {
    const from = path[0]
    const to = path[path.length - 1]
    displayIds[to] = displayIds[from]
    displayBoard[to] = displayBoard[from]
    displayIds[from] = 0
    displayBoard[from] = 0
  }
  const fading = new Set(path.length > 1 ? jumpedAlong(path) : [])
  const lastSquares = new Set(s.last ? s.last.path : [])
  const lastCaps = new Set(s.last ? s.last.captures : [])

  const view = (i: number) => (flip ? 63 - i : i)
  const pieces: { id: number; sq: number; p: number }[] = []
  displayIds.forEach((id, sq) => id && pieces.push({ id, sq, p: displayBoard[sq] }))
  pieces.sort((a, b) => a.id - b.id)

  const [a, b] = pieceCounts(s.board)
  let status = turnText(duel.current, thinking, '차례예요')
  if (humanTurn) {
    if (path.length > 1) status = '계속 뛰어넘어야 해요! 다음 칸을 고르세요'
    else if (mustCapture) status = `${duel.current!.name}: 잡을 수 있는 말은 꼭 잡아야 해요!`
    else if (!path.length) status = `${duel.current!.name} 차례 — 움직일 말을 고르세요`
  }
  if (!over && s.quiet >= DRAW_PLIES - 20) status += ` (무승부까지 ${DRAW_PLIES - s.quiet}수)`

  return (
    <>
      <DuelBar
        players={players}
        turn={s.turn}
        icons={[<Token key="0" p={0} />, <Token key="1" p={1} />]}
        scores={[a, b]}
        thinking={thinking}
        over={over}
      />
      <div className={`status checkers-status ${mustCapture && humanTurn ? 'must' : ''}`}>{over ? '게임 끝!' : status}</div>
      <div className="checkers-board" role="grid" aria-label="체커 판">
        {Array.from({ length: 64 }, (_, v) => {
          const i = view(v)
          const dark = isDark(i)
          const cls = [
            'checkers-sq',
            dark ? 'dark' : 'light',
            lastSquares.has(i) ? 'last' : '',
            lastCaps.has(i) ? 'captured' : '',
            targets.has(i) ? 'target' : '',
            humanTurn && !path.length && movable.has(i) ? 'movable' : '',
            path[0] === i ? 'selected' : '',
            path.includes(i) && path[0] !== i ? 'via' : '',
          ].join(' ')
          return (
            <button key={v} className={cls} disabled={!dark} onClick={() => tap(i)} aria-label={`${(i >> 3) + 1}행 ${(i & 7) + 1}열`}>
              {targets.has(i) && <span className="checkers-dot" />}
            </button>
          )
        })}
        {pieces.map(({ id, sq, p }) => {
          const v = view(sq)
          const owner = ownerOf(p as 0)
          return (
            <span
              key={id}
              className={`checkers-piece p${owner} ${isKing(p as 0) ? 'king' : ''} ${fading.has(sq) ? 'fading' : ''} ${
                path[path.length - 1] === sq && path.length ? 'lifted' : ''
              }`}
              style={{ left: `${(v & 7) * 12.5}%`, top: `${(v >> 3) * 12.5}%` }}
            >
              <span className="checkers-disc">{isKing(p as 0) && '♛'}</span>
            </span>
          )
        })}
      </div>
      <DuelActions canUndo={duel.canUndo} onUndo={duel.undo} onRestart={duel.restart} onSetup={onSetup} />
      {over && (
        <Result
          title={s.winner === -1 ? '무승부!' : `🏆 ${players[s.winner!].name} 승리!`}
          onAgain={duel.restart}
        >
          <p className="muted">
            {s.winner === -1
              ? `서로 ${DRAW_PLIES / 2}수씩 잡기도 전진도 없어서 비겼어요.`
              : `${players[1 - s.winner!].name}에게 움직일 수 있는 말이 남지 않았어요.`}
          </p>
          <button className="btn ghost" onClick={onSetup}>
            설정 바꾸기
          </button>
        </Result>
      )}
    </>
  )
}
