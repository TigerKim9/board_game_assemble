// Outline geometry for the nested shapes (pure, used by canvas + SVG icons).
import { SHAPES, type ShapeDef } from './logic'

/** Inner/outer radius ratio of star outlines. */
export function starRatio(d: ShapeDef): number {
  return d.k <= 10 ? 0.6 : 0.72
}

/** Radius of the largest circle that fits inside the outline (as a fraction of the outer radius). */
export function innerFraction(d: ShapeDef): number {
  if (d.star) return starRatio(d) * Math.cos(Math.PI / d.k) * 0.98
  return Math.cos(Math.PI / d.k)
}

/**
 * Outer radii for `count` nested shapes (index 0 innermost) so each shape sits
 * inside the next one's inner circle. The outermost gets `rMax`.
 */
export function nestedRadii(count: number, rMax: number, gap = 0.93): number[] {
  const r = new Array<number>(count)
  for (let i = count - 1; i >= 0; i--) {
    r[i] = i === count - 1 ? rMax : r[i + 1] * innerFraction(SHAPES[i + 1]) * gap
  }
  return r
}

/** Unit-circle vertex j of a shape (index mod k), angle 0 = up. `dir` = ±1 travel direction. */
export function unitVertex(d: ShapeDef, j: number, rot: number, dir: number): [number, number] {
  const k = d.k
  const jj = ((j % k) + k) % k
  const a = -Math.PI / 2 + rot + (dir * 2 * Math.PI * jj) / k
  const rr = d.star && jj % 2 === 1 ? starRatio(d) : 1
  return [Math.cos(a) * rr, Math.sin(a) * rr]
}

/** SVG polygon points for a small icon. */
export function iconPoints(d: ShapeDef, size: number): string {
  const c = size / 2
  const r = size / 2 - 2
  const pts: string[] = []
  for (let j = 0; j < d.k; j++) {
    const [x, y] = unitVertex(d, j, 0, 1)
    pts.push(`${(c + x * r).toFixed(1)},${(c + y * r + (d.k === 3 ? r * 0.15 : 0)).toFixed(1)}`)
  }
  return pts.join(' ')
}
