import { type ScopeTag, scopeLabel } from '@/entities/plan'

export type { ScopeTag }

/** Un élément du périmètre à l'écran : proposé par Sophia, il ne se retire
 *  pas (décoché, il dit un bord) ; écrit par l'utilisateur, si. */
export interface FrameTag extends ScopeTag {
  removable: boolean
}

/**
 * Les propositions de Sophia rejoignent les éléments déjà là (le périmètre
 * existant, ce qu'on a ajouté) : ceux-ci restent tels quels, en tête ; une
 * proposition déjà présente (casse ignorée) ne revient pas, les autres
 * s'ajoutent, cochées si Sophia les met dans ce cycle.
 */
export function mergeProposals(
  tags: readonly FrameTag[],
  proposals: readonly ScopeTag[],
): FrameTag[] {
  const seen = new Set(tags.map((t) => t.label.trim().toLowerCase()))
  const added: FrameTag[] = []
  for (const p of proposals) {
    const label = scopeLabel(p.label)
    const key = label.toLowerCase()
    if (!label || seen.has(key)) continue
    seen.add(key)
    added.push({ label, inCycle: p.inCycle, removable: false })
  }
  return [...tags, ...added]
}
