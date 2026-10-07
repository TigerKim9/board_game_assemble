// Online game server: serves the built web app (dist/) and a WebSocket endpoint at /ws.
// Run: npm run server   (PORT env var, default 8787)

import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ClientMsg } from '../src/online/protocol'
import { Lobby } from './rooms'

const PORT = Number(process.env.PORT ?? 8787)
const DIST = resolve(import.meta.dirname, '..', 'dist')
const MAX_MESSAGE = 16 * 1024

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
}

const lobby = new Lobby()
setInterval(() => lobby.sweep(), 60_000).unref()

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
    res.end(JSON.stringify({ ok: true, rooms: lobby.roomCount }))
    return
  }
  // Static files from dist/, falling back to index.html.
  let file = normalize(join(DIST, decodeURIComponent(url.pathname)))
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
  if (!existsSync(file)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('보드게임 모음 온라인 서버가 실행 중이에요. (웹앱을 함께 띄우려면 먼저 npm run build)')
    return
  }
  const ext = extname(file)
  res.writeHead(200, {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'cache-control': file.includes(`${DIST}/assets/`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  createReadStream(file).pipe(res)
})

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MESSAGE })

wss.on('connection', (ws: WebSocket) => {
  let clientId: string | null = null
  const send = (msg: unknown) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
  }
  let alive = true
  ws.on('pong', () => (alive = true))
  const heartbeat = setInterval(() => {
    if (!alive) return ws.terminate()
    alive = false
    ws.ping()
  }, 25_000)

  ws.on('message', (data) => {
    let msg: ClientMsg
    try {
      msg = JSON.parse(String(data))
    } catch {
      return
    }
    if (!msg || typeof msg !== 'object') return
    if (msg.t === 'hello') {
      clientId = lobby.connect(String(msg.clientId ?? ''), String(msg.name ?? ''), send)
      return
    }
    if (clientId) lobby.handle(clientId, msg)
  })
  ws.on('close', () => {
    clearInterval(heartbeat)
    if (clientId) lobby.disconnect(clientId)
  })
})

server.listen(PORT, () => console.log(`🎲 board game server on http://localhost:${PORT} (ws: /ws)`))
