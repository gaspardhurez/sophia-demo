import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { type Domain, domainColor, domainColorValues } from '@/entities/domain'
import type { Project } from '@/entities/project'
import { type Skill, useUpdateSkill } from '@/entities/skill'
import { DeleteSkillDialog } from '@/features/skill/delete-skill'
import { ApiError } from '@/shared/api'
import { fmtShortDate } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'
import { Button, Input, Textarea, toast } from '@/shared/ui'

import { TreeExcerpt } from './tree-excerpt'

/**
 * L'en-tête d'un savoir (design #65, `prod/Savoir`) — **le même cadre que
 * Domaine et Projet** : le haut blanc de la carte que la page monte autour.
 *
 * Fil (domaine › ancêtres), tuile à la couleur du domaine, nom, une pastille
 * — verte si un cycle est en cours, grise s'il n'y en a qu'un de prévu, rien
 * sinon —, la date d'ouverture du cycle en cours (« depuis le … », #73),
 * crayon ; la description dessous ; à
 * droite, l'extrait d'arbre. Aucune action d'acquisition : elles vivent sous
 * les onglets des cycles.
 *
 * Le crayon passe l'en-tête en édition, de la même forme que le projet : le
 * nom en champ, le bloc Description, puis Supprimer / Annuler / Enregistrer.
 */
export function SkillHeader({
  skill,
  path,
  domain,
  skills,
  projects,
  cycleCount,
  cycleDot,
  openedAt,
  onDeleted,
}: {
  skill: Skill
  /** Les ancêtres dans l'arbre, « A › B ». */
  path: string
  domain: Domain | undefined
  /** Tous les savoirs du domaine : l'extrait d'arbre, et ce que la
   * suppression emporte. */
  skills: Skill[]
  projects: Project[]
  cycleCount: number
  /** La pastille après le nom : un cycle en cours, sinon un cycle prévu,
   * sinon rien. */
  cycleDot: 'active' | 'planned' | null
  /** L'ouverture du cycle en cours, s'il y en a un : « depuis le … ». */
  openedAt: string | null
  onDeleted: () => void
}) {
  const accent = domainColor(domain?.color)
  const color = domainColorValues(domain?.color).base
  const update = useUpdateSkill()
  const [deleting, setDeleting] = useState(false)
  const [draft, setDraft] = useState<{
    name: string
    description: string
  } | null>(null)

  async function save() {
    if (!draft || !draft.name.trim()) return
    try {
      await update.mutateAsync({
        id: skill.id,
        body: {
          name: draft.name.trim(),
          description: draft.description.trim() || null,
        },
      })
      setDraft(null)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La mise à jour a échoué',
      )
    }
  }

  const tile = cn(
    'grid size-9 shrink-0 place-items-center rounded-[10px] border text-xl',
    accent.soft,
  )
  const crumb = domain && (
    <Link
      to={`/domains/${domain.id}`}
      className="self-start text-xs text-muted-foreground hover:text-foreground"
    >
      {domain.emoji} {domain.name}
      {path && ` › ${path}`}
    </Link>
  )

  const deleteDialog = deleting && (
    <DeleteSkillDialog
      skill={skill}
      childCount={skills.filter((s) => s.parent_skill_id === skill.id).length}
      parentName={
        skills.find((s) => s.id === skill.parent_skill_id)?.name ?? null
      }
      projects={projects.filter((o) => o.skill_ids.includes(skill.id))}
      cycleCount={cycleCount}
      onClose={() => setDeleting(false)}
      onDeleted={onDeleted}
    />
  )

  if (draft) {
    const muted = 'h-8 px-2.5 text-xs font-semibold'
    return (
      <section className="grid gap-3.5 border-b bg-card px-6 py-5">
        {crumb}
        <div className="flex items-center gap-3">
          <span aria-hidden className={tile}>
            {domain?.emoji || '•'}
          </span>
          <Input
            autoFocus
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            aria-label="Nom du savoir"
            aria-required
            className="h-10 flex-1 font-heading text-lg font-semibold tracking-[-0.01em]"
          />
        </div>
        <label className="grid max-w-[720px] gap-3">
          <span className="grid gap-0.5">
            <span className="font-heading text-sm font-semibold">
              Description
            </span>
            <span className="text-xs text-pretty text-muted-foreground">
              Ce que recouvre ce savoir.
            </span>
          </span>
          <Textarea
            rows={2}
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </label>
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="ghost"
            className={cn(
              muted,
              'gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive',
            )}
            onClick={() => setDeleting(true)}
          >
            <Trash2 className="size-3.5" /> Supprimer
          </Button>
          <Button
            variant="outline"
            className={cn(muted, 'ml-auto')}
            onClick={() => setDraft(null)}
          >
            Annuler
          </Button>
          <Button
            className={muted}
            onClick={() => void save()}
            isPending={update.isPending}
            disabled={!draft.name.trim()}
          >
            Enregistrer
          </Button>
        </div>
        {deleteDialog}
      </section>
    )
  }

  return (
    <section className="group/head flex flex-wrap items-center gap-x-8 gap-y-5 border-b bg-card px-6 py-5">
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
        {crumb}
        <div className="flex flex-wrap items-center gap-3">
          <span aria-hidden className={tile}>
            {domain?.emoji || '•'}
          </span>
          <h1 className="font-heading text-[22px] leading-none font-semibold tracking-[-0.02em]">
            {skill.name}
            {/* Dans la ligne du titre, alignée au milieu des minuscules
                (`vertical-align: middle`), pas au milieu de sa boîte. */}
            {cycleDot && (
              <span
                role="img"
                title={cycleDot === 'active' ? 'Cycle en cours' : 'Cycle prévu'}
                aria-label={
                  cycleDot === 'active' ? 'Cycle en cours' : 'Cycle prévu'
                }
                className={cn(
                  'ml-3 inline-block size-2 rounded-full align-middle',
                  cycleDot === 'active'
                    ? 'bg-emerald-500'
                    : 'bg-muted-foreground/45',
                )}
              />
            )}
          </h1>
          {openedAt && (
            <span className="text-[13px] leading-none text-muted-foreground tabular-nums">
              depuis le {fmtShortDate(new Date(openedAt))}
            </span>
          )}
          <button
            type="button"
            onClick={() =>
              setDraft({
                name: skill.name,
                description: skill.description ?? '',
              })
            }
            aria-label="Éditer le savoir"
            className="-ml-1.5 grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/head:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
          >
            <Pencil className="size-4" />
          </button>
        </div>
        {skill.description && (
          <p className="max-w-[720px] text-[13px] leading-normal whitespace-pre-line text-pretty text-muted-foreground">
            {skill.description}
          </p>
        )}
      </div>
      {domain && (
        <TreeExcerpt
          skill={skill}
          skills={skills}
          domain={domain}
          color={color}
        />
      )}
    </section>
  )
}
