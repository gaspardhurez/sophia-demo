import { Compass } from 'lucide-react'
import { Fragment } from 'react'

import { type AcquisitionPlan, pickCycle, usePlans } from '@/entities/plan'
import {
  type CycleTextKey,
  CycleTextField,
  ScopeTagsField,
} from '@/features/plan/edit-cycle-field'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui'

/** Les textes du cycle de l'encart, dans l'ordre. */
const FIELDS = [
  { field: 'target_level', label: 'Intention' },
  { field: 'scope', label: 'Périmètre' },
] as const satisfies readonly { field: CycleTextKey; label: string }[]

/**
 * L'en-tête des notes (#173, `prod/Notes`) : un encart gris en tête de la
 * feuille — 📓 et le nom du savoir ; dessous, l'**Intention** (le niveau visé
 * du cycle, `target_level`, texte) et le **Périmètre** (`scope`, en
 * étiquettes repliées sur deux lignes, #176), tous deux écrits en place.
 *
 * Un texte vide ne s'affiche pas (29/10, décision de l'utilisateur) : l'encart
 * s'**étire au survol** — ou au focus, au clavier comme pendant la saisie —
 * pour montrer ses « + Ajouter », et se replie ensuite.
 *
 * Rien de cadré — ni intention ni périmètre, sur un cycle qui n'est pas
 * clos — : « Cadrer l'étude », bouton primaire à droite du nom (#175, en
 * plus de l'action de la colonne), qui ouvre la modale du même nom ; comme
 * les champs vides, il n'apparaît qu'au survol de l'encart ou au focus
 * (30/10).
 *
 * Le cycle est celui de la colonne (`pickCycle`). Sans cycle, l'encart ne
 * porte que 📓 et le nom.
 */
export function NotesHeader({
  skillId,
  skillName,
  onFrame,
}: {
  skillId: string
  skillName: string
  /** Ouvrir « Cadrer l'étude » (la page tient la modale). */
  onFrame: () => void
}) {
  const { data: plans } = usePlans(skillId)
  const plan = pickCycle(plans ?? [], null)
  const filled = FIELDS.filter((f) => plan?.[f.field])
  const empty = FIELDS.filter((f) => !plan?.[f.field])
  const unframed =
    plan !== null &&
    filled.length === 0 &&
    plan.state !== 'completed' &&
    plan.state !== 'abandoned'

  return (
    <div className="group/header flex flex-col rounded-xl bg-foreground/[0.025] px-6 pt-[22px] pb-[18px]">
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-[30px] leading-none">
          📓
        </span>
        <h1 className="min-w-0 flex-1 font-heading text-[30px] leading-[1.15] font-bold tracking-[-0.025em]">
          {skillName}
        </h1>
        {unframed && (
          <Button
            size="sm"
            // Au survol de l'encart (ou au focus), comme les champs vides
            // (30/10, décision de l'utilisateur).
            className="gap-[7px] px-3 text-[13px] font-medium opacity-0 transition-opacity duration-150 group-focus-within/header:opacity-100 group-hover/header:opacity-100 focus-visible:opacity-100"
            onClick={onFrame}
          >
            <Compass className="size-3.5" />
            Cadrer l'étude
          </Button>
        )}
      </div>
      {plan && filled.length > 0 && (
        <Fields plan={plan} fields={filled} className="pt-3.5" />
      )}
      {plan && empty.length > 0 && (
        // Replié par défaut ; la hauteur suit le contenu (0fr → 1fr).
        <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-150 group-focus-within/header:grid-rows-[1fr] group-hover/header:grid-rows-[1fr]">
          <div className="min-h-0 overflow-hidden">
            <Fields
              plan={plan}
              fields={empty}
              className={filled.length ? 'pt-1' : 'pt-3.5'}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Fields({
  plan,
  fields,
  className,
}: {
  plan: AcquisitionPlan
  fields: readonly { field: CycleTextKey; label: string }[]
  className: string
}) {
  return (
    <div
      className={`grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm leading-[22px] ${className}`}
    >
      {fields.map(({ field, label }) => (
        <Fragment key={field}>
          <span
            className={cn(
              'text-[12.5px] text-muted-foreground',
              // Aligné sur la première ligne d'étiquettes (26 px).
              field === 'scope' && plan.scope && 'leading-[26px]',
            )}
          >
            {label}
          </span>
          {field === 'scope' ? (
            <ScopeTagsField plan={plan} />
          ) : (
            <CycleTextField plan={plan} field={field} label={label} />
          )}
        </Fragment>
      ))}
    </div>
  )
}
