import type { AcquisitionPlan } from '@/entities/plan'
import type { Resource } from '@/entities/resource'

/** Une ressource de la colonne, et sa case au cycle. */
export interface ResourceLine {
  resource: Resource
  consumed: boolean
}

/**
 * Les ressources de la colonne des notes (#173), dans l'**ordre de
 * consommation** du cycle (ses positions ; les ressources pas encore lues
 * écartées). Une consommée garde sa place (30/10, demande de l'utilisateur :
 * elle ne descend plus en bas). Sans cycle, les ressources du savoir, sans
 * case ni ordre.
 */
export function cycleResourceLines(
  plan: AcquisitionPlan | null,
  resources: Resource[] | undefined,
): ResourceLine[] {
  const byId = new Map((resources ?? []).map((r) => [r.id, r]))
  return plan
    ? [...plan.resources]
        .sort((a, b) => a.position - b.position)
        .flatMap((pr) => {
          const resource = byId.get(pr.resource_id)
          return resource
            ? [{ resource, consumed: pr.consumed_at != null }]
            : []
        })
    : (resources ?? []).map((resource) => ({ resource, consumed: false }))
}
