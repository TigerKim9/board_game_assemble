import type { ComponentType } from 'react'

export type Category = 'board' | 'hwatu' | 'cards' | 'dice' | 'coop' | 'party' | 'defense' | 'arcade' | 'puzzle'

export const CATEGORIES: { id: Category; name: string; emoji: string }[] = [
  { id: 'party', name: '파티 도구', emoji: '🎉' },
  { id: 'dice', name: '주사위', emoji: '🎲' },
  { id: 'board', name: '보드게임', emoji: '♟️' },
  { id: 'cards', name: '트럼프 카드', emoji: '🃏' },
  { id: 'hwatu', name: '화투', emoji: '🌸' },
  { id: 'coop', name: '협력·눈치', emoji: '🧠' },
  { id: 'defense', name: '디펜스', emoji: '🛡️' },
  { id: 'arcade', name: '아케이드', emoji: '🕹️' },
  { id: 'puzzle', name: '퍼즐', emoji: '🧩' },
]

export interface GameMeta {
  id: string
  name: string
  emoji: string
  category: Category
  /** Human readable player count, e.g. "1~4명". */
  players: string
  /** Playable alone (vs AI or as a solo challenge). */
  solo: boolean
  description: string
  rules: string[]
  load: () => Promise<{ default: ComponentType }>
}

export interface PlayerConfig {
  name: string
  isAI: boolean
}

export type Difficulty = 'easy' | 'normal' | 'hard'
