import { useEffect, useState } from 'react'

import { type Activity, copyOf, useCreateActivity } from '@/entities/activity'
import { useActivityTypes } from '@/entities/activity-type'
import type { Domain } from '@/entities/domain'
import { useAllProjects } from '@/entities/project'
import {
  DeleteActivityDialog,
  useActivityDeletion,
} from '@/features/activity/delete'
import { ActivityPanel } from '@/features/activity/edit'
import { panelPosBeside } from '@/shared/lib/panel-position'
import { toast } from '@/shared/ui'

/**
 * Le panneau d'une séance, dans la vue d'ensemble (26/10) : un clic sur une
 * activité l'ouvre à côté, comme à la page savoir — même panneau, même menu
 * ⋯ (Dupliquer, Supprimer), fermé au clic en dehors.
 *
 * `fresh` relit la séance dans la dernière vue d'ensemble : le panneau suit
 * ce qu'on y modifie.
 */
export function useActivityHost({
  domains,
  fresh,
}: {
  domains: Domain[]
  fresh: (id: string) => Activity | undefined
}) {
  const { data: projects } = useAllProjects()
  const { data: activityTypes } = useActivityTypes()
  const [session, setSession] = useState<Activity | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [menu, setMenu] = useState<{
    a: Activity
    x: number
    y: number
  } | null>(null)

  function open(a: Activity, rect: DOMRect) {
    setPos(panelPosBeside(rect, 'right'))
    setSession(a)
  }

  // Hors du panneau et de ce qu'il ouvre ; une autre séance ouvre la sienne.
  useEffect(() => {
    if (!session) return
    function onDown(e: PointerEvent) {
      const t = e.target as HTMLElement
      if (
        t.closest('[data-activity-ui]') ||
        t.closest('[data-session-open]') ||
        t.closest('[data-radix-popper-content-wrapper]') ||
        t.closest('[role="menu"], [role="dialog"], [role="listbox"]')
      )
        return
      setSession(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [session])

  useEffect(() => {
    if (!session) setMenu(null)
  }, [session])

  const createActivity = useCreateActivity()
  async function duplicate(a: Activity) {
    setMenu(null)
    try {
      await createActivity.mutateAsync(
        copyOf(a, {
          all_day: a.all_day,
          start_at: a.start_at,
          end_at: a.end_at,
        }),
      )
    } catch {
      toast.error('La duplication a échoué')
    }
  }
  const deletion = useActivityDeletion({
    onError: () => toast.error('La suppression a échoué'),
  })
  async function remove(a: Activity) {
    setMenu(null)
    setSession(null)
    await deletion.request(a)
  }

  const node = (
    <>
      {session && (
        <ActivityPanel
          key={session.id}
          activity={fresh(session.id) ?? session}
          draft={null}
          pos={pos}
          domains={domains}
          projects={projects ?? []}
          activityTypes={activityTypes ?? []}
          onClose={() => setSession(null)}
          onMenu={(e) => setMenu({ a: session, x: e.clientX, y: e.clientY })}
        />
      )}
      {menu && (
        <div
          data-activity-ui
          style={{ top: menu.y, left: menu.x }}
          className="fixed z-50 min-w-40 overflow-hidden rounded-lg border border-border bg-popover py-1 text-sm shadow-md"
        >
          <button
            type="button"
            onClick={() => duplicate(menu.a)}
            className="block w-full px-3 py-1.5 text-left hover:bg-muted/60"
          >
            Dupliquer
          </button>
          <button
            type="button"
            onClick={() => remove(menu.a)}
            className="block w-full px-3 py-1.5 text-left text-destructive hover:bg-muted/60"
          >
            Supprimer
          </button>
        </div>
      )}
      <DeleteActivityDialog
        pending={deletion.pending}
        isPending={deletion.isPending}
        onConfirm={deletion.confirm}
        onCancel={deletion.cancel}
      />
    </>
  )

  return { open, node }
}
