// WebSocket message protocol (JSON).

export interface SeatInfo {
  seat: number
  name: string
  bot: boolean
  /** null for bots and empty seats */
  connected: boolean | null
  empty: boolean
  isHost: boolean
}

export interface RoomInfo {
  code: string
  gameId: string
  status: 'lobby' | 'playing' | 'over'
  seats: SeatInfo[]
  minPlayers: number
  maxPlayers: number
  spectators: number
}

export type ClientMsg =
  | { t: 'hello'; clientId: string; name: string }
  | { t: 'create'; gameId: string }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'seats'; count: number }
  | { t: 'bot'; seat: number; on: boolean }
  | { t: 'start' }
  | { t: 'act'; action: unknown }
  | { t: 'rematch' }
  | { t: 'chat'; text: string }
  | { t: 'ping' }

export type ServerMsg =
  | { t: 'welcome'; clientId: string }
  | { t: 'room'; room: RoomInfo; you: number | null }
  | { t: 'left' }
  | {
      t: 'state'
      view: unknown
      seat: number | null
      toAct: number[]
      result: import('./engine').GameResult | null
      /** Increments on every state change. */
      version: number
    }
  | { t: 'error'; message: string }
  | { t: 'chat'; from: string; text: string; at: number }
  | { t: 'pong' }

export const ROOM_CODE_LENGTH = 4
