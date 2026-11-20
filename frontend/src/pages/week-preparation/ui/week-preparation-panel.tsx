import { useDomains } from '@/entities/domain'
import type { Project } from '@/entities/project'
import { principalDomainId } from '@/entities/project'

import type { PreparationCard } from '../model/cards'
import {
  fmtDayRange,
  type PreparationWeek,
  type PreparationWeeks,
} from '../model/weeks'
import { ProjectFocus } from './project-focus'
import { ProjectList } from './project-list'

/**
 * Le panneau de la préparation de la semaine (#92) : 340 px à gauche du
 * calendrier, à la place de sa colonne. La liste des projets en cours, ou —
 * un projet ouvert — le panneau entier consacré à lui.
 *
 * Il ne tient ni la semaine affichée, ni le projet ouvert : la page les
 * porte (dans l'URL), puisque le calendrier d'à côté en dépend aussi. Le
 * « préparé » vient de l'entité préparation, côté serveur.
 */
export function WeekPreparationPanel({
  weeks,
  shown,
  cards,
  projects,
  focusId,
  onFocus,
  onShowWeek,
  reviewed,
  onValidate,
  validating,
  loading,
}: {
  weeks: PreparationWeeks
  /** La semaine affichée au calendrier : le contenu la suit. */
  shown: PreparationWeek
  cards: PreparationCard[]
  projects: Project[]
  /** Le projet ouvert, `null` sur la liste. */
  focusId: string | null
  /** Ouvre un projet (la liste avec `null`) ; avec `week`, sur cette
   *  semaine. */
  onFocus: (projectId: string | null, week?: PreparationWeek) => void
  onShowWeek: (week: PreparationWeek) => void
  reviewed: Set<string>
  onValidate: () => void
  validating: boolean
  loading: boolean
}) {
  const { data: domains } = useDomains()
  // Les projets préparés descendent en bas de la liste (l'ordre est stable
  // sinon) : ce qui reste à préparer est en haut.
  const ordered = [...cards].sort(
    (a, b) =>
      Number(reviewed.has(a.project.id)) - Number(reviewed.has(b.project.id)),
  )
  const index = focusId
    ? ordered.findIndex((c) => c.project.id === focusId)
    : -1
  const focused = index >= 0 ? ordered[index] : null

  return (
    <aside className="flex h-full min-h-0 w-[500px] shrink-0 flex-col border-r border-border">
      {focused ? (
        <ProjectFocus
          card={focused}
          domain={domains?.find(
            (d) => d.id === principalDomainId(focused.project),
          )}
          projects={projects}
          position={index + 1}
          count={ordered.length}
          shown={shown}
          onBack={() => onFocus(null)}
          onShowWeek={onShowWeek}
          onPrepared={() => onFocus(null)}
        />
      ) : (
        <ProjectList
          cards={ordered}
          domains={domains ?? []}
          shown={shown}
          range={fmtDayRange(weeks.past.start, weeks.next.end)}
          reviewed={reviewed}
          // Projet par projet : on l'ouvre toujours sur sa semaine passée.
          onOpen={(id) => onFocus(id, 'past')}
          onValidate={onValidate}
          validating={validating}
          loading={loading}
        />
      )}
    </aside>
  )
}
