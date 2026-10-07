import { useCallback, useState } from 'react'

const PREFIX = 'bga:'

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // storage unavailable (private mode etc.) — ignore
  }
}

/** useState that persists to localStorage. */
export function useStored<T>(key: string, fallback: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => load(key, fallback))
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
        save(key, next)
        return next
      })
    },
    [key],
  )
  return [value, set]
}

/** Best-score helper: keeps the max (or min) score seen for a game. */
export function useBestScore(gameId: string, lowerIsBetter = false) {
  const [best, setBest] = useStored<number | null>(`best:${gameId}`, null)
  const submit = useCallback(
    (score: number) => {
      let isNew = false
      setBest((prev) => {
        if (prev == null || (lowerIsBetter ? score < prev : score > prev)) {
          isNew = true
          return score
        }
        return prev
      })
      return isNew
    },
    [lowerIsBetter, setBest],
  )
  return { best, submit }
}
