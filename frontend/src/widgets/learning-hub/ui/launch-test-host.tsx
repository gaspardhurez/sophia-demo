import { useEffect, useState } from 'react'

import type { Activity } from '@/entities/activity'
import { useActivityTypes } from '@/entities/activity-type'
import { type Domain, domainColor, useDomains } from '@/entities/domain'
import type { OverviewItem } from '@/entities/learning'
import { useAllProjects } from '@/entities/project'
import { ActivityPanel } from '@/features/activity/edit'
import { useLaunchTest } from '@/features/plan/launch-test'
import { panelPosBeside } from '@/shared/lib/panel-position'

/**
 * « Lancer l'interro » depuis la ligne Avancer (#157, `prod/Apprentissage`) :
 * la modale de `launch-test`, puis — nouvelle séance demain — le panneau de
 * l'interro créée, à côté du bouton. Monté par la vue d'ensemble et non par
 * la ligne : une écriture relit la vue, et la ligne « pas lancée » disparaît
 * aussitôt le test lancé. `onDone` quand plus rien n'est ouvert.
 */
export function LaunchTestHost({
  item,
  domain,
  anchor,
  onDone,
}: {
  item: OverviewItem
  domain: Domain | undefined
  /** Le bouton cliqué : le panneau s'ouvre à côté. */
  anchor: DOMRect
  onDone: () => void
}) {
  const [created, setCreated] = useState<Activity | null>(null)
  const launch = useLaunchTest({
    plan: { id: item.plan_id ?? '', skill_id: item.skill_id },
    domainId: domain?.id,
    domainEmoji: domain?.emoji ?? '',
    tintClassName: domainColor(domain?.color).soft,
    onCreated: setCreated,
    initialOpen: true,
  })
  const { data: domains } = useDomains()
  const { data: projects } = useAllProjects()
  const { data: activityTypes } = useActivityTypes()

  const idle = launch.idle && !created
  useEffect(() => {
    if (idle) onDone()
  }, [idle, onDone])

  return (
    <>
      {launch.dialog}
      {created && (
        <ActivityPanel
          key={created.id}
          activity={created}
          draft={null}
          pos={panelPosBeside(anchor, 'left')}
          domains={domains ?? []}
          projects={projects ?? []}
          activityTypes={activityTypes ?? []}
          onClose={() => setCreated(null)}
        />
      )}
    </>
  )
}
