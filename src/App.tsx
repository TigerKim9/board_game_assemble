import { lazy, Suspense, useMemo, useState, type ComponentType, type LazyExoticComponent } from 'react'
import { GameShell } from './components/GameShell'
import { GAMES, findGame } from './games/registry'
import { navigate, useHashRoute } from './lib/router'
import { useStored } from './lib/storage'
import { CATEGORIES, type Category, type GameMeta } from './lib/types'

const lazyCache = new Map<string, LazyExoticComponent<ComponentType>>()
function lazyGame(meta: GameMeta) {
  let c = lazyCache.get(meta.id)
  if (!c) {
    c = lazy(meta.load)
    lazyCache.set(meta.id, c)
  }
  return c
}

export default function App() {
  const route = useHashRoute()
  const match = route.match(/^\/game\/([\w-]+)/)
  if (match) {
    const meta = findGame(match[1])
    if (meta) return <GamePage meta={meta} />
  }
  return <Home />
}

function GamePage({ meta }: { meta: GameMeta }) {
  const Game = lazyGame(meta)
  return (
    <GameShell meta={meta}>
      <Suspense fallback={<div className="loading">불러오는 중…</div>}>
        <Game />
      </Suspense>
    </GameShell>
  )
}

function Home() {
  const [category, setCategory] = useStored<Category | 'all'>('home:category', 'all')
  const [soloOnly, setSoloOnly] = useState(false)
  const [query, setQuery] = useState('')
  const games = useMemo(
    () =>
      GAMES.filter(
        (g) =>
          (category === 'all' || g.category === category) &&
          (!soloOnly || g.solo) &&
          (query === '' || g.name.includes(query) || g.description.includes(query)),
      ),
    [category, soloOnly, query],
  )

  return (
    <div className="home">
      <header className="home-header">
        <h1>🎲 보드게임 모음</h1>
        <p className="muted">혼자서도, 여럿이서도 · {GAMES.length}종</p>
      </header>
      <div className="home-controls">
        <input
          className="search"
          type="search"
          placeholder="게임 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="toggle">
          <input type="checkbox" checked={soloOnly} onChange={(e) => setSoloOnly(e.target.checked)} />
          혼자 가능
        </label>
      </div>
      <nav className="tabs" aria-label="카테고리">
        <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>
          전체
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={category === c.id ? 'active' : ''} onClick={() => setCategory(c.id)}>
            {c.emoji} {c.name}
          </button>
        ))}
      </nav>
      <ul className="game-grid">
        {games.map((g) => (
          <li key={g.id}>
            <button className="game-card" onClick={() => navigate(`/game/${g.id}`)}>
              <span className="game-emoji" aria-hidden>
                {g.emoji}
              </span>
              <span className="game-name">{g.name}</span>
              <span className="game-desc">{g.description}</span>
              <span className="game-tags">
                <span className="tag">{g.players}</span>
                {g.solo && <span className="tag solo">혼자 가능</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {games.length === 0 && <p className="muted center">조건에 맞는 게임이 없어요.</p>}
    </div>
  )
}
