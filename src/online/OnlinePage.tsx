import { Suspense, useEffect, useRef, useState } from 'react'
import { navigate } from '../lib/router'
import { ONLINE_GAMES } from './games'
import {
  clearError,
  connect,
  getServerUrl,
  lastRoomCode,
  normalizeServerUrl,
  send,
  setName,
  setServerUrl,
  useOnline,
  type OnlineState,
} from './client'
import { ONLINE_UI } from './ui'
import './online.css'

/** Route: #/online or #/online/<CODE> (a shareable invite link). */
export default function OnlinePage({ code }: { code?: string }) {
  const o = useOnline()

  useEffect(() => {
    if (o.name && getServerUrl()) connect()
  }, [o.name, o.serverUrl])

  // Invite link / resume: join the room once connected.
  const joined = useRef<string | null>(null)
  useEffect(() => {
    const target = (code || lastRoomCode() || '').toUpperCase()
    if (o.status !== 'open' || !target || o.room || joined.current === target) return
    joined.current = target
    send({ t: 'join', code: target })
  }, [o.status, code, o.room])

  // Keep the URL in sync with the room so it can be shared / reloaded.
  useEffect(() => {
    const want = o.room ? `/online/${o.room.code}` : '/online'
    if (window.location.hash.slice(1) !== want) window.history.replaceState(null, '', `#${want}`)
  }, [o.room])

  return (
    <div className="game-page online">
      <header className="game-header">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="홈으로">
          ←
        </button>
        <h1>🌐 온라인 대전</h1>
        <ConnDot status={o.status} />
      </header>
      <main className="game-main">
        {o.error && (
          <div className="online-toast" role="alert" onClick={clearError}>
            {o.error} <span aria-hidden>✕</span>
          </div>
        )}
        {!o.name || !getServerUrl() ? (
          <Entry o={o} />
        ) : !o.room ? (
          <Home o={o} />
        ) : o.room.status === 'lobby' ? (
          <Lobby o={o} />
        ) : (
          <Playing o={o} />
        )}
      </main>
    </div>
  )
}

function ConnDot({ status }: { status: OnlineState['status'] }) {
  const label = { idle: '연결 전', connecting: '연결 중', open: '연결됨', closed: '끊김' }[status]
  return (
    <span className={`online-dot ${status}`} title={label} aria-label={label}>
      ●
    </span>
  )
}

function Entry({ o }: { o: OnlineState }) {
  const [name, setNameInput] = useState(o.name)
  const [server, setServer] = useState(o.serverUrl || getServerUrl())
  const [err, setErr] = useState('')
  const needServer = !getServerUrl()
  return (
    <form
      className="setup card-panel"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return setErr('닉네임을 입력해 주세요')
        if (needServer || server !== getServerUrl()) {
          try {
            setServerUrl(normalizeServerUrl(server))
          } catch {
            return setErr('서버 주소가 올바르지 않아요')
          }
        }
        setName(name.trim().slice(0, 12))
      }}
    >
      <h2>온라인으로 친구와 하기</h2>
      <p className="muted">각자 자기 폰으로 같은 방에 들어가 함께 플레이해요.</p>
      <label className="online-field">
        <span>닉네임</span>
        <input id="online-name" className="seat-input" value={name} maxLength={12} onChange={(e) => setNameInput(e.target.value)} placeholder="예: 호랑이" />
      </label>
      <ServerField value={server} onChange={setServer} open={needServer} />
      {err && <p className="online-err">{err}</p>}
      <button className="btn primary big" type="submit">
        시작하기
      </button>
    </form>
  )
}

function ServerField({ value, onChange, open }: { value: string; onChange: (v: string) => void; open: boolean }) {
  return (
    <details className="online-server" open={open}>
      <summary>서버 주소 {value ? <code>{value.replace(/^wss?:\/\//, '')}</code> : <em>설정 필요</em>}</summary>
      <input
        id="online-server"
        className="seat-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="예: my-games.onrender.com"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
      />
      <p className="muted small">게임 서버를 띄운 주소를 입력하세요. 방장과 친구 모두 같은 서버를 써야 해요.</p>
    </details>
  )
}

function Home({ o }: { o: OnlineState }) {
  const [code, setCode] = useState('')
  const [editServer, setEditServer] = useState(false)
  const [server, setServer] = useState(getServerUrl())
  const games = Object.values(ONLINE_GAMES)
  return (
    <>
      <section className="card-panel online-join">
        <h2>코드로 입장</h2>
        <form
          className="online-code-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim().length >= 4) send({ t: 'join', code: code.trim().toUpperCase() })
          }}
        >
          <input
            id="online-code"
            className="online-code-input"
            value={code}
            maxLength={4}
            autoCapitalize="characters"
            autoCorrect="off"
            placeholder="ABCD"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
          <button className="btn primary" type="submit" disabled={code.length < 4 || o.status !== 'open'}>
            입장
          </button>
        </form>
      </section>
      <section className="card-panel">
        <h2>방 만들기</h2>
        <p className="muted">게임을 고르면 방 코드가 생겨요. 코드나 링크를 친구에게 보내세요.</p>
        <ul className="online-games">
          {games.map((g) => (
            <li key={g.id}>
              <button className="online-game" disabled={o.status !== 'open'} onClick={() => send({ t: 'create', gameId: g.id })}>
                <span className="online-game-emoji">{g.emoji}</span>
                <span className="online-game-name">{g.name}</span>
                <span className="tag">
                  {g.minPlayers === g.maxPlayers ? `${g.minPlayers}명` : `${g.minPlayers}~${g.maxPlayers}명`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="online-me muted">
        <span>
          {o.name} · {o.status === 'open' ? '서버 연결됨' : o.status === 'connecting' ? '연결 중…' : '서버에 연결할 수 없어요'}
        </span>
        <button className="btn small ghost" onClick={() => setName('')}>
          닉네임 변경
        </button>
        <button className="btn small ghost" onClick={() => setEditServer((v) => !v)}>
          서버 변경
        </button>
      </section>
      {editServer && (
        <form
          className="card-panel setup"
          onSubmit={(e) => {
            e.preventDefault()
            try {
              setServerUrl(normalizeServerUrl(server))
              setEditServer(false)
              connect()
            } catch {
              /* invalid url — keep editing */
            }
          }}
        >
          <ServerField value={server} onChange={setServer} open />
          <button className="btn primary" type="submit">
            저장
          </button>
        </form>
      )}
    </>
  )
}

function inviteLink(code: string) {
  return `${window.location.origin}${window.location.pathname}#/online/${code}`
}

function RoomHeader({ o }: { o: OnlineState }) {
  const room = o.room!
  const game = ONLINE_GAMES[room.gameId]
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    const text = inviteLink(room.code)
    try {
      if (navigator.share) await navigator.share({ title: `${game?.name} 같이 해요`, text: `방 코드 ${room.code}`, url: text })
      else await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* user cancelled or clipboard blocked */
    }
  }
  return (
    <div className="online-roomhead">
      <div>
        <div className="muted small">
          {game?.emoji} {game?.name} · 방 코드
        </div>
        <div className="online-code">{room.code}</div>
      </div>
      <div className="btn-row">
        <button className="btn small" onClick={copy}>
          {copied ? '복사됨!' : '초대 링크'}
        </button>
        <button className="btn small ghost" onClick={() => send({ t: 'leave' })}>
          나가기
        </button>
      </div>
    </div>
  )
}

function Lobby({ o }: { o: OnlineState }) {
  const room = o.room!
  const game = ONLINE_GAMES[room.gameId]
  const isHost = room.seats.some((s) => s.isHost && s.seat === o.you)
  const ready = room.seats.every((s) => !s.empty)
  return (
    <>
      <RoomHeader o={o} />
      <section className="card-panel setup">
        {room.minPlayers !== room.maxPlayers && (
          <div className="setup-row">
            <span>인원</span>
            <div className="stepper">
              <button className="btn small" disabled={!isHost || room.seats.length <= room.minPlayers} onClick={() => send({ t: 'seats', count: room.seats.length - 1 })}>
                −
              </button>
              <strong>{room.seats.length}명</strong>
              <button className="btn small" disabled={!isHost || room.seats.length >= room.maxPlayers} onClick={() => send({ t: 'seats', count: room.seats.length + 1 })}>
                +
              </button>
            </div>
          </div>
        )}
        <ul className="seat-list">
          {room.seats.map((s) => (
            <li key={s.seat} className="seat">
              <span className="seat-name">
                {s.empty ? <span className="muted">빈 자리 — 친구를 기다리는 중</span> : <>{s.bot ? '🤖 ' : s.isHost ? '👑 ' : '🙂 '}{s.name}{s.seat === o.you && ' (나)'}</>}
                {s.connected === false && ' 📴'}
              </span>
              {isHost && game?.bots && (s.empty || s.bot) && (
                <button className={`btn small ${s.bot ? '' : 'ghost'}`} onClick={() => send({ t: 'bot', seat: s.seat, on: !s.bot })}>
                  {s.bot ? '컴퓨터 빼기' : '컴퓨터 넣기'}
                </button>
              )}
            </li>
          ))}
        </ul>
        {room.spectators > 0 && <p className="muted small">구경하는 사람 {room.spectators}명</p>}
        {isHost ? (
          <button className="btn primary big" disabled={!ready} onClick={() => send({ t: 'start' })}>
            {ready ? '게임 시작' : '빈 자리를 채워 주세요'}
          </button>
        ) : (
          <p className="center muted">방장이 시작하기를 기다리는 중…</p>
        )}
      </section>
      <Chat o={o} />
    </>
  )
}

function Playing({ o }: { o: OnlineState }) {
  const room = o.room!
  const g = o.game
  const Screen = ONLINE_UI[room.gameId]
  const isHost = room.seats.some((s) => s.isHost && s.seat === o.you)
  const result = g?.result
  return (
    <>
      <RoomHeader o={o} />
      {g && Screen ? (
        <Suspense fallback={<div className="loading">불러오는 중…</div>}>
          <Screen view={g.view} seat={g.seat} toAct={g.toAct} result={g.result} seats={room.seats} act={(action) => send({ t: 'act', action })} />
        </Suspense>
      ) : (
        <div className="loading">게임 정보를 받는 중…</div>
      )}
      {result && (
        <div className="result card-panel">
          <h2>
            {result.winners.length === 0
              ? '무승부!'
              : result.winners.includes(o.you ?? -1)
                ? '🏆 승리!'
                : `🏆 ${result.winners.map((w) => room.seats[w]?.name).join(', ')} 승리`}
          </h2>
          {result.summary && <p>{result.summary}</p>}
          {isHost ? (
            <button className="btn primary big" onClick={() => send({ t: 'rematch' })}>
              한 판 더
            </button>
          ) : (
            <p className="muted">방장이 다음 판을 시작할 수 있어요</p>
          )}
        </div>
      )}
      <Chat o={o} />
    </>
  )
}

function Chat({ o }: { o: OnlineState }) {
  const [text, setText] = useState('')
  const listRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [o.chat.length])
  return (
    <section className="card-panel online-chat">
      <ul ref={listRef} className="online-chat-list" aria-live="polite">
        {o.chat.length === 0 && <li className="muted small">채팅으로 인사해 보세요 👋</li>}
        {o.chat.map((c, i) => (
          <li key={i} className={c.from ? '' : 'sys'}>
            {c.from && <strong>{c.from}</strong>} {c.text}
          </li>
        ))}
      </ul>
      <form
        className="online-chat-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) send({ t: 'chat', text })
          setText('')
        }}
      >
        <input id="online-chat" className="seat-input" value={text} maxLength={200} placeholder="메시지" onChange={(e) => setText(e.target.value)} />
        <button className="btn small" type="submit">
          보내기
        </button>
      </form>
    </section>
  )
}
