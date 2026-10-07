import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../lib/random'
import { FAMILIES, canPlace, fitsAnywhere, newGame, place, shapeSize, type Piece, type State } from './logic'

const piece = (shape: [number, number][], id = 99): Piece => ({ id, shape, color: 1 })

function stateWith(board: number[], size: number, tray: (Piece | null)[]): State {
  return { size, board, tray, score: 0, streak: 0, lines: 0, nextId: 100, over: false }
}

describe('block puzzle shapes', () => {
  it('builds rotations without duplicates', () => {
    const fam = (n: string) => FAMILIES.find((f) => f.name === n)!
    expect(fam('I3').shapes).toHaveLength(2)
    expect(fam('O2').shapes).toHaveLength(1)
    expect(fam('corner3').shapes).toHaveLength(4)
    expect(fam('L4').shapes).toHaveLength(8)
    expect(fam('S4').shapes).toHaveLength(4)
    expect(fam('T4').shapes).toHaveLength(4)
  })
  it('shape size', () => {
    expect(shapeSize([[0, 0], [1, 0], [1, 1]])).toEqual({ h: 2, w: 2 })
  })
})

describe('block puzzle placement', () => {
  it('respects bounds and occupied cells', () => {
    const b = Array(64).fill(0)
    b[9] = 1
    expect(canPlace(b, 8, [[0, 0], [0, 1]], 0, 7)).toBe(false)
    expect(canPlace(b, 8, [[0, 0], [1, 0]], 0, 1)).toBe(false)
    expect(canPlace(b, 8, [[0, 0], [1, 0]], 0, 0)).toBe(true)
  })
  it('clears full rows and columns at once and scores combos', () => {
    const n = 8
    const b = Array(n * n).fill(0)
    for (let c = 1; c < n; c++) b[c] = 2 // row 0 missing col 0
    for (let r = 1; r < n; r++) b[r * n] = 3 // col 0 missing row 0
    const s = stateWith(b, n, [piece([[0, 0]]), piece([[0, 0]], 98), null])
    const res = place(s, 0, 0, 0)!
    expect(res.lines).toBe(2)
    expect(res.state.board.every((v) => v === 0)).toBe(true)
    expect(res.allClear).toBe(true)
    expect(res.gained).toBe(1 + 30 + 300)
    expect(res.state.streak).toBe(1)
    expect(res.state.tray[0]).toBeNull()
  })
  it('refills the tray when empty and ends when nothing fits', () => {
    const n = 8
    const s = newGame(n, mulberry32(2))
    const full = Array(n * n).fill(1)
    full[0] = 0
    const st = stateWith(full, n, [piece([[0, 0], [0, 1]]), null, null])
    expect(fitsAnywhere(full, n, [[0, 0]])).toBe(true)
    expect(place(st, 0, 0, 0)).toBeNull()
    expect(s.tray.filter(Boolean)).toHaveLength(3)
    const last = stateWith(Array(n * n).fill(0), n, [piece([[0, 0]]), null, null])
    const r = place(last, 0, 3, 3, mulberry32(1))!
    expect(r.state.tray.filter(Boolean)).toHaveLength(3)
  })
  it('detects game over', () => {
    const n = 8
    const b = Array(n * n).fill(1)
    // Two isolated holes per row/column, so nothing is full and nothing is adjacent.
    for (let i = 0; i < n; i++) {
      b[i * n + ((3 * i) % n)] = 0
      b[i * n + ((3 * i + 4) % n)] = 0
    }
    const s = stateWith(b, n, [piece([[0, 0]]), piece([[0, 0], [1, 0], [2, 0]]), null])
    const r = place(s, 0, 0, 0)!
    // nothing clears, and only isolated cells remain for the I3
    expect(r.state.over).toBe(true)
  })
  it('random play eventually ends', () => {
    const rng = mulberry32(11)
    let s = newGame(8, rng)
    let turns = 0
    while (!s.over && turns < 2000) {
      let done = false
      for (let i = 0; i < 3 && !done; i++) {
        const p = s.tray[i]
        if (!p) continue
        for (let k = 0; k < 64 && !done; k++) {
          const res = place(s, i, Math.floor(k / 8), k % 8, rng)
          if (res) {
            s = res.state
            done = true
          }
        }
      }
      turns++
    }
    expect(s.score).toBeGreaterThan(0)
  })
})
