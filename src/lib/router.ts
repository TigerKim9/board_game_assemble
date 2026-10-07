import { useEffect, useState } from 'react'

/** Minimal hash router: "#/" is home, "#/game/<id>" is a game. Hash routing works on static hosting. */
export function useHashRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/')
  useEffect(() => {
    const onChange = () => {
      setRoute(window.location.hash.slice(1) || '/')
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(path: string) {
  window.location.hash = path
}
