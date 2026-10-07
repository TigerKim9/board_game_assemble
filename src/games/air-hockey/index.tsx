import { useEffect, useRef, useState } from 'react'
import { PlayerSetup } from '../../components/PlayerSetup'
import { Result } from '../../components/Result'
import { useStored } from '../../lib/storage'
import type { Difficulty, PlayerConfig } from '../../lib/types'
import {
  GOAL_W,
  H,
  MALLET_R,
  PUCK_R,
  W,
  WIN_SCORE,
  aiSpeed,
  aiTarget,
  newAIMemory,
  newGame,
  step,
  type AIMemory,
  type HockeyState,
  type Pt,
} from './logic'
import './air-hockey.css'

interface Config {
  players: PlayerConfig[]
  difficulty: Difficulty
}

const MALLET_COLORS = [
  { main: '#e8504f', dark: '#a8302f', light: '#ff8c8a' },
  { main: '#2f7fd8', dark: '#1d4f8f', light: '#7cb6f5' },
]

export default function AirHockey() {
  const [config, setConfig] = useState<Config | null>(null)
  const [round, setRound] = useState(0)
  if (!config) {
    return (
      <>
        <PlayerSetup
          gameId="air-hockey"
          min={2}
          max={2}
          showDifficulty
          startLabel="경기 시작"
          onStart={(players, difficulty) => setConfig({ players, difficulty })}
        />
        <p className="center muted airh-note">첫 번째 자리는 아래쪽(빨강), 두 번째 자리는 위쪽(파랑)이에요. 둘 다 사람이면 폰을 테이블에 눕혀 놓고 마주 보고 하세요!</p>
      </>
    )
  }
  return <Play key={round} config={config} onAgain={() => setRound((r) => r + 1)} onSetup={() => setConfig(null)} />
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
}

// Tiny synthesized sounds — no audio files.
let audioCtx: AudioContext | null = null
function blip(freq: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  try {
    audioCtx ??= new AudioContext()
    const t = audioCtx.currentTime
    const o = audioCtx.createOscillator()
    const g = audioCtx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur)
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(audioCtx.destination)
    o.start(t)
    o.stop(t + dur)
  } catch {
    // audio unavailable
  }
}

function Play({ config, onAgain, onSetup }: { config: Config; onAgain: () => void; onSetup: () => void }) {
  const { players, difficulty } = config
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<HockeyState>(newGame())
  const targets = useRef<(Pt | null)[]>([null, null])
  const pointers = useRef(new Map<number, number>()) // pointerId → player
  const aiMem = useRef<AIMemory[]>([newAIMemory(), newAIMemory()])
  const pausedRef = useRef(false)
  const [paused, setPaused] = useState(false)
  const [score, setScore] = useState<[number, number]>([0, 0])
  const [winner, setWinner] = useState<number | null>(null)
  const [scale, setScale] = useState(1)
  const [sound, setSound] = useStored('airh:sound', true)
  const soundRef = useRef(sound)
  soundRef.current = sound
  const humans = players.map((p) => !p.isAI)
  const twoHumans = humans[0] && humans[1]

  const setPause = (v: boolean) => {
    if (stateRef.current.winner != null) return
    pausedRef.current = v
    setPaused(v)
  }

  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      const availH = Math.max(300, window.innerHeight - top - 20)
      setScale(Math.min(el.clientWidth / W, availH / H, 1.7))
    }
    fit()
    window.addEventListener('resize', fit)
    const vis = () => document.hidden && setPause(true)
    document.addEventListener('visibilitychange', vis)
    const key = (e: KeyboardEvent) => {
      if (e.code === 'KeyP' || e.code === 'Escape') setPause(!pausedRef.current)
    }
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('resize', fit)
      document.removeEventListener('visibilitychange', vis)
      window.removeEventListener('keydown', key)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let alive = true
    let sparks: Spark[] = []
    let shake = 0
    let goalText: { text: string; t: number; color: string } | null = { text: '시작!', t: 1, color: '#fff' }
    const trail: Pt[] = []
    let puckFlash = 0

    const burst = (x: number, y: number, color: string, n: number, sp: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const v = sp * (0.3 + Math.random())
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.2, color })
      }
    }

    const simulate = (dt: number) => {
      const s = stateRef.current
      const tg = players.map((p, i) => {
        if (!p.isAI) return targets.current[i]
        return aiTarget(s, i, difficulty, aiMem.current[i], dt)
      })
      const speeds = players.map((p, i) => (p.isAI ? aiSpeed(difficulty, aiMem.current[i]) : 2600))
      step(s, dt, tg, speeds)
      for (const e of s.events) {
        if (e.type === 'hit') {
          const strength = Math.min(1, e.power / 1200)
          burst(e.x, e.y, MALLET_COLORS[e.player].light, 4 + Math.round(strength * 14), 80 + strength * 250)
          puckFlash = 0.12 + strength * 0.15
          if (strength > 0.55) shake = Math.max(shake, 0.1 * strength)
          if (soundRef.current) blip(500 + strength * 500, 0.07, 0.08 + strength * 0.25, 'triangle')
          if (!players[e.player].isAI) navigator.vibrate?.(Math.round(8 + strength * 25))
        } else if (e.type === 'wall') {
          if (e.power > 150) {
            burst(e.x, e.y, '#ffffff', 3, 60)
            if (soundRef.current) blip(900, 0.04, Math.min(0.12, e.power / 6000), 'square')
          }
        } else if (e.type === 'goal') {
          const color = MALLET_COLORS[e.scorer].main
          burst(W / 2, e.scorer === 0 ? 0 : H, color, 50, 300)
          shake = 0.4
          goalText = { text: '골!', t: 1.2, color }
          setScore([...s.score] as [number, number])
          if (soundRef.current) {
            blip(660, 0.15, 0.25, 'square')
            setTimeout(() => soundRef.current && blip(880, 0.25, 0.25, 'square'), 120)
          }
          navigator.vibrate?.([60, 40, 100])
        } else if (e.type === 'win') {
          setTimeout(() => alive && setWinner(e.winner), 1200)
        }
      }
    }

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      if (!pausedRef.current) {
        acc += dt
        const h = 1 / 120
        while (acc >= h) {
          acc -= h
          simulate(h)
        }
        for (const sp of sparks) {
          sp.x += sp.vx * dt
          sp.y += sp.vy * dt
          sp.vx *= 0.92
          sp.vy *= 0.92
          sp.life -= dt
        }
        sparks = sparks.filter((sp) => sp.life > 0)
        shake = Math.max(0, shake - dt)
        puckFlash = Math.max(0, puckFlash - dt)
        if (goalText) {
          goalText.t -= dt
          if (goalText.t <= 0) goalText = null
        }
        const p = stateRef.current.puck
        trail.unshift({ x: p.x, y: p.y })
        if (trail.length > 8) trail.pop()
      }
      draw()
    }

    const draw = () => {
      const cv = canvasRef.current
      if (!cv) return
      const k = cv.clientWidth / W
      if (!k) return
      const dpr = window.devicePixelRatio || 1
      const pw = Math.round(cv.clientWidth * dpr)
      if (cv.width !== pw) {
        cv.width = pw
        cv.height = Math.round(cv.clientHeight * dpr)
      }
      const ctx = cv.getContext('2d')!
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0)
      const s = stateRef.current
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 24, (Math.random() - 0.5) * shake * 24)

      // table
      const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, H * 0.7)
      g.addColorStop(0, '#f4fbff')
      g.addColorStop(1, '#d4e6f2')
      ctx.fillStyle = g
      ctx.fillRect(-20, -20, W + 40, H + 40)
      // air holes
      ctx.fillStyle = 'rgba(80,120,150,0.12)'
      for (let y = 15; y < H; y += 22) for (let x = 15 + ((y / 22) % 2) * 11; x < W; x += 22) ctx.fillRect(x, y, 1.6, 1.6)
      // markings
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(220,60,60,0.55)'
      ctx.beginPath()
      ctx.moveTo(0, H / 2)
      ctx.lineTo(W, H / 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(W / 2, H / 2, 46, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(47,127,216,0.45)'
      for (const [y, a0, a1] of [
        [0, 0, Math.PI],
        [H, Math.PI, Math.PI * 2],
      ] as const) {
        ctx.beginPath()
        ctx.arc(W / 2, y, GOAL_W * 0.75, a0, a1)
        ctx.stroke()
      }
      // goals
      for (const [y, i] of [
        [0, 1],
        [H, 0],
      ] as const) {
        ctx.fillStyle = '#1b2430'
        ctx.fillRect(W / 2 - GOAL_W / 2, y === 0 ? -6 : H - 6, GOAL_W, 12)
        ctx.fillStyle = MALLET_COLORS[i].main
        ctx.fillRect(W / 2 - GOAL_W / 2 - 6, y === 0 ? -6 : H - 6, 6, 12)
        ctx.fillRect(W / 2 + GOAL_W / 2, y === 0 ? -6 : H - 6, 6, 12)
      }
      // rails
      ctx.strokeStyle = '#7d8a99'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(W / 2 - GOAL_W / 2, 0)
      ctx.lineTo(0, 0)
      ctx.lineTo(0, H)
      ctx.lineTo(W / 2 - GOAL_W / 2, H)
      ctx.moveTo(W / 2 + GOAL_W / 2, 0)
      ctx.lineTo(W, 0)
      ctx.lineTo(W, H)
      ctx.lineTo(W / 2 + GOAL_W / 2, H)
      ctx.stroke()

      // scores painted on the table
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '900 44px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(232,80,79,0.22)'
      ctx.fillText(String(s.score[0]), W - 34, H / 2 + 36)
      ctx.save()
      ctx.translate(W - 34, H / 2 - 36)
      if (twoHumans) ctx.rotate(Math.PI)
      ctx.fillStyle = 'rgba(47,127,216,0.22)'
      ctx.fillText(String(s.score[1]), 0, 0)
      ctx.restore()

      // puck trail
      const sp = Math.hypot(s.puck.vx, s.puck.vy)
      if (sp > 300) {
        trail.forEach((p, i) => {
          ctx.globalAlpha = 0.18 * (1 - i / trail.length) * Math.min(1, sp / 900)
          ctx.fillStyle = '#222'
          ctx.beginPath()
          ctx.arc(p.x, p.y, PUCK_R * (1 - i / 14), 0, Math.PI * 2)
          ctx.fill()
        })
        ctx.globalAlpha = 1
      }

      // puck
      const p = s.puck
      if (p.y > -PUCK_R * 2 && p.y < H + PUCK_R * 2) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)'
        ctx.beginPath()
        ctx.arc(p.x + 2, p.y + 3, PUCK_R, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = puckFlash > 0 ? '#ffd23f' : '#20252c'
        ctx.beginPath()
        ctx.arc(p.x, p.y, PUCK_R, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(p.x, p.y, PUCK_R * 0.62, 0, Math.PI * 2)
        ctx.stroke()
      }

      // mallets
      s.mallets.forEach((m, i) => {
        const c = MALLET_COLORS[i]
        ctx.fillStyle = 'rgba(0,0,0,0.2)'
        ctx.beginPath()
        ctx.arc(m.x + 3, m.y + 4, MALLET_R, 0, Math.PI * 2)
        ctx.fill()
        const mg = ctx.createRadialGradient(m.x - 7, m.y - 7, 3, m.x, m.y, MALLET_R)
        mg.addColorStop(0, c.light)
        mg.addColorStop(1, c.main)
        ctx.fillStyle = mg
        ctx.beginPath()
        ctx.arc(m.x, m.y, MALLET_R, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = c.dark
        ctx.lineWidth = 2.5
        ctx.stroke()
        ctx.fillStyle = c.dark
        ctx.beginPath()
        ctx.arc(m.x, m.y, MALLET_R * 0.42, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = c.light
        ctx.beginPath()
        ctx.arc(m.x - 2, m.y - 2, MALLET_R * 0.25, 0, Math.PI * 2)
        ctx.fill()
      })

      for (const sk of sparks) {
        ctx.globalAlpha = Math.max(0, sk.life * 2)
        ctx.fillStyle = sk.color
        ctx.beginPath()
        ctx.arc(sk.x, sk.y, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      if (goalText) {
        const a = Math.min(1, goalText.t * 3)
        const sc = 1 + (1.2 - goalText.t) * 0.3
        ctx.save()
        ctx.globalAlpha = a
        ctx.translate(W / 2, H / 2)
        ctx.scale(sc, sc)
        ctx.font = '900 54px system-ui, sans-serif'
        ctx.lineWidth = 6
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'
        ctx.strokeText(goalText.text, 0, 0)
        ctx.fillStyle = goalText.color
        ctx.fillText(goalText.text, 0, 0)
        ctx.restore()
      }
      if (pausedRef.current) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = '#fff'
        ctx.font = '800 30px system-ui, sans-serif'
        ctx.fillText('일시정지', W / 2, H / 2 - 10)
        ctx.font = '15px system-ui, sans-serif'
        ctx.fillText('화면을 누르면 계속해요', W / 2, H / 2 + 24)
      }
    }

    raf = requestAnimationFrame(loop)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Multi-touch: each finger controls the mallet on the half where it started.
  const toTable = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }
  const onDown = (e: React.PointerEvent) => {
    if (pausedRef.current) {
      setPause(false)
      return
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const pt = toTable(e)
    let player = pt.y > H / 2 ? 0 : 1
    if (!humans[player]) player = 1 - player
    if (!humans[player]) return
    pointers.current.set(e.pointerId, player)
    // Grab offset: put the mallet slightly above the finger on touch so it stays visible.
    targets.current[player] = adjust(pt, player, e.pointerType)
  }
  const onMove = (e: React.PointerEvent) => {
    let player = pointers.current.get(e.pointerId)
    if (player == null) {
      // hovering mouse controls the bottom player (vs AI) without clicking
      if (e.pointerType !== 'mouse' || !humans[0] || twoHumans) return
      player = 0
    }
    targets.current[player] = adjust(toTable(e), player, e.pointerType)
  }
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
  }

  const title = winner == null ? '' : `🏆 ${players[winner].name} 승리!`
  return (
    <div className="airh-game">
      <div className="airh-hud">
        <span className="airh-name" style={{ color: MALLET_COLORS[1].main }}>
          {players[1].isAI ? '🤖 ' : ''}
          {players[1].name}
        </span>
        <span className="airh-score">
          <b style={{ color: MALLET_COLORS[1].main }}>{score[1]}</b> : <b style={{ color: MALLET_COLORS[0].main }}>{score[0]}</b>
        </span>
        <span className="airh-name" style={{ color: MALLET_COLORS[0].main }}>
          {players[0].isAI ? '🤖 ' : ''}
          {players[0].name}
        </span>
        <button className="btn small airh-icon" onClick={() => setSound(!sound)} aria-label={sound ? '소리 끄기' : '소리 켜기'}>
          {sound ? '🔊' : '🔇'}
        </button>
        <button className="btn small airh-icon" onClick={() => setPause(!paused)} aria-label={paused ? '계속하기' : '일시정지'}>
          {paused ? '▶' : '⏸'}
        </button>
      </div>
      <div className="airh-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="airh-canvas"
          style={{ width: W * scale, height: H * scale }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        {winner != null && (
          <div className="airh-result">
            <Result title={title} onAgain={onAgain}>
              <p className="airh-final">
                <b style={{ color: MALLET_COLORS[0].main }}>{score[0]}</b> : <b style={{ color: MALLET_COLORS[1].main }}>{score[1]}</b>
              </p>
              <p className="muted airh-final-names">
                {players[0].name} : {players[1].name}
              </p>
              <p>{players[winner].isAI ? '아쉬워요! 다시 도전해 볼까요?' : `${WIN_SCORE}점 먼저 달성!`}</p>
              <button className="btn ghost" onClick={onSetup}>
                설정으로
              </button>
            </Result>
          </div>
        )}
      </div>
    </div>
  )
}

function adjust(pt: Pt, player: number, pointerType: string): Pt {
  if (pointerType !== 'touch') return pt
  const off = MALLET_R * 0.9
  return { x: pt.x, y: player === 0 ? pt.y - off : pt.y + off }
}
