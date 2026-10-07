// Browser-side connection to the online game server, as a tiny global store + React hook.
// Reconnects automatically and rejoins the same room/seat (the server keys players by clientId).

import { useSyncExternalStore } from 'react'
import { load, save } from '../lib/storage'
import type { GameResult } from './engine'
import type { ClientMsg, RoomInfo, ServerMsg } from './protocol'

export type ConnStatus = 'idle' | 'connecting' | 'open' | 'closed'

export interface ChatLine {
  from: string
  text: string
  at: number
}

export interface GameSnapshot {
  view: unknown
  seat: number | null
  toAct: number[]
  result: GameResult | null
  version: number
}

export interface OnlineState {
  status: ConnStatus
  serverUrl: string
  name: string
  room: RoomInfo | null
  you: number | null
  game: GameSnapshot | null
  chat: ChatLine[]
  error: string | null
}

/** Default server: the same host when the app is served by the game server, else the build-time URL. */
export function defaultServerUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined
  if (env) return env
  const { protocol, host, hostname } = window.location
  if ((protocol === 'http:' || protocol === 'https:') && !hostname.endsWith('github.io') && !hostname.endsWith('claude.ai')) {
    return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws`
  }
  return ''
}

/** Accepts "example.com", "https://example.com", "ws://1.2.3.4:8787" etc. and returns a ws(s) URL ending in /ws. */
export function normalizeServerUrl(input: string): string {
  let s = input.trim()
  if (!s) return ''
  if (!/^[a-z]+:\/\//i.test(s)) s = (/^(localhost|\d+\.\d+\.\d+\.\d+)(:|$)/.test(s) ? 'ws://' : 'wss://') + s
  s = s.replace(/^http/i, 'ws')
  const u = new URL(s)
  if (u.pathname === '/' || u.pathname === '') u.pathname = '/ws'
  return u.toString().replace(/\/$/, '')
}

function newClientId(): string {
  const a = new Uint8Array(12)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

let state: OnlineState = {
  status: 'idle',
  serverUrl: load<string>('online:server', '') || '',
  name: load<string>('online:name', ''),
  room: null,
  you: null,
  game: null,
  chat: [],
  error: null,
}
const listeners = new Set<() => void>()
const clientId = load<string>('online:clientId', '') || (() => {
  const id = newClientId()
  save('online:clientId', id)
  return id
})()

let ws: WebSocket | null = null
let retry = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let pingTimer: ReturnType<typeof setInterval> | null = null
let wanted = false
let queue: ClientMsg[] = []

function set(patch: Partial<OnlineState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function effectiveUrl() {
  return state.serverUrl || defaultServerUrl()
}

function open() {
  const url = effectiveUrl()
  if (!url) {
    set({ status: 'closed', error: '서버 주소를 입력해 주세요' })
    return
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  set({ status: 'connecting' })
  let sock: WebSocket
  try {
    sock = new WebSocket(url)
  } catch {
    set({ status: 'closed', error: '서버 주소가 올바르지 않아요' })
    return
  }
  ws = sock
  sock.onopen = () => {
    retry = 0
    set({ status: 'open', error: null })
    sock.send(JSON.stringify({ t: 'hello', clientId, name: state.name } satisfies ClientMsg))
    const pending = queue
    queue = []
    pending.forEach((m) => sock.send(JSON.stringify(m)))
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = setInterval(() => send({ t: 'ping' }), 20_000)
  }
  sock.onmessage = (e) => {
    let msg: ServerMsg
    try {
      msg = JSON.parse(String(e.data))
    } catch {
      return
    }
    onMessage(msg)
  }
  sock.onclose = () => {
    if (ws !== sock) return
    ws = null
    if (pingTimer) clearInterval(pingTimer)
    set({ status: 'closed' })
    if (wanted) {
      const delay = Math.min(10_000, 500 * 2 ** retry++)
      retryTimer = setTimeout(open, delay)
    }
  }
}

function onMessage(msg: ServerMsg) {
  switch (msg.t) {
    case 'room':
      set({ room: msg.room, you: msg.you, game: msg.room.status === 'lobby' ? null : state.game })
      save('online:lastRoom', msg.room.code)
      break
    case 'state':
      set({ game: { view: msg.view, seat: msg.seat, toAct: msg.toAct, result: msg.result, version: msg.version } })
      break
    case 'left':
      set({ room: null, you: null, game: null, chat: [] })
      save('online:lastRoom', '')
      break
    case 'chat':
      set({ chat: [...state.chat.slice(-60), { from: msg.from, text: msg.text, at: msg.at }] })
      break
    case 'error':
      // A stale invite/resume code shouldn't keep failing on every visit.
      if (!state.room) save('online:lastRoom', '')
      set({ error: msg.message })
      break
  }
}

export function send(msg: ClientMsg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  else if (msg.t !== 'ping') {
    queue.push(msg)
    connect()
  }
}

export function connect() {
  wanted = true
  if (retryTimer) clearTimeout(retryTimer)
  open()
}

export function disconnect() {
  wanted = false
  if (retryTimer) clearTimeout(retryTimer)
  ws?.close()
  ws = null
}

export function setServerUrl(url: string) {
  save('online:server', url)
  disconnect()
  set({ serverUrl: url, room: null, you: null, game: null, error: null })
}

export function setName(name: string) {
  save('online:name', name)
  set({ name })
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'hello', clientId, name } satisfies ClientMsg))
}

export function clearError() {
  set({ error: null })
}

export function getServerUrl() {
  return effectiveUrl()
}

export function lastRoomCode(): string {
  return load<string>('online:lastRoom', '')
}

export function useOnline(): OnlineState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
