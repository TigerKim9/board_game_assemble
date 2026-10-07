// Room manager: pure game-room logic with no networking, so it can be unit-tested.
// The WebSocket layer (server/index.ts) feeds it messages and gives each client a `send` function.

import { IllegalAction, type OnlineGame, type Rng } from '../src/online/engine'
import { ONLINE_GAMES } from '../src/online/games/index'
import { ROOM_CODE_LENGTH, type ClientMsg, type RoomInfo, type ServerMsg } from '../src/online/protocol'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I
const BOT_NAMES = ['컴퓨터 A', '컴퓨터 B', '컴퓨터 C', '컴퓨터 D', '컴퓨터 E', '컴퓨터 F', '컴퓨터 G', '컴퓨터 H', '컴퓨터 I']

export interface LobbyOptions {
  rng?: Rng
  /** Delay before a bot moves (ms). */
  botDelay?: number
  /** A disconnected player's turns are played by a bot after this long (ms). */
  awayTakeover?: number
  /** Rooms with no connected humans are removed after this long (ms). */
  roomTtl?: number
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (t: unknown) => void
}

interface Client {
  id: string
  name: string
  send: (msg: ServerMsg) => void
  connected: boolean
  room: string | null
  awaySince: number | null
}

interface Seat {
  clientId: string | null
  bot: boolean
  name: string
}

interface Room {
  code: string
  game: OnlineGame<any, any, any>
  hostId: string
  seats: Seat[]
  spectators: Set<string>
  status: 'lobby' | 'playing' | 'over'
  state: unknown
  version: number
  timer: unknown
  emptySince: number | null
}

export class Lobby {
  private clients = new Map<string, Client>()
  private rooms = new Map<string, Room>()
  private rng: Rng
  private botDelay: number
  private awayTakeover: number
  private roomTtl: number
  private now: () => number
  private setTimer: (fn: () => void, ms: number) => unknown
  private clearTimer: (t: unknown) => void

  constructor(opts: LobbyOptions = {}) {
    this.rng = opts.rng ?? Math.random
    this.botDelay = opts.botDelay ?? 800
    this.awayTakeover = opts.awayTakeover ?? 30_000
    this.roomTtl = opts.roomTtl ?? 15 * 60_000
    this.now = opts.now ?? Date.now
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>))
  }

  get roomCount() {
    return this.rooms.size
  }

  /** A socket connected and said hello. Returns the client id to bind the socket to. */
  connect(clientId: string, name: string, send: (msg: ServerMsg) => void): string {
    const id = /^[\w-]{8,64}$/.test(clientId) ? clientId : this.newId()
    let c = this.clients.get(id)
    if (c) {
      c.send = send
      c.connected = true
      c.awaySince = null
      c.name = cleanName(name) || c.name
    } else {
      c = { id, name: cleanName(name) || '손님', send, connected: true, room: null, awaySince: null }
      this.clients.set(id, c)
    }
    send({ t: 'welcome', clientId: id })
    const room = c.room ? this.rooms.get(c.room) : undefined
    if (room) {
      room.emptySince = null
      const seat = room.seats.find((s) => s.clientId === id)
      if (seat) seat.name = c.name
      this.broadcastRoom(room)
      this.sendState(room, c)
      this.schedule(room)
    } else c.room = null
    return id
  }

  disconnect(clientId: string) {
    const c = this.clients.get(clientId)
    if (!c) return
    c.connected = false
    c.awaySince = this.now()
    const room = c.room ? this.rooms.get(c.room) : undefined
    if (!room) {
      this.clients.delete(clientId)
      return
    }
    if (room.status === 'lobby') {
      this.leave(c)
      return
    }
    this.broadcastRoom(room)
    if (!this.hasConnectedHuman(room)) room.emptySince = this.now()
    // Let a bot take over this player's turns if they stay away.
    this.setTimer(() => this.schedule(room), this.awayTakeover + 10)
  }

  handle(clientId: string, msg: ClientMsg) {
    const c = this.clients.get(clientId)
    if (!c) return
    try {
      this.dispatch(c, msg)
    } catch (e) {
      const message = e instanceof IllegalAction ? e.message : '요청을 처리하지 못했어요'
      if (!(e instanceof IllegalAction)) console.error(e)
      c.send({ t: 'error', message })
    }
  }

  /** Remove idle rooms. Call periodically. */
  sweep() {
    const t = this.now()
    for (const room of this.rooms.values()) {
      if (room.emptySince != null && t - room.emptySince > this.roomTtl) this.closeRoom(room)
    }
    for (const c of this.clients.values()) {
      if (!c.connected && !c.room && c.awaySince != null && t - c.awaySince > this.roomTtl) this.clients.delete(c.id)
    }
  }

  // ---------- message handling ----------

  private dispatch(c: Client, msg: ClientMsg) {
    switch (msg.t) {
      case 'ping':
        c.send({ t: 'pong' })
        return
      case 'create': {
        const game = ONLINE_GAMES[msg.gameId]
        if (!game) throw new IllegalAction('온라인으로 할 수 없는 게임이에요')
        if (c.room) this.leave(c)
        const code = this.newCode()
        const count = Math.max(game.minPlayers, Math.min(game.maxPlayers, 2))
        const room: Room = {
          code,
          game,
          hostId: c.id,
          seats: Array.from({ length: count }, (_, i) => ({ clientId: i === 0 ? c.id : null, bot: false, name: i === 0 ? c.name : '' })),
          spectators: new Set(),
          status: 'lobby',
          state: null,
          version: 0,
          timer: null,
          emptySince: null,
        }
        this.rooms.set(code, room)
        c.room = code
        this.broadcastRoom(room)
        return
      }
      case 'join': {
        const code = String(msg.code ?? '').trim().toUpperCase()
        const room = this.rooms.get(code)
        if (!room) throw new IllegalAction('방을 찾을 수 없어요. 코드를 확인해 주세요')
        if (c.room === code) {
          this.broadcastRoom(room)
          this.sendState(room, c)
          return
        }
        if (c.room) this.leave(c)
        c.room = code
        room.emptySince = null
        const free = room.status === 'lobby' ? room.seats.find((s) => !s.clientId && !s.bot) : undefined
        if (free) {
          free.clientId = c.id
          free.name = c.name
        } else room.spectators.add(c.id)
        this.broadcastRoom(room)
        this.sendState(room, c)
        this.chat(room, null, `${c.name}님이 ${free ? '들어왔어요' : '구경하러 왔어요'}`)
        return
      }
      case 'leave':
        this.leave(c)
        return
    }

    const room = c.room ? this.rooms.get(c.room) : undefined
    if (!room) throw new IllegalAction('방에 들어가 있지 않아요')
    const isHost = room.hostId === c.id

    switch (msg.t) {
      case 'chat': {
        const text = String(msg.text ?? '').trim().slice(0, 200)
        if (text) this.chat(room, c.name, text)
        return
      }
      case 'seats': {
        if (!isHost) throw new IllegalAction('방장만 바꿀 수 있어요')
        if (room.status !== 'lobby') throw new IllegalAction('게임 중에는 바꿀 수 없어요')
        const n = Math.round(Number(msg.count))
        if (!(n >= room.game.minPlayers && n <= room.game.maxPlayers)) throw new IllegalAction('인원 수가 맞지 않아요')
        while (room.seats.length < n) room.seats.push({ clientId: null, bot: false, name: '' })
        while (room.seats.length > n) {
          const s = room.seats.pop()!
          if (s.clientId) room.spectators.add(s.clientId)
        }
        this.broadcastRoom(room)
        return
      }
      case 'bot': {
        if (!isHost) throw new IllegalAction('방장만 바꿀 수 있어요')
        if (room.status !== 'lobby') throw new IllegalAction('게임 중에는 바꿀 수 없어요')
        if (!room.game.bots) throw new IllegalAction('이 게임은 컴퓨터를 넣을 수 없어요')
        const seat = room.seats[msg.seat]
        if (!seat || seat.clientId) throw new IllegalAction('빈 자리에만 넣을 수 있어요')
        seat.bot = !!msg.on
        this.renameBots(room)
        this.broadcastRoom(room)
        return
      }
      case 'start':
      case 'rematch': {
        if (!isHost) throw new IllegalAction('방장만 시작할 수 있어요')
        if (msg.t === 'start' && room.status !== 'lobby') throw new IllegalAction('이미 시작했어요')
        if (msg.t === 'rematch' && room.status !== 'over') throw new IllegalAction('게임이 아직 끝나지 않았어요')
        if (room.seats.some((s) => !s.clientId && !s.bot)) throw new IllegalAction('빈 자리를 채우거나 인원을 줄여 주세요')
        room.state = room.game.setup(room.seats.length, this.rng)
        room.status = 'playing'
        room.version++
        this.broadcastRoom(room)
        this.broadcastState(room)
        this.schedule(room)
        return
      }
      case 'act': {
        if (room.status !== 'playing') throw new IllegalAction('게임이 진행 중이 아니에요')
        const seat = room.seats.findIndex((s) => s.clientId === c.id)
        if (seat < 0) throw new IllegalAction('구경 중에는 둘 수 없어요')
        if (!room.game.toAct(room.state).includes(seat)) throw new IllegalAction('지금은 내 차례가 아니에요')
        this.applyAction(room, seat, msg.action)
        return
      }
    }
  }

  private applyAction(room: Room, seat: number, action: unknown) {
    room.state = room.game.apply(room.state, seat, action, this.rng)
    room.version++
    if (room.game.result(room.state)) room.status = 'over'
    if (room.status === 'over') this.broadcastRoom(room)
    this.broadcastState(room)
    this.schedule(room)
  }

  /** Schedule the next bot (or away-player takeover) move, if any. */
  private schedule(room: Room) {
    if (room.timer) {
      this.clearTimer(room.timer)
      room.timer = null
    }
    if (room.status !== 'playing' || !room.game.bot) return
    const due = room.game.toAct(room.state).filter((i) => this.botControlled(room, i))
    if (due.length === 0) return
    room.timer = this.setTimer(() => {
      room.timer = null
      if (room.status !== 'playing' || !this.rooms.has(room.code)) return
      const seat = room.game.toAct(room.state).find((i) => this.botControlled(room, i))
      if (seat == null) return
      try {
        this.applyAction(room, seat, room.game.bot!(room.state, seat, this.rng))
      } catch (e) {
        console.error(`bot failed in ${room.game.id}`, e)
      }
    }, this.botDelay)
  }

  private botControlled(room: Room, seat: number): boolean {
    const s = room.seats[seat]
    if (s.bot) return true
    if (!s.clientId) return true
    const c = this.clients.get(s.clientId)
    return !c || (!c.connected && c.awaySince != null && this.now() - c.awaySince >= this.awayTakeover)
  }

  private leave(c: Client) {
    const room = c.room ? this.rooms.get(c.room) : undefined
    c.room = null
    c.send({ t: 'left' })
    if (!room) return
    room.spectators.delete(c.id)
    const seat = room.seats.find((s) => s.clientId === c.id)
    if (seat) {
      if (room.status === 'lobby') {
        seat.clientId = null
        seat.name = ''
      } else {
        // Keep the game going: the seat becomes a bot (or stays empty → auto-played).
        seat.clientId = null
        seat.bot = room.game.bots
        this.renameBots(room)
      }
    }
    if (room.hostId === c.id) {
      const next = room.seats.find((s) => s.clientId)?.clientId ?? [...room.spectators][0]
      if (next) room.hostId = next
    }
    if (!this.hasHuman(room)) {
      this.closeRoom(room)
      return
    }
    this.chat(room, null, `${c.name}님이 나갔어요`)
    this.broadcastRoom(room)
    if (room.status === 'playing') this.schedule(room)
  }

  private closeRoom(room: Room) {
    if (room.timer) this.clearTimer(room.timer)
    this.rooms.delete(room.code)
    for (const id of this.members(room)) {
      const c = this.clients.get(id)
      if (c && c.room === room.code) c.room = null
    }
  }

  // ---------- broadcasting ----------

  private members(room: Room): string[] {
    return [...room.seats.flatMap((s) => (s.clientId ? [s.clientId] : [])), ...room.spectators]
  }

  private hasHuman(room: Room) {
    return this.members(room).length > 0
  }

  private hasConnectedHuman(room: Room) {
    return this.members(room).some((id) => this.clients.get(id)?.connected)
  }

  private info(room: Room): RoomInfo {
    return {
      code: room.code,
      gameId: room.game.id,
      status: room.status,
      minPlayers: room.game.minPlayers,
      maxPlayers: room.game.maxPlayers,
      spectators: room.spectators.size,
      seats: room.seats.map((s, i) => {
        const c = s.clientId ? this.clients.get(s.clientId) : undefined
        return {
          seat: i,
          name: s.bot ? s.name : c?.name ?? '',
          bot: s.bot,
          connected: c ? c.connected : null,
          empty: !s.bot && !s.clientId,
          isHost: !!s.clientId && s.clientId === room.hostId,
        }
      }),
    }
  }

  private broadcastRoom(room: Room) {
    const info = this.info(room)
    for (const id of this.members(room)) {
      const c = this.clients.get(id)
      if (c?.connected) c.send({ t: 'room', room: info, you: this.seatOf(room, id) })
    }
  }

  private seatOf(room: Room, clientId: string): number | null {
    const i = room.seats.findIndex((s) => s.clientId === clientId)
    return i < 0 ? null : i
  }

  private sendState(room: Room, c: Client) {
    if (room.status === 'lobby' || !c.connected) return
    const seat = this.seatOf(room, c.id)
    c.send({
      t: 'state',
      view: room.game.view(room.state, seat),
      seat,
      toAct: room.game.toAct(room.state),
      result: room.game.result(room.state),
      version: room.version,
    })
  }

  private broadcastState(room: Room) {
    for (const id of this.members(room)) {
      const c = this.clients.get(id)
      if (c) this.sendState(room, c)
    }
  }

  private chat(room: Room, from: string | null, text: string) {
    const msg: ServerMsg = { t: 'chat', from: from ?? '', text, at: this.now() }
    for (const id of this.members(room)) {
      const c = this.clients.get(id)
      if (c?.connected) c.send(msg)
    }
  }

  private renameBots(room: Room) {
    let k = 0
    for (const s of room.seats) if (s.bot && !s.clientId) s.name = BOT_NAMES[k++] ?? `컴퓨터 ${k}`
  }

  private newCode(): string {
    for (;;) {
      let code = ''
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_CHARS[Math.floor(this.rng() * CODE_CHARS.length)]
      if (!this.rooms.has(code)) return code
    }
  }

  private newId(): string {
    let id = ''
    for (let i = 0; i < 20; i++) id += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    return id
  }
}

function cleanName(name: unknown): string {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 12)
}
