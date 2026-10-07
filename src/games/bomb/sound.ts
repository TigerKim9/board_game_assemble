/** Tiny WebAudio helper: tick beeps and an explosion noise. Fails silently where audio is unavailable. */
export class BombSound {
  private ctx: AudioContext | null = null

  /** Must be called from a user gesture to unlock audio on mobile. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AC) return
        this.ctx = new AC()
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume()
    } catch {
      this.ctx = null
    }
  }

  tick(high = false) {
    const ctx = this.ctx
    if (!ctx) return
    try {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'square'
      o.frequency.value = high ? 1320 : 880
      g.gain.setValueAtTime(0.06, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07)
      o.connect(g).connect(ctx.destination)
      o.start()
      o.stop(ctx.currentTime + 0.08)
    } catch {
      // ignore
    }
  }

  boom() {
    const ctx = this.ctx
    if (!ctx) return
    try {
      const len = Math.floor(ctx.sampleRate * 1.2)
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5)
      const src = ctx.createBufferSource()
      src.buffer = buf
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 900
      const g = ctx.createGain()
      g.gain.value = 0.8
      src.connect(filter).connect(g).connect(ctx.destination)
      src.start()
    } catch {
      // ignore
    }
  }

  close() {
    void this.ctx?.close().catch(() => {})
    this.ctx = null
  }
}
