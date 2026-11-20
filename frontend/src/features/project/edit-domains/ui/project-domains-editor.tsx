import { useState } from 'react'

import type { Domain } from '@/entities/domain'
import { type Project, useSetProjectDomains } from '@/entities/project'
import { ApiError } from '@/shared/api'
import { toast } from '@/shared/ui'

import { DomainTags } from './domain-tags'
import { RemoveDomainDialog } from './remove-domain-dialog'

/**
 * Les domaines d'un projet existant, éditables (#203) : réordonner et ajouter
 * s'enregistrent aussitôt ; retirer passe par la confirmation qui énumère ce
 * qui se délie.
 */
export function ProjectDomainsEditor({
  project,
  domains,
}: {
  project: Project
  domains: Domain[]
}) {
  const setDomains = useSetProjectDomains()
  const [removing, setRemoving] = useState<string | null>(null)
  const byId = new Map(domains.map((d) => [d.id, d]))
  const removed = removing ? byId.get(removing) : undefined

  async function save(ids: string[]) {
    try {
      await setDomains.mutateAsync({ id: project.id, domainIds: ids })
      setRemoving(null)
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'Impossible de changer les domaines.',
      )
    }
  }

  return (
    <>
      <DomainTags
        domains={domains}
        value={project.domain_ids}
        onChange={save}
        onRemove={setRemoving}
      />
      {removed && (
        <RemoveDomainDialog
          project={project}
          domain={removed}
          remaining={project.domain_ids
            .filter((id) => id !== removed.id)
            .flatMap((id) => byId.get(id) ?? [])}
          pending={setDomains.isPending}
          onConfirm={() =>
            save(project.domain_ids.filter((id) => id !== removed.id))
          }
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  )
}
