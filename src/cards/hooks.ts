/** Small hooks/helpers for card games: stopwatch, time formatting and responsive sizing. */
import { useEffect, useState, type RefObject } from 'react'

/** "3:07" / "1:02:03". */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

/** Seconds elapsed while `running`; resets to 0 whenever `resetKey` changes. */
export function useStopwatch(running: boolean, resetKey: unknown): number {
  const [sec, setSec] = useState(0)
  const [key, setKey] = useState(resetKey)
  if (key !== resetKey) {
    setKey(resetKey)
    setSec(0)
  }
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setSec((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [running, resetKey])
  return sec
}

/** Width (px) of an element, kept up to date with a ResizeObserver. */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback = 360): number {
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

/** Viewport height (px), updated on resize — for fitting tall piles on screen. */
export function useViewportHeight(): number {
  const [h, setH] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight))
  useEffect(() => {
    const on = () => setH(window.innerHeight)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return h
}
