/**
 * useCardDrag — tap / double-tap / drag-and-drop for card piles using pointer events.
 *
 * Usage:
 *   const { drag, bind } = useCardDrag({ canDrag, onTap, onDoubleTap, onDrop })
 *   <PlayingCard {...bind('tab3', i)} style={drag && isDragged(...) ? { transform: `translate(${drag.dx}px,${drag.dy}px)` } : undefined} />
 *   <div data-drop="tab3">…</div>       // every drop target carries data-drop="<pile id>"
 *
 * - A press that moves less than 6px is a tap (`onTap`); two taps on the same card within 350ms
 *   call `onDoubleTap` instead of the second `onTap`.
 * - Dragging moves the grabbed card and every card after it in the same pile (the game renders
 *   the offset from `drag`). On release the drop target is the `[data-drop]` element overlapping
 *   the dragged card the most.
 * Give draggable cards `touch-action: none` so the browser doesn't scroll instead.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface DragInfo {
  pile: string
  index: number
  dx: number
  dy: number
}

export interface CardDragOptions {
  canDrag: (pile: string, index: number) => boolean
  onTap: (pile: string, index: number) => void
  onDoubleTap?: (pile: string, index: number) => void
  onDrop: (pile: string, index: number, target: string) => void
  disabled?: boolean
}

interface Press {
  pile: string
  index: number
  x: number
  y: number
  rect: DOMRect
  dragging: boolean
  id: number
}

export function useCardDrag(options: CardDragOptions) {
  const opts = useRef(options)
  useLayoutEffect(() => {
    opts.current = options
  })
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const press = useRef<Press | null>(null)
  const lastTap = useRef<{ pile: string; index: number; t: number } | null>(null)
  const cleanup = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanup.current?.(), [])

  const bind = useCallback(
    (pile: string, index: number) => ({
      'data-pile': pile,
      'data-index': index,
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (opts.current.disabled || (e.pointerType === 'mouse' && e.button !== 0) || press.current) return
        press.current = {
          pile,
          index,
          x: e.clientX,
          y: e.clientY,
          rect: e.currentTarget.getBoundingClientRect(),
          dragging: false,
          id: e.pointerId,
        }
        const move = (ev: PointerEvent) => {
          const p = press.current
          if (!p || ev.pointerId !== p.id) return
          const dx = ev.clientX - p.x
          const dy = ev.clientY - p.y
          if (!p.dragging) {
            if (Math.hypot(dx, dy) < 6 || !opts.current.canDrag(p.pile, p.index)) return
            p.dragging = true
          }
          ev.preventDefault()
          setDrag({ pile: p.pile, index: p.index, dx, dy })
        }
        const up = (ev: PointerEvent) => {
          const p = press.current
          if (!p || ev.pointerId !== p.id) return
          finish()
          if (ev.type === 'pointercancel') {
            setDrag(null)
            return
          }
          if (p.dragging) {
            const dx = ev.clientX - p.x
            const dy = ev.clientY - p.y
            const target = findDropTarget(p.rect, dx, dy)
            setDrag(null)
            if (target && target !== p.pile) opts.current.onDrop(p.pile, p.index, target)
            return
          }
          const now = performance.now()
          const lt = lastTap.current
          if (lt && lt.pile === p.pile && lt.index === p.index && now - lt.t < 350 && opts.current.onDoubleTap) {
            lastTap.current = null
            opts.current.onDoubleTap(p.pile, p.index)
          } else {
            lastTap.current = { pile: p.pile, index: p.index, t: now }
            opts.current.onTap(p.pile, p.index)
          }
        }
        const finish = () => {
          press.current = null
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          window.removeEventListener('pointercancel', up)
          cleanup.current = null
        }
        window.addEventListener('pointermove', move, { passive: false })
        window.addEventListener('pointerup', up)
        window.addEventListener('pointercancel', up)
        cleanup.current = finish
      },
    }),
    [],
  )

  return { drag, bind }
}

function findDropTarget(rect: DOMRect, dx: number, dy: number): string | null {
  const l = rect.left + dx
  const t = rect.top + dy
  const r = rect.right + dx
  // Only the top part of the dragged card counts — that's what the player aims with.
  const b = t + Math.min(rect.height, rect.width * 1.4)
  let best: string | null = null
  let bestArea = 0
  document.querySelectorAll<HTMLElement>('[data-drop]').forEach((el) => {
    const er = el.getBoundingClientRect()
    const w = Math.min(r, er.right) - Math.max(l, er.left)
    const h = Math.min(b, er.bottom) - Math.max(t, er.top)
    if (w > 0 && h > 0 && w * h > bestArea) {
      bestArea = w * h
      best = el.dataset.drop ?? null
    }
  })
  return best
}

/** True when card `index` of `pile` is part of the current drag (the grabbed card or one above it). */
export function isDragged(drag: DragInfo | null, pile: string, index: number): boolean {
  return !!drag && drag.pile === pile && index >= drag.index
}
