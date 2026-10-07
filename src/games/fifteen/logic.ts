import { shuffle } from '../../lib/random'

/** Row-major tiles; 0 is the blank. Solved = 1..n²-1 then 0. */
export type Tiles = number[]

export type Dir = 'up' | 'down' | 'left' | 'right'

export function solved(size: number): Tiles {
  return [...Array.from({ length: size * size - 1 }, (_, i) => i + 1), 0]
}

export function isSolved(t: Tiles): boolean {
  return t.every((v, i) => v === (i === t.length - 1 ? 0 : i + 1))
}

export function inversions(t: Tiles): number {
  const a = t.filter((v) => v !== 0)
  let inv = 0
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) inv++
  return inv
}

export function isSolvable(t: Tiles, size: number): boolean {
  const inv = inversions(t)
  if (size % 2 === 1) return inv % 2 === 0
  const blankRowFromBottom = size - Math.floor(t.indexOf(0) / size)
  return (inv + blankRowFromBottom) % 2 === 1
}

/** A random, solvable, unsolved arrangement. */
export function scramble(size: number, rng: () => number = Math.random): Tiles {
  for (;;) {
    const t = shuffle(solved(size), rng)
    if (!isSolvable(t, size)) {
      // Swapping two non-blank tiles flips the parity.
      const a = t.findIndex((v) => v !== 0)
      const b = t.findIndex((v, i) => v !== 0 && i !== a)
      ;[t[a], t[b]] = [t[b], t[a]]
    }
    // Avoid trivially easy boards: require most tiles out of place.
    const misplaced = t.filter((v, i) => v !== 0 && v !== i + 1).length
    if (!isSolved(t) && misplaced >= Math.floor((size * size - 1) * 0.6)) return t
  }
}

/** Tap a tile in the blank's row or column: every tile between slides one step towards the blank. */
export function slideFrom(t: Tiles, size: number, idx: number): { tiles: Tiles; moved: number } | null {
  const blank = t.indexOf(0)
  if (idx === blank || idx < 0 || idx >= t.length) return null
  const br = Math.floor(blank / size)
  const bc = blank % size
  const r = Math.floor(idx / size)
  const c = idx % size
  if (r !== br && c !== bc) return null
  const step = r === br ? (c > bc ? 1 : -1) : c === bc ? (r > br ? size : -size) : 0
  const out = t.slice()
  let cur = blank
  let moved = 0
  while (cur !== idx) {
    out[cur] = out[cur + step]
    cur += step
    moved++
  }
  out[idx] = 0
  return { tiles: out, moved }
}

/** Arrow keys / swipes: move the tile that is on the opposite side of the blank in direction `dir`. */
export function slideDir(t: Tiles, size: number, dir: Dir): { tiles: Tiles; moved: number } | null {
  const blank = t.indexOf(0)
  const br = Math.floor(blank / size)
  const bc = blank % size
  const [r, c] =
    dir === 'left' ? [br, bc + 1] : dir === 'right' ? [br, bc - 1] : dir === 'up' ? [br + 1, bc] : [br - 1, bc]
  if (r < 0 || c < 0 || r >= size || c >= size) return null
  return slideFrom(t, size, r * size + c)
}

/** Tiles that can be tapped (same row or column as the blank). */
export function movable(t: Tiles, size: number): Set<number> {
  const blank = t.indexOf(0)
  const out = new Set<number>()
  t.forEach((_, i) => {
    if (i !== blank && (Math.floor(i / size) === Math.floor(blank / size) || i % size === blank % size)) out.add(i)
  })
  return out
}

// ---------------------------------------------------------------------------
// Procedural pictures for picture mode (SVG data URLs, no image files).

export const THEMES = ['sunset', 'sea', 'night', 'flower'] as const
export type Theme = (typeof THEMES)[number]

export function pictureSvg(theme: Theme, seed: number): string {
  const rnd = (() => {
    let s = seed >>> 0 || 1
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 4294967296
    }
  })()
  const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(((h % 360) + 360) % 360)},${s}%,${l}%)`
  // A diagonal multi-hue backdrop makes every tile look different, even in plain areas.
  const base = (h0: number, spread: number, s: number, l: number) =>
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">${[0, 1, 2, 3]
      .map((k) => `<stop offset="${k / 3}" stop-color="${hsl(h0 + (spread * k) / 3, s, l + (k % 2 ? 8 : 0))}"/>`)
      .join('')}</linearGradient>`
  let defs = ''
  let body = ''
  if (theme === 'sunset') {
    const h = 300 + rnd() * 60
    defs = base(h, 90, 75, 55)
    const mtn = (y: number, amp: number, color: string) => {
      let d = `M0 ${y}`
      for (let x = 0; x <= 100; x += 10) d += ` L${x} ${y - rnd() * amp}`
      return `<path d="${d} L100 100 L0 100Z" fill="${color}"/>`
    }
    body = `<circle cx="${25 + rnd() * 50}" cy="${35 + rnd() * 15}" r="15" fill="#fff4c2" opacity=".9"/>
${[0, 1, 2].map((k) => `<ellipse cx="${rnd() * 100}" cy="${10 + k * 9}" rx="${12 + rnd() * 10}" ry="3" fill="#fff" opacity=".35"/>`).join('')}
${mtn(62, 18, hsl(h + 200, 30, 40))}${mtn(76, 14, hsl(h + 210, 35, 27))}${mtn(90, 8, hsl(h + 220, 40, 15))}`
  } else if (theme === 'sea') {
    const h = 170 + rnd() * 40
    defs = base(h, 60, 70, 55)
    body = `<rect y="50" width="100" height="50" fill="${hsl(h + 20, 75, 28)}" opacity=".75"/>
<circle cx="${15 + rnd() * 70}" cy="20" r="9" fill="#fff3a8"/>
${[0, 1, 2, 3, 4].map((k) => `<path d="M0 ${56 + k * 9} q6 -3 12.5 0 t12.5 0 t12.5 0 t12.5 0 t12.5 0 t12.5 0 t12.5 0 t12.5 0" stroke="#fff" stroke-opacity="${0.6 - k * 0.08}" stroke-width="1.4" fill="none"/>`).join('')}
<path d="M${35 + rnd() * 20} 48 l12 -26 l2 26 z" fill="#fff"/><path d="M${25 + rnd() * 30} 49 h26 l-5 6 h-16z" fill="${hsl(h + 180, 70, 50)}"/>
${[0, 1, 2].map(() => `<path d="M${10 + rnd() * 80} ${10 + rnd() * 25} q3 -3 6 0 q3 -3 6 0" stroke="#333" stroke-width="1" fill="none"/>`).join('')}`
  } else if (theme === 'night') {
    const h = 220 + rnd() * 60
    defs = base(h, 80, 60, 25)
    const stars = Array.from({ length: 45 }, () => `<circle cx="${rnd() * 100}" cy="${rnd() * 75}" r="${0.4 + rnd() * 0.9}" fill="#fff"/>`).join('')
    body = `${stars}<circle cx="${60 + rnd() * 20}" cy="24" r="12" fill="#fdf3c4"/>
<path d="M0 80 Q25 66 50 76 T100 70 V100 H0Z" fill="${hsl(h + 120, 35, 20)}"/>
${Array.from({ length: 7 }, (_, k) => {
  const x = 6 + k * 14 + rnd() * 4
  const hh = 8 + rnd() * 14
  return `<rect x="${x}" y="${88 - hh}" width="8" height="${hh + 12}" fill="#121826"/><rect x="${x + 2}" y="${90 - hh}" width="2" height="2" fill="#ffd86b"/><rect x="${x + 5}" y="${94 - hh}" width="2" height="2" fill="#ffd86b"/>`
}).join('')}`
  } else {
    const h = rnd() * 360
    defs = base(h + 120, 120, 55, 70)
    const flower = (cx: number, cy: number, r: number, hue: number) =>
      Array.from({ length: 8 }, (_, k) => `<ellipse cx="${cx}" cy="${cy - r}" rx="${r * 0.45}" ry="${r}" fill="${hsl(hue, 80, 60 + (k % 2) * 10)}" transform="rotate(${k * 45} ${cx} ${cy})"/>`).join('') +
      `<circle cx="${cx}" cy="${cy}" r="${r * 0.5}" fill="${hsl(hue + 50, 90, 55)}"/>`
    body = `<path d="M50 60 Q48 80 52 100" stroke="#3c8d3c" stroke-width="3" fill="none"/>${flower(50, 45, 18, h)}${flower(18, 78, 9, h + 60)}${flower(84, 20, 8, h + 140)}${flower(82, 82, 10, h + 200)}${flower(16, 18, 7, h + 280)}`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs>${defs}</defs><rect width="100" height="100" fill="url(#bg)"/>${body}</svg>`
}

export function pictureUrl(theme: Theme, seed: number): string {
  return `url("data:image/svg+xml,${encodeURIComponent(pictureSvg(theme, seed))}")`
}
