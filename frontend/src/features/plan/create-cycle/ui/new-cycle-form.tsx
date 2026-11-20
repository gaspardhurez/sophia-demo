import { useState } from 'react'

import { type Project, ProjectsField } from '@/entities/project'
import {
  type AcquisitionPlan,
  CycleMark,
  type CycleStage,
  RecallTargetControl,
  useCreatePlan,
} from '@/entities/plan'
import { ApiError } from '@/shared/api'
import { toDateISO } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'
import { Button, Input, toast } from '@/shared/ui'

/** Les trois statuts d'un cycle qui naît : prévu, en cours, déjà terminé. */
export type NewCycleStage = 'planned' | 'active' | 'finished'

const STAGES: { key: NewCycleStage; label: string; mark: CycleStage }[] = [
  { key: 'planned', label: 'Prévu', mark: 'planned' },
  { key: 'active', label: 'En cours', mark: 'active' },
  { key: 'finished', label: 'Déjà terminé', mark: 'acquired' },
]

const STATE = {
  planned: 'draft',
  active: 'active',
  finished: 'completed',
} as const

const heading = 'font-heading text-sm font-semibold'

/**
 * Le formulaire **Nouveau cycle** (design #66, `prod/Savoir`), sous l'onglet
 * brouillon : « Statut » (Prévu · En cours · Déjà terminé — En cours
 * impossible si un cycle l'est déjà), « Nom du cycle » et « Niveau visé »
 * côte à côte, puis « Pour » (prévu, en cours) ou « Période » (déjà terminé,
 * jamais dans le futur), et — sauf déjà terminé — le seuil de l'Étude
 * (#157, « Terminée à J+15 · 3 tests »). **Rien n'existe avant « Créer »** : le brouillon est
 * local, Annuler le jette.
 *
 * Déjà terminé : un cycle clos acquis à sa période, vide, sans projet — il
 * ne remplit rien ; on le remplit ensuite par Ajuster.
 *
 * Le statut est tenu par le parent, qui le montre aussi dans l'onglet.
 */
export function NewCycleForm({
  skillId,
  stage,
  onStageChange,
  hasActive,
  color,
  ink,
  candidates,
  projects,
  onCancel,
  onCreated,
}: {
  skillId: string
  stage: NewCycleStage
  onStageChange: (stage: NewCycleStage) => void
  /** Un cycle est déjà en cours : « En cours » n'est pas proposé. */
  hasActive: boolean
  /** La couleur du domaine (CSS), pour les marques de statut. */
  color: string
  /** L'encre du domaine (CSS), pour le seuil de l'étude. */
  ink: string
  /** Les projets qu'on peut rattacher : ceux du domaine, encore ouverts. */
  candidates: Project[]
  projects: Project[]
  onCancel: () => void
  onCreated: (plan: AcquisitionPlan) => void
}) {
  const create = useCreatePlan()
  const today = toDateISO(new Date())
  const [name, setName] = useState('')
  const [level, setLevel] = useState('')
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  // Le seuil de l'étude (#157) : 3 tests, J+15, par défaut.
  const [recallTarget, setRecallTarget] = useState(3)

  const finished = stage === 'finished'
  const periodOk = Boolean(start && end) && start <= end && end <= today

  async function submit() {
    try {
      const plan = await create.mutateAsync({
        skillId,
        // Le réglage de naissance, tel que le serveur le pose par défaut : le
        // contrat généré rend ces champs obligatoires.
        body: {
          state: STATE[stage],
          name: name.trim() || null,
          target_level: level.trim() || null,
          study: true,
          isolated: true,
          situation: true,
          retention: false,
          recall_target: recallTarget,
          project_ids: finished ? [] : projectIds,
          ...(finished && { started_on: start, finished_on: end }),
        },
      })
      onCreated(plan)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La création a échoué',
      )
    }
  }

  return (
    <div className="flex flex-col gap-4 border-b bg-card px-6 pt-4 pb-5">
      <div className="flex flex-col gap-2.5">
        <span className={heading}>Statut</span>
        <div
          role="radiogroup"
          aria-label="Statut"
          className="flex gap-0.5 self-start rounded-lg bg-muted p-[3px]"
        >
          {STAGES.map((s) => {
            const off = s.key === 'active' && hasActive
            const on = stage === s.key
            return (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={on}
                aria-disabled={off}
                title={off ? 'Un cycle est déjà en cours' : s.label}
                onClick={() => !off && onStageChange(s.key)}
                className={cn(
                  'inline-flex h-7 items-center gap-[7px] rounded-md px-3 text-xs font-semibold',
                  on
                    ? 'bg-card text-foreground shadow-[0_1px_2px_0_oklch(0.21_0.008_285/0.12)]'
                    : 'text-muted-foreground',
                  off && 'cursor-not-allowed opacity-40',
                )}
              >
                <CycleMark stage={s.mark} color={color} size="sm" />
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid max-w-[760px] grid-cols-2 gap-4 max-[700px]:grid-cols-1">
        <label className="flex flex-col gap-2.5">
          <span className={heading}>Nom du cycle</span>
          <Input
            autoFocus
            placeholder="Exemple : Les bases"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9"
          />
        </label>
        <label className="flex flex-col gap-2.5">
          <span className="flex flex-col gap-0.5">
            <span className={heading}>Niveau visé</span>
            <span className="text-xs text-muted-foreground">
              Ce que tu sauras faire à la fin de ce cycle.
            </span>
          </span>
          <Input
            placeholder="Exemple : le faire sans y penser"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="h-9"
          />
        </label>
      </div>

      {finished ? (
        <div className="flex flex-col gap-2.5">
          <span className={heading}>Période</span>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="Début"
              max={end || today}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-9 w-[170px]"
            />
            <span className="text-muted-foreground">→</span>
            <Input
              type="date"
              aria-label="Fin"
              min={start}
              max={today}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="h-9 w-[170px]"
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <span className={heading}>Pour</span>
          <ProjectsField
            value={projectIds}
            onChange={setProjectIds}
            candidates={candidates}
            projects={projects}
          />
        </div>
      )}

      {!finished && (
        <div className="flex max-w-[360px] flex-col gap-1">
          <span className={heading}>Étude</span>
          <RecallTargetControl
            value={recallTarget}
            onChange={setRecallTarget}
            ink={ink}
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        <Button
          size="sm"
          isPending={create.isPending}
          disabled={finished && !periodOk}
          onClick={() => void submit()}
        >
          Créer
        </Button>
      </div>
    </div>
  )
}
