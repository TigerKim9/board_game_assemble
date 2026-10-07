import { useEffect, useRef, useState } from 'react'
import { Result } from '../../components/Result'
import { useBestScore, useStored } from '../../lib/storage'
import type { Difficulty } from '../../lib/types'
import {
  COLS,
  HIDDEN,
  ROWS,
  SHAPES,
  aiStep,
  createPlayer,
  exchangeGarbage,
  ghostY,
  hardDrop,
  holdPiece,
  move,
  newController,
  rotate,
  tick,
  type AIController,
  type PieceType,
  type Player,
} from './logic'
import './blocks.css'

type Mode = 'solo' | 'versus'
interface Config {
  mode: Mode
  difficulty: Difficulty
  startLevel: number
}

const COLORS = ['', '#3cc7e6', '#f5c84c', '#a86ee0', '#6cc36a', '#e8575a', '#4a7fe0', '#f0943f', '#7d8590']
const TYPE_COLOR: Record<PieceType, string> = { I: COLORS[1], O: COLORS[2], T: COLORS[3], S: COLORS[4], Z: COLORS[5], J: COLORS[6], L: COLORS[7] }
const VIS = ROWS - HIDDEN
const DAS = 0.16
const ARR = 0.045

export default function Blocks() {
  const [config, setConfig] = useState<Config | null>(null)
  const [round, setRound] = useState(0)
  const [mode, setMode] = useStored<Mode>('blocks:mode', 'solo')
  const [difficulty, setDifficulty] = useStored<Difficulty>('setup:blocks:diff', 'normal')
  const [startLevel, setStartLevel] = useStored('blocks:level', 1)
  const { best } = useBestScore('blocks')

  if (!config) {
    return (
      <div className="setup card-panel">
        <div className="setup-row">
          <span>모드</span>
          <div className="segmented">
            <button className={mode === 'solo' ? 'active' : ''} onClick={() => setMode('solo')}>
              혼자 하기
            </button>
            <button className={mode === 'versus' ? 'active' : ''} onClick={() => setMode('versus')}>
              🤖 컴퓨터와 대결
            </button>
          </div>
        </div>
        {mode === 'versus' && (
          <div className="setup-row">
            <span>난이도</span>
            <div className="segmented">
              {(['easy', 'normal', 'hard'] as const).map((d) => (
                <button key={d} className={difficulty === d ? 'active' : ''} onClick={() => setDifficulty(d)}>
                  {d === 'easy' ? '쉬움' : d === 'normal' ? '보통' : '어려움'}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="setup-row">
          <span>시작 레벨</span>
          <div className="segmented">
            {[1, 5, 10].map((l) => (
              <button key={l} className={startLevel === l ? 'active' : ''} onClick={() => setStartLevel(l)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <p className="muted blocks-note">
          {mode === 'solo'
            ? `줄을 지워 점수를 모으세요. 10줄마다 빨라져요.${best != null ? ` 최고 기록 ${best}점` : ''}`
            : '두 줄 이상 한 번에 지우면 상대에게 방해 줄을 보내요. 먼저 꼭대기까지 차면 져요!'}
        </p>
        <button className="btn primary big" onClick={() => setConfig({ mode, difficulty, startLevel })}>
          게임 시작
        </button>
      </div>
    )
  }
  return <Play key={round} config={config} onAgain={() => setRound((r) => r + 1)} onSetup={() => setConfig(null)} />
}

interface Popup {
  text: string
  sub?: string
  t: number
}
interface Flash {
  rows: number[]
  t: number
}
interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
}

interface Outcome {
  win: boolean | null
  score: number
  lines: number
  level: number
  newBest: boolean
}

type Btn = 'left' | 'right' | 'soft'

function Play({ config, onAgain, onSetup }: { config: Config; onAgain: () => void; onSetup: () => void }) {
  const versus = config.mode === 'versus'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const me = useRef<Player>(createPlayer(Math.random, config.startLevel))
  const ai = useRef<Player | null>(versus ? createPlayer(Math.random, config.startLevel) : null)
  const aiCtrl = useRef<AIController>(newController())
  const held = useRef<Record<Btn, boolean>>({ left: false, right: false, soft: false })
  const das = useRef({ dir: 0, t: 0 })
  const pausedRef = useRef(false)
  const phase = useRef<'ready' | 'play' | 'over'>('ready')
  const readyT = useRef(1.4)
  const [paused, setPaused] = useState(false)
  const [cell, setCell] = useState(20)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const { best, submit } = useBestScore('blocks')
  const submitRef = useRef(submit)
  submitRef.current = submit

  const setPause = (v: boolean) => {
    if (phase.current === 'over') return
    pausedRef.current = v
    setPaused(v)
  }
  const canAct = () => phase.current === 'play' && !pausedRef.current && !me.current.over

  const act = (a: 'left' | 'right' | 'cw' | 'ccw' | 'hold' | 'hard' | 'soft1') => {
    if (!canAct()) return
    const p = me.current
    switch (a) {
      case 'left':
        move(p, -1)
        break
      case 'right':
        move(p, 1)
        break
      case 'cw':
        rotate(p, 1)
        break
      case 'ccw':
        rotate(p, -1)
        break
      case 'hold':
        holdPiece(p)
        break
      case 'hard':
        hardDrop(p)
        break
      case 'soft1':
        if (p.piece) {
          const pc = p.piece
          if (ghostY(p) > pc.y) {
            pc.y++
            p.score += 1
            p.gravityAcc = 0
          }
        }
        break
    }
  }
  const press = (b: Btn, down: boolean) => {
    held.current[b] = down
    if (b === 'soft') return
    if (down) {
      act(b)
      das.current = { dir: b === 'left' ? -1 : 1, t: 0 }
    } else if (das.current.dir === (b === 'left' ? -1 : 1)) {
      const other = b === 'left' ? 'right' : 'left'
      das.current = { dir: held.current[other] ? (other === 'left' ? -1 : 1) : 0, t: 0 }
    }
  }

  // Sizing
  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      const availH = window.innerHeight - top - 128
      const c = Math.floor(Math.min(el.clientWidth / 15.6, Math.max(300, availH) / VIS, 34))
      setCell(Math.max(12, c))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const c = e.code
      const keyMap: Record<string, () => void> = {
        ArrowLeft: () => !e.repeat && press('left', true),
        ArrowRight: () => !e.repeat && press('right', true),
        ArrowDown: () => (held.current.soft = true),
        ArrowUp: () => !e.repeat && act('cw'),
        KeyX: () => !e.repeat && act('cw'),
        KeyZ: () => !e.repeat && act('ccw'),
        ControlLeft: () => !e.repeat && act('ccw'),
        KeyC: () => !e.repeat && act('hold'),
        ShiftLeft: () => !e.repeat && act('hold'),
        ShiftRight: () => !e.repeat && act('hold'),
        Space: () => !e.repeat && act('hard'),
        KeyP: () => !e.repeat && setPause(!pausedRef.current),
        Escape: () => !e.repeat && setPause(!pausedRef.current),
      }
      const f = keyMap[c]
      if (f) {
        e.preventDefault()
        f()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft') press('left', false)
      else if (e.code === 'ArrowRight') press('right', false)
      else if (e.code === 'ArrowDown') held.current.soft = false
    }
    const vis = () => document.hidden && setPause(true)
    const blur = () => {
      held.current = { left: false, right: false, soft: false }
      das.current = { dir: 0, t: 0 }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', vis)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', vis)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Loop
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let alive = true
    let popups: Popup[] = []
    let flashes: Flash[] = []
    let sparks: Spark[] = []
    let shake = 0
    let aiShake = 0
    let ended = false

    const finish = (win: boolean | null) => {
      if (ended) return
      ended = true
      phase.current = 'over'
      const p = me.current
      const newBest = !versus && p.score > 0 ? submitRef.current(p.score) : false
      setTimeout(
        () => alive && setOutcome({ win, score: p.score, lines: p.lines, level: p.level, newBest }),
        900,
      )
    }

    const handleEvents = (p: Player, isMe: boolean) => {
      for (const e of p.events) {
        if (e.type === 'clear' && isMe) {
          if (e.count) flashes.push({ rows: e.rows, t: 0.3 })
          const sub = [e.b2b ? '연속 보너스' : '', e.combo > 0 ? `${e.combo} 콤보` : ''].filter(Boolean).join(' · ')
          if (e.count >= 2 || e.tspin || e.combo > 0) popups.push({ text: e.label || '콤보', sub, t: 1.1 })
          for (const r of e.rows)
            for (let i = 0; i < 10; i++)
              sparks.push({
                x: Math.random() * COLS,
                y: r - HIDDEN + 0.5,
                vx: (Math.random() - 0.5) * 8,
                vy: -Math.random() * 6,
                life: 0.6,
                color: COLORS[1 + Math.floor(Math.random() * 7)],
              })
          if (e.count >= 4) shake = 0.25
          navigator.vibrate?.(e.count >= 4 ? 40 : 15)
        } else if (e.type === 'garbage') {
          if (isMe) {
            shake = 0.3
            navigator.vibrate?.([30, 30, 30])
          } else aiShake = 0.3
        } else if (e.type === 'level' && isMe) {
          popups.push({ text: `레벨 ${e.level}`, sub: '속도 UP!', t: 1.3 })
        } else if (e.type === 'hard' && isMe && e.distance > 2) {
          shake = Math.max(shake, 0.06)
        }
      }
      p.events = []
    }

    const simulate = (dt: number) => {
      const p = me.current
      const o = ai.current
      if (phase.current === 'ready') {
        readyT.current -= dt
        if (readyT.current <= 0) phase.current = 'play'
        return
      }
      if (phase.current !== 'play') return
      // DAS / ARR
      const d = das.current
      if (d.dir) {
        d.t += dt
        while (d.t >= DAS) {
          if (!move(p, d.dir)) {
            d.t = DAS
            break
          }
          d.t -= ARR
        }
      }
      tick(p, dt, held.current.soft)
      if (o) {
        aiStep(o, aiCtrl.current, dt, config.difficulty)
        tick(o, dt)
        exchangeGarbage(p, o)
        handleEvents(o, false)
      }
      handleEvents(p, true)
      if (p.over) finish(versus ? false : null)
      else if (o?.over) finish(true)
    }

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      if (!pausedRef.current) {
        simulate(dt)
        for (const s of sparks) {
          s.x += s.vx * dt
          s.y += s.vy * dt
          s.vy += 18 * dt
          s.life -= dt
        }
        sparks = sparks.filter((s) => s.life > 0)
        popups.forEach((pp) => (pp.t -= dt))
        popups = popups.filter((pp) => pp.t > 0)
        flashes.forEach((f) => (f.t -= dt))
        flashes = flashes.filter((f) => f.t > 0)
        shake = Math.max(0, shake - dt)
        aiShake = Math.max(0, aiShake - dt)
      }
      draw()
    }

    const draw = () => {
      const cv = canvasRef.current
      if (!cv) return
      const c = cv.clientWidth / 15.6
      if (!c) return
      const dpr = window.devicePixelRatio || 1
      const pw = Math.round(cv.clientWidth * dpr)
      if (cv.width !== pw) {
        cv.width = pw
        cv.height = Math.round(cv.clientHeight * dpr)
      }
      const ctx = cv.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const W = cv.clientWidth
      const Hh = cv.clientHeight
      ctx.fillStyle = '#1a1f2b'
      ctx.fillRect(0, 0, W, Hh)
      ctx.textBaseline = 'middle'
      const p = me.current
      const bx = 0.5 * c
      ctx.save()
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 16, (Math.random() - 0.5) * shake * 16)

      // garbage meter
      ctx.fillStyle = '#0d1018'
      ctx.fillRect(0, 0, 0.36 * c, VIS * c)
      if (p.pending > 0) {
        const h = Math.min(VIS, p.pending) * c
        ctx.fillStyle = '#e8575a'
        ctx.fillRect(0, VIS * c - h, 0.36 * c, h)
      }

      // board
      ctx.fillStyle = '#11151f'
      ctx.fillRect(bx, 0, COLS * c, VIS * c)
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'
      ctx.lineWidth = 1
      for (let x = 1; x < COLS; x++) {
        ctx.beginPath()
        ctx.moveTo(bx + x * c, 0)
        ctx.lineTo(bx + x * c, VIS * c)
        ctx.stroke()
      }
      for (let y = 1; y < VIS; y++) {
        ctx.beginPath()
        ctx.moveTo(bx, y * c)
        ctx.lineTo(bx + COLS * c, y * c)
        ctx.stroke()
      }
      for (let y = HIDDEN; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          const v = p.board[y][x]
          if (v) drawCell(ctx, bx + x * c, (y - HIDDEN) * c, c, COLORS[v], p.over ? 0.5 : 1)
        }
      if (p.piece && !p.over) {
        const pc = p.piece
        const gy = ghostY(p)
        const col = TYPE_COLOR[pc.type]
        for (const [cx, cy] of SHAPES[pc.type][pc.rot]) {
          const y = gy + cy - HIDDEN
          if (y < 0) continue
          ctx.strokeStyle = col
          ctx.globalAlpha = 0.55
          ctx.lineWidth = 2
          ctx.strokeRect(bx + (pc.x + cx) * c + 2, y * c + 2, c - 4, c - 4)
          ctx.globalAlpha = 0.12
          ctx.fillStyle = col
          ctx.fillRect(bx + (pc.x + cx) * c + 2, y * c + 2, c - 4, c - 4)
          ctx.globalAlpha = 1
        }
        for (const [cx, cy] of SHAPES[pc.type][pc.rot]) {
          const y = pc.y + cy - HIDDEN
          if (y < 0) continue
          drawCell(ctx, bx + (pc.x + cx) * c, y * c, c, col, 1)
        }
      }
      for (const f of flashes) {
        ctx.fillStyle = `rgba(255,255,255,${f.t / 0.3})`
        // rows were removed; flash their former positions
        for (const r of f.rows) ctx.fillRect(bx, (r - HIDDEN) * c, COLS * c, c)
      }
      for (const s of sparks) {
        ctx.globalAlpha = Math.max(0, s.life / 0.6)
        ctx.fillStyle = s.color
        ctx.fillRect(bx + s.x * c - 2, s.y * c - 2, 4, 4)
      }
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 2
      ctx.strokeRect(bx - 1, -1, COLS * c + 2, VIS * c + 2)

      // popups
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      popups.forEach((pp, i) => {
        const a = Math.min(1, pp.t / 0.3)
        const y = VIS * c * 0.38 - (1.1 - pp.t) * c * 1.2 + i * c * 2.2
        ctx.globalAlpha = a
        ctx.fillStyle = '#fff'
        ctx.font = `900 ${c * 1.2}px system-ui, sans-serif`
        ctx.lineWidth = 4
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'
        ctx.strokeText(pp.text, bx + COLS * c * 0.5, y)
        ctx.fillText(pp.text, bx + COLS * c * 0.5, y)
        if (pp.sub) {
          ctx.font = `700 ${c * 0.6}px system-ui, sans-serif`
          ctx.fillStyle = '#f5c84c'
          ctx.fillText(pp.sub, bx + COLS * c * 0.5, y + c * 0.95)
        }
        ctx.globalAlpha = 1
      })
      ctx.restore()

      // side panel
      const sx = bx + COLS * c + 0.4 * c
      const sw = 4.4 * c
      const label = (text: string, y: number) => {
        ctx.fillStyle = 'rgba(160,170,190,0.95)'
        ctx.font = `700 ${c * 0.48}px system-ui, sans-serif`
        ctx.textAlign = 'left'
        ctx.fillText(text, sx + 0.1 * c, y)
      }
      const box = (y: number, h: number) => {
        ctx.fillStyle = '#11151f'
        rr(ctx, sx, y, sw, h, 6)
        ctx.fill()
      }
      const o = ai.current
      // Compact layout in versus to leave room for the opponent board.
      const L = o
        ? { holdBox: 0.75, holdH: 2, nextLabel: 3.15, nextBox: 3.5, nextH: 5.1, gap: 1.65, mini: 0.5 }
        : { holdBox: 0.75, holdH: 2.4, nextLabel: 3.55, nextBox: 3.9, nextH: 6.4, gap: 2.05, mini: 0.52 }
      label('보관 (홀드)', 0.4 * c)
      box(L.holdBox * c, L.holdH * c)
      if (p.hold) drawMini(ctx, p.hold, sx + sw / 2, (L.holdBox + L.holdH / 2) * c, c * 0.6, p.canHold ? 1 : 0.35)
      label('다음', L.nextLabel * c)
      box(L.nextBox * c, L.nextH * c)
      p.queue
        .slice(0, 3)
        .forEach((t, i) => drawMini(ctx, t, sx + sw / 2, (L.nextBox + 1.05 + i * L.gap) * c, c * (i === 0 ? 0.6 : L.mini), 1))

      const stat = (name: string, value: string, y: number) => {
        ctx.textAlign = 'left'
        ctx.fillStyle = 'rgba(160,170,190,0.95)'
        ctx.font = `600 ${c * 0.45}px system-ui, sans-serif`
        ctx.fillText(name, sx + 0.1 * c, y)
        ctx.fillStyle = '#fff'
        ctx.font = `800 ${c * 0.7}px system-ui, sans-serif`
        ctx.fillText(value, sx + 0.1 * c, y + 0.62 * c)
      }
      if (!o) {
        stat('점수', String(p.score), 11 * c)
        stat('레벨', String(p.level), 12.9 * c)
        stat('줄', String(p.lines), 14.8 * c)
        if (best != null) stat('최고', String(Math.max(best, p.score)), 16.7 * c)
      } else {
        stat('점수', String(p.score), 9.15 * c)
        ctx.fillStyle = 'rgba(160,170,190,0.95)'
        ctx.font = `600 ${c * 0.42}px system-ui, sans-serif`
        ctx.fillText(`레벨 ${p.level} · ${p.lines}줄`, sx + 0.1 * c, 10.6 * c)
        // opponent mini board
        const m = c * 0.4
        const ox = sx + (sw - COLS * m) / 2
        const oy = VIS * c - VIS * m
        label('🤖 상대', oy - 0.4 * c)
        ctx.save()
        if (aiShake > 0) ctx.translate((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5)
        ctx.fillStyle = '#11151f'
        ctx.fillRect(ox, oy, COLS * m, VIS * m)
        for (let y = HIDDEN; y < ROWS; y++)
          for (let x = 0; x < COLS; x++) {
            const v = o.board[y][x]
            if (v) {
              ctx.fillStyle = COLORS[v]
              ctx.globalAlpha = o.over ? 0.4 : 1
              ctx.fillRect(ox + x * m, oy + (y - HIDDEN) * m, m - 0.5, m - 0.5)
            }
          }
        if (o.piece && !o.over) {
          ctx.fillStyle = TYPE_COLOR[o.piece.type]
          for (const [cx, cy] of SHAPES[o.piece.type][o.piece.rot]) {
            const y = o.piece.y + cy - HIDDEN
            if (y >= 0) ctx.fillRect(ox + (o.piece.x + cx) * m, oy + y * m, m - 0.5, m - 0.5)
          }
        }
        ctx.globalAlpha = 1
        if (o.pending > 0) {
          ctx.fillStyle = '#e8575a'
          const h = Math.min(VIS, o.pending) * m
          ctx.fillRect(ox - 3, oy + VIS * m - h, 2, h)
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'
        ctx.lineWidth = 1
        ctx.strokeRect(ox - 0.5, oy - 0.5, COLS * m + 1, VIS * m + 1)
        if (o.over) {
          ctx.fillStyle = '#fff'
          ctx.textAlign = 'center'
          ctx.font = `800 ${c * 0.6}px system-ui, sans-serif`
          ctx.fillText('KO!', ox + (COLS * m) / 2, oy + (VIS * m) / 2)
        }
        ctx.restore()
      }

      // overlays
      ctx.textAlign = 'center'
      if (phase.current === 'ready' || pausedRef.current) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillRect(bx, 0, COLS * c, VIS * c)
        ctx.fillStyle = '#fff'
        ctx.font = `900 ${c * 1.3}px system-ui, sans-serif`
        const txt = pausedRef.current ? '일시정지' : readyT.current > 0.5 ? '준비…' : '시작!'
        ctx.fillText(txt, bx + (COLS * c) / 2, (VIS * c) / 2)
      }
      if (p.over) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(bx, 0, COLS * c, VIS * c)
        ctx.fillStyle = '#fff'
        ctx.font = `900 ${c * 1.2}px system-ui, sans-serif`
        ctx.fillText('게임 오버', bx + (COLS * c) / 2, (VIS * c) / 2)
      }
    }

    raf = requestAnimationFrame(loop)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Board gestures: drag sideways to move, drag down to soft drop, flick down = hard drop, flick up = hold, tap = rotate.
  const gesture = useRef<{ id: number; x0: number; y0: number; ax: number; ay: number; t0: number; moved: boolean } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    if (pausedRef.current) {
      setPause(false)
      return
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ax: e.clientX, ay: e.clientY, t0: performance.now(), moved: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    const step = cell * 0.9
    while (e.clientX - g.ax >= step) {
      act('right')
      g.ax += step
      g.moved = true
    }
    while (g.ax - e.clientX >= step) {
      act('left')
      g.ax -= step
      g.moved = true
    }
    const dt = performance.now() - g.t0
    // slow downward drag = soft drop (fast flicks are handled on release)
    if (dt > 120) {
      while (e.clientY - g.ay >= step) {
        act('soft1')
        g.ay += step
        g.moved = true
      }
    }
    if (Math.abs(e.clientY - g.y0) > 12) g.moved = true
  }
  const onUp = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    gesture.current = null
    const dt = performance.now() - g.t0
    const dx = e.clientX - g.x0
    const dy = e.clientY - g.y0
    const fast = dt < 260
    if (fast && dy > cell * 2.2 && Math.abs(dy) > Math.abs(dx) * 1.5) act('hard')
    else if (fast && -dy > cell * 2.2 && Math.abs(dy) > Math.abs(dx) * 1.5) act('hold')
    else if (!g.moved && Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 350) {
      const r = canvasRef.current!.getBoundingClientRect()
      const boardMid = r.left + 0.5 * cell + 5 * cell
      act(e.clientX < boardMid - cell * 2.5 ? 'ccw' : 'cw')
    }
  }

  const hold = (b: Btn) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      press(b, true)
    },
    onPointerUp: () => press(b, false),
    onPointerCancel: () => press(b, false),
    onLostPointerCapture: () => held.current[b] && press(b, false),
  })
  const tap = (a: Parameters<typeof act>[0]) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      act(a)
    },
  })

  const W = cell * 15.6
  const H = cell * VIS
  return (
    <div className="blocks-game">
      <div className="blocks-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="blocks-canvas"
          style={{ width: W, height: H }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        {outcome && (
          <div className="blocks-result">
            <Result
              title={outcome.win === null ? `${outcome.score}점!` : outcome.win ? '🏆 승리!' : '😵 패배…'}
              onAgain={onAgain}
            >
              <p>
                {outcome.lines}줄 · 레벨 {outcome.level}
                {versus ? ` · ${outcome.score}점` : ''}
                <br />
                {!versus && (outcome.newBest ? '🎉 새로운 최고 기록!' : best != null ? `최고 기록: ${best}점` : '')}
                {versus && (outcome.win ? '컴퓨터를 꼭대기까지 밀어 올렸어요!' : '다음엔 여러 줄을 한 번에 지워 반격해 보세요.')}
              </p>
              <button className="btn ghost" onClick={onSetup}>
                설정으로
              </button>
            </Result>
          </div>
        )}
      </div>
      <div className="blocks-controls" style={{ maxWidth: Math.max(W, 300) }}>
        <button className="blocks-btn" {...tap('hold')} aria-label="보관">
          <small>홀드</small>⇄
        </button>
        <button className="blocks-btn" {...tap('ccw')} aria-label="왼쪽으로 회전">
          ⟲
        </button>
        <button className="blocks-btn" {...tap('cw')} aria-label="오른쪽으로 회전">
          ⟳
        </button>
        <button className="blocks-btn ghost" onClick={() => setPause(!paused)} aria-label={paused ? '계속하기' : '일시정지'}>
          {paused ? '▶' : '⏸'}
        </button>
        <button className="blocks-btn" {...hold('left')} aria-label="왼쪽">
          ◀
        </button>
        <button className="blocks-btn" {...hold('soft')} aria-label="천천히 내리기">
          ▼
        </button>
        <button className="blocks-btn" {...hold('right')} aria-label="오른쪽">
          ▶
        </button>
        <button className="blocks-btn accent" {...tap('hard')} aria-label="바로 내리기">
          ⤓
        </button>
      </div>
    </div>
  )
}

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, c: number, color: string, alpha: number) {
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(x + 1, y + 1, c - 2, c - 2)
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.fillRect(x + 1, y + 1, c - 2, Math.max(2, c * 0.16))
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.fillRect(x + 1, y + c - 1 - Math.max(2, c * 0.12), c - 2, Math.max(2, c * 0.12))
  ctx.globalAlpha = 1
}

function drawMini(ctx: CanvasRenderingContext2D, t: PieceType, cx: number, cy: number, s: number, alpha: number) {
  const cells = SHAPES[t][0]
  const xs = cells.map((c) => c[0])
  const ys = cells.map((c) => c[1])
  const w = Math.max(...xs) - Math.min(...xs) + 1
  const h = Math.max(...ys) - Math.min(...ys) + 1
  const ox = cx - (w * s) / 2 - Math.min(...xs) * s
  const oy = cy - (h * s) / 2 - Math.min(...ys) * s
  for (const [x, y] of cells) drawCell(ctx, ox + x * s, oy + y * s, s, TYPE_COLOR[t], alpha)
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
