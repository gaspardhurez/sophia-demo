import {
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useRef, useState } from 'react'

import { type Activity } from '@/entities/activity'
import { addDays } from '@/shared/lib/date'

import { CELL_H, snap } from './constants'

/**
 * Encapsule le *geste* de drag du calendrier : quelle activité est saisie, où
 * (colonne survolée, delta vertical), et le passage de semaine quand on atteint
 * un bord (façon Notion Calendar). L'activité saisie est mémorisée pour survivre
 * à un changement de semaine en plein drag. L'*effet* du dépôt (quoi persister)
 * est délégué au composant via `onDrop`.
 */
export function useCalendarDrag({
  activities,
  scrollRef,
  setWeekStart,
  dayCount,
  onDrop,
  onDropHabit,
}: {
  activities: Activity[] | undefined
  scrollRef: React.RefObject<HTMLDivElement | null>
  setWeekStart: React.Dispatch<React.SetStateAction<Date>>
  dayCount: number
  onDrop: (activity: Activity, e: DragEndEvent) => Promise<void> | void
  /** Drop d'une tuile d'activité type (id `habit:<id>`) → créer une occurrence. */
  onDropHabit?: (habitId: string, e: DragEndEvent) => Promise<void> | void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draggingActivity, setDraggingActivity] = useState<Activity | null>(
    null,
  )
  const [draggingHabitId, setDraggingHabitId] = useState<string | null>(null)
  const [dragDelta, setDragDelta] = useState(0)
  const [overId, setOverId] = useState<string | null>(null)
  const [pointerY, setPointerY] = useState(0)
  const overTopRef = useRef(0)
  const lastEdgeJumpRef = useRef(0)
  // Le paging au bord ne s'arme qu'une fois le pointeur entré dans la grille :
  // une chip glissée depuis la colonne (#57) part à gauche du bord gauche.
  const edgeArmedRef = useRef(false)

  function reset() {
    setActiveId(null)
    setDraggingActivity(null)
    setDraggingHabitId(null)
    setDragDelta(0)
    setOverId(null)
  }

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id)
    setActiveId(id)
    if (id.startsWith('habit:')) {
      setDraggingHabitId(id.slice(6))
      setDraggingActivity(null)
    } else {
      setDraggingHabitId(null)
      setDraggingActivity(
        (activities ?? []).find((x) => x.id === e.active.id) ?? null,
      )
    }
    setDragDelta(0)
    setOverId(null)
    lastEdgeJumpRef.current = 0
    edgeArmedRef.current = false
  }

  function onDragMove(e: DragMoveEvent) {
    setDragDelta(snap(e.delta.y / CELL_H))
    setOverId(e.over ? String(e.over.id) : null)
    if (e.over) overTopRef.current = e.over.rect.top
    setPointerY((e.activatorEvent as PointerEvent).clientY + e.delta.y)
    // Bord gauche/droite → semaine précédente/suivante (avec cooldown), façon NC.
    const cont = scrollRef.current
    if (cont) {
      const pointerX = (e.activatorEvent as PointerEvent).clientX + e.delta.x
      const r = cont.getBoundingClientRect()
      const now = Date.now()
      if (pointerX >= r.left + 40 && pointerX <= r.right - 40)
        edgeArmedRef.current = true
      if (edgeArmedRef.current && now - lastEdgeJumpRef.current > 700) {
        if (pointerX > r.right - 40) {
          setWeekStart((w) => addDays(w, dayCount))
          lastEdgeJumpRef.current = now
        } else if (pointerX < r.left + 40) {
          setWeekStart((w) => addDays(w, -dayCount))
          lastEdgeJumpRef.current = now
        }
      }
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    const a = draggingActivity
    const habitId = draggingHabitId
    reset()
    if (!e.over) return
    if (habitId) await onDropHabit?.(habitId, e)
    else if (a) await onDrop(a, e)
  }

  return {
    activeId,
    draggingActivity,
    draggingHabitId,
    dragDelta,
    overId,
    pointerY,
    overTopRef,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel: reset,
  }
}
