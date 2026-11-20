import { Check, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Input } from '@/shared/ui'

import { useSkills } from '../api/queries'
import { skillPaths } from '../model/tree'

/**
 * Sélecteur d'une compétence parmi celles d'un domaine.
 *
 * **Liste à plat, pas un arbre.** On cherche ici un savoir dont on connaît le
 * nom, pas un rangement à explorer : la recherche fait le travail que le pliage
 * ferait plus lentement. Le **chemin** (« Navigation › Water start ») est rendu
 * à côté du nom, ce qui règle le seul vrai service que l'arbre rendait —
 * distinguer deux feuilles homonymes sous deux branches.
 *
 * **Tous les nœuds y figurent, parents compris** : tout nœud est un savoir
 * (décision du 23/09/2026, qui annule l'exclusion des catégories du 01/09).
 */
export function SkillPicker({
  domainId,
  value,
  onChange,
  autoFocus = true,
}: {
  /** Domaine dont on liste les membres. Le sélecteur reste vide sans lui. */
  domainId: string | undefined
  value: string | null
  onChange: (skillId: string | null) => void
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState('')
  const { data: skills } = useSkills(domainId)

  // Tout nœud est un savoir, parents compris : tous sont proposés.
  const options = useMemo(() => {
    const paths = skillPaths(skills ?? [])
    return (skills ?? []).map((s) => ({
      skill: s,
      path: paths.get(s.id) ?? '',
    }))
  }, [skills])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    // La recherche porte aussi sur le chemin : taper « kite » doit remonter les
    // savoirs rangés sous Escalade, même si aucun ne s'appelle ainsi.
    return options.filter(
      ({ skill, path }) =>
        skill.name.toLowerCase().includes(q) || path.toLowerCase().includes(q),
    )
  }, [options, query])

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <Input
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un savoir…"
        className="h-8 rounded-none border-0 border-b border-border"
      />
      <div className="max-h-52 overflow-y-auto py-1">
        {shown.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            {options.length === 0
              ? 'Aucune compétence dans ce domaine.'
              : 'Aucun savoir ne correspond.'}
          </p>
        )}
        {shown.map(({ skill, path }) => (
          <button
            key={skill.id}
            type="button"
            onClick={() => onChange(skill.id)}
            className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm hover:bg-muted/50"
          >
            <span className="min-w-0 flex-1 truncate">{skill.name}</span>
            {path && (
              <span className="max-w-[42%] shrink-0 truncate text-xs text-muted-foreground">
                {path}
              </span>
            )}
            {value === skill.id && (
              <Check className="size-4 shrink-0 text-primary" />
            )}
          </button>
        ))}
        {value && (
          <div className="mt-1 border-t border-border">
            <button
              type="button"
              onClick={() => onChange(null)}
              className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm text-muted-foreground hover:bg-muted/50"
            >
              <X className="size-4 shrink-0" />
              Ne travailler aucun savoir
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
