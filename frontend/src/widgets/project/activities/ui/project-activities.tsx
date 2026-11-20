import { Pencil } from 'lucide-react'
import { useState } from 'react'

import { LinkWeek, type LinkColors } from '@/entities/activity-type'
import { domainColor, domainColorValues, useDomainsOf } from '@/entities/domain'
import type { Project } from '@/entities/project'
import {
  ActivityTypesEditor,
  useServerLinkHandlers,
} from '@/features/activity-type-link'

/**
 * La section « Activités types » de la colonne de droite (#38, #85,
 * `prod/Projet`) : les activités types que le projet planifie, dans un
 * cadre gris doux — en lecture, la semaine (`LinkWeek`) ; au crayon,
 * l'édition (`ActivityTypesEditor`), que « Terminer » referme. Le
 * calendrier 3 jours qui la suivait est retiré (12/11 : illisible à cette
 * largeur).
 *
 * Vide en lecture, la section n'a que son titre.
 */
export function ProjectActivities({
  project,
  colorKey,
}: {
  project: Project
  colorKey: string | null | undefined
}) {
  const [editing, setEditing] = useState(false)
  const domains = useDomainsOf(project.domain_ids)
  const handlers = useServerLinkHandlers(project.id)
  const values = domainColorValues(colorKey)
  const colors: LinkColors = {
    soft: values.soft,
    bord: values.bord,
    ink: values.ink,
  }
  const links = project.activity_types

  return (
    <section className="group/activities flex flex-col gap-2.5">
      <div className="flex min-h-7 items-center gap-2.5">
        <h3 className="font-heading text-sm font-semibold">Activités types</h3>
        {editing ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="-my-1 ml-auto h-7 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground"
          >
            Terminer
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Ajuster les activités"
            className="-my-[3px] -ml-1 grid size-[26px] place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/activities:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
          >
            <Pencil className="size-[15px]" />
          </button>
        )}
      </div>

      {(editing || links.length > 0) && (
        <div className="flex flex-col gap-1.5 rounded-[10px] bg-muted/70 px-3.5 py-3">
          {editing ? (
            <ActivityTypesEditor
              links={links}
              totals={project.totals}
              domains={domains}
              colors={colors}
              inkClassName={domainColor(colorKey).ink}
              handlers={handlers}
            />
          ) : (
            <LinkWeek links={links} colors={colors} />
          )}
        </div>
      )}
    </section>
  )
}
