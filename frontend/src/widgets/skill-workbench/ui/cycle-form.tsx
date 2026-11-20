import { type Project, ProjectsField } from '@/entities/project'
import type { PlanDraft } from '@/features/plan/edit-plan'
import { Button, Input } from '@/shared/ui'

const heading = 'font-heading text-sm font-semibold'

/**
 * Le réglage du cycle en **Ajuster** (design #65 et #66, `prod/Savoir`), sous
 * les onglets — même mode pour préparer un cycle prévu ou remplir un cycle
 * clos : « Nom du cycle » (facultatif ; à défaut, l'onglet prend le nom de
 * repli), « Niveau visé », « Pour » (les projets ; pas sur un cycle clos,
 * qui n'en change plus), Annuler / Enregistrer. Tout ce qui est ici attend
 * « Enregistrer ».
 */
export function CycleForm({
  draft,
  closed,
  candidates,
  projects,
  onCancel,
  onSave,
}: {
  draft: PlanDraft
  closed: boolean
  /** Les projets qu'on peut rattacher : ceux du domaine, encore ouverts. */
  candidates: Project[]
  projects: Project[]
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="flex flex-col gap-4 border-b bg-card px-6 py-4">
      <label className="flex max-w-[560px] flex-col gap-2.5">
        <span className={heading}>Nom du cycle</span>
        <Input
          autoFocus
          placeholder="Exemple : Les bases"
          value={draft.value('name') ?? ''}
          onChange={(e) => draft.patch({ name: e.target.value })}
          className="h-9"
        />
      </label>
      <label className="flex max-w-[560px] flex-col gap-2.5">
        <span className="flex flex-col gap-0.5">
          <span className={heading}>Niveau visé</span>
          <span className="text-xs text-muted-foreground">
            Ce que tu sauras faire à la fin de ce cycle.
          </span>
        </span>
        <Input
          placeholder="Exemple : le faire sans y penser"
          value={draft.value('target_level') ?? ''}
          onChange={(e) => draft.patch({ target_level: e.target.value })}
          className="h-9"
        />
      </label>
      {!closed && (
        <div className="flex flex-col gap-2.5">
          <span className={heading}>Pour</span>
          <ProjectsField
            value={draft.value('project_ids') ?? []}
            onChange={(ids) => draft.patch({ project_ids: ids })}
            candidates={candidates}
            projects={projects}
          />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        <Button size="sm" disabled={draft.saving} onClick={onSave}>
          Enregistrer
        </Button>
      </div>
    </div>
  )
}
