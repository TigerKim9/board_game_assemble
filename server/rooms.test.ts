import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../src/lib/random'
import type { ServerMsg } from '../src/online/protocol'
import { Lobby } from './rooms'

function setup() {
  let t = 0
  const timers: { at: number; fn: () => void }[] = []
  const lobby = new Lobby({
    rng: mulberry32(1),
    botDelay: 10,
    awayTakeover: 100,
    now: () => t,
    setTimer: (fn, ms) => {
      const timer = { at: t + ms, fn }
      timers.push(timer)
      return timer
    },
    clearTimer: (x) => {
      const i = timers.indexOf(x as (typeof timers)[number])
      if (i >= 0) timers.splice(i, 1)
    },
  })
  const advance = (ms: number) => {
    const end = t + ms
    for (;;) {
      timers.sort((a, b) => a.at - b.at)
      const next = timers[0]
      if (!next || next.at > end) break
      timers.shift()
      t = next.at
      next.fn()
    }
    t = end
  }
  const client = (name: string) => {
    const inbox: ServerMsg[] = []
    const id = lobby.connect(`client-${name}-0000`, name, (m) => inbox.push(m))
    const last = <T extends ServerMsg['t']>(type: T) =>
      [...inbox].reverse().find((m) => m.t === type) as Extract<ServerMsg, { t: T }> | undefined
    return { id, inbox, last, send: (m: Parameters<Lobby['handle']>[1]) => lobby.handle(id, m) }
  }
  return { lobby, client, advance }
}

describe('online lobby', () => {
  it('creates a room, joins with the code, and plays gomoku', () => {
    const { client } = setup()
    const a = client('하나')
    const b = client('둘')
    a.send({ t: 'create', gameId: 'gomoku' })
    const code = a.last('room')!.room.code
    expect(code).toMatch(/^[A-Z2-9]{4}$/)
    b.send({ t: 'join', code: code.toLowerCase() })
    expect(b.last('room')!.you).toBe(1)
    expect(a.last('room')!.room.seats.map((s) => s.name)).toEqual(['하나', '둘'])

    b.send({ t: 'start' })
    expect(b.last('error')!.message).toContain('방장')
    a.send({ t: 'start' })
    expect(a.last('state')!.toAct).toEqual([0])

    b.send({ t: 'act', action: { cell: 0 } })
    expect(b.last('error')!.message).toContain('차례')
    // Black plays a row of five, white plays elsewhere.
    for (let i = 0; i < 5; i++) {
      a.send({ t: 'act', action: { cell: 7 * 15 + i } })
      if (i < 4) b.send({ t: 'act', action: { cell: 0 * 15 + i } })
    }
    const s = b.last('state')!
    expect(s.result?.winners).toEqual([0])
    expect(a.last('room')!.room.status).toBe('over')

    a.send({ t: 'rematch' })
    expect(a.last('state')!.result).toBeNull()
  })

  it('fills seats with bots that play automatically', () => {
    const { client, advance } = setup()
    const a = client('혼자')
    a.send({ t: 'create', gameId: 'gomoku' })
    a.send({ t: 'bot', seat: 1, on: true })
    expect(a.last('room')!.room.seats[1].bot).toBe(true)
    a.send({ t: 'start' })
    a.send({ t: 'act', action: { cell: 112 } })
    advance(50)
    expect(a.last('state')!.toAct).toEqual([0])
    const board = (a.last('state')!.view as { board: number[] }).board
    expect(board.filter((x) => x !== 0)).toHaveLength(2)
  })

  it('reconnects to the same seat and a bot covers a player who stays away', () => {
    const { lobby, client, advance } = setup()
    const a = client('가')
    const b = client('나')
    a.send({ t: 'create', gameId: 'gomoku' })
    b.send({ t: 'join', code: a.last('room')!.room.code })
    a.send({ t: 'start' })
    a.send({ t: 'act', action: { cell: 112 } })
    lobby.disconnect(b.id)
    expect(a.last('room')!.room.seats[1].connected).toBe(false)
    advance(50)
    expect(a.last('state')!.toAct).toEqual([1]) // not yet taken over
    advance(200)
    expect(a.last('state')!.toAct).toEqual([0]) // bot moved for 나

    const inbox: ServerMsg[] = []
    lobby.connect(b.id, '나', (m) => inbox.push(m))
    expect(inbox.some((m) => m.t === 'room' && m.you === 1)).toBe(true)
    expect(inbox.some((m) => m.t === 'state')).toBe(true)
  })

  it('turns a leaving player into a bot and hands over host', () => {
    const { client } = setup()
    const a = client('A')
    const b = client('B')
    a.send({ t: 'create', gameId: 'gomoku' })
    b.send({ t: 'join', code: a.last('room')!.room.code })
    a.send({ t: 'start' })
    a.send({ t: 'leave' })
    const room = b.last('room')!.room
    expect(room.seats[0].bot).toBe(true)
    expect(room.seats[1].isHost).toBe(true)
  })

  it('lets late joiners spectate', () => {
    const { client } = setup()
    const a = client('A')
    const b = client('B')
    const c = client('C')
    a.send({ t: 'create', gameId: 'gomoku' })
    const code = a.last('room')!.room.code
    b.send({ t: 'join', code })
    c.send({ t: 'join', code })
    expect(c.last('room')!.you).toBeNull()
    expect(a.last('room')!.room.spectators).toBe(1)
  })

  it('rejects unknown rooms and games', () => {
    const { client } = setup()
    const a = client('A')
    a.send({ t: 'join', code: 'ZZZZ' })
    expect(a.last('error')!.message).toContain('찾을 수 없')
    a.send({ t: 'create', gameId: 'nope' })
    expect(a.last('error')).toBeDefined()
  })
})
