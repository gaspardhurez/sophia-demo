import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useDomains } from '@/entities/domain'
import { useAllProjects } from '@/entities/project'
import { WishLists } from '@/features/wish/edit-list'
import { startOfWeek, toDateISO } from '@/shared/lib/date'
import { useDocumentTitle } from '@/shared/lib/document-title'
import { useUndoStack } from '@/shared/lib/undo-stack'
import { ActivityCalendar } from '@/widgets/activity-calendar'

export function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const domainId = params.get('domainId') ?? undefined
  // Un projet n'est pas un filtre : c'est un focus — tout le calendrier
  // reste là, estompé autour de lui. Seul un domaine filtre.
  const projectId = params.get('projectId') ?? undefined
  const filtered = Boolean(domainId)
  // Les onglets de la colonne (#215) : rien de choisi à l'arrivée.
  const [domainFilter, setDomainFilter] = useState<string[]>([])
  const { data: domains } = useDomains()
  const { data: projects } = useAllProjects()
  // Les motivations suivent le focus : celles des domaines du projet en
  // focus (19/11), sinon celles des domaines choisis.
  const wishDomains =
    (projectId && projects?.find((o) => o.id === projectId)?.domain_ids) ||
    domainFilter
  // Une pile pour la grille et les envies : ⌘Z défait l'un comme l'autre.
  const undoStack = useUndoStack()

  useDocumentTitle('Calendrier')

  return (
    <main className="h-[calc(100svh-var(--header-h))]">
      <ActivityCalendar
        domainId={domainId}
        projectId={projectId}
        showSidebar={!filtered}
        undoStack={undoStack}
        domainFilter={domainFilter}
        // Changer de domaines sort du focus le projet qui n'en est pas
        // (20/11) : sinon il resterait en focus sur un autre domaine.
        onDomainFilter={(next) => {
          setDomainFilter(next)
          const focused = projects?.find((o) => o.id === projectId)
          if (
            focused &&
            next.length > 0 &&
            !focused.domain_ids.some((d) => next.includes(d))
          )
            setParams((prev) => {
              const p = new URLSearchParams(prev)
              p.delete('projectId')
              return p
            })
        }}
        sidebarNote={
          <WishLists
            domains={domains ?? []}
            selected={wishDomains}
            undoStack={undoStack}
          />
        }
        // Une carte de la colonne met son projet en focus, ou l'en sort.
        onFocusProject={(id) =>
          setParams((prev) => {
            const next = new URLSearchParams(prev)
            if (id) next.set('projectId', id)
            else next.delete('projectId')
            return next
          })
        }
        // Le calendrier complet ouvre la préparation de la semaine affichée.
        onPrepareWeek={
          filtered
            ? undefined
            : (w) =>
                navigate(`/calendar/preparation/${toDateISO(startOfWeek(w))}`)
        }
      />
    </main>
  )
}
