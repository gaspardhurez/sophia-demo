import type { ReactNode } from 'react'

import type { RampItem } from '@/entities/plan'
import type {
  EvalMode,
  PracticeItem,
  PracticeItemUpdate,
  PracticeKind,
} from '@/entities/practice'
import { cn } from '@/shared/lib/utils'
import { Input, Textarea } from '@/shared/ui'

/** Une section du corps : un intitulé, et ce qu'il porte. */
export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-heading text-sm font-semibold">{label}</h3>
      {children}
    </section>
  )
}

/** Un choix entre deux ou trois valeurs — des pastilles, pas un select. */
function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 rounded-md border px-3 text-[13px] font-medium transition-colors',
            value === o.value
              ? 'border-transparent bg-foreground text-background'
              : 'border-border bg-card hover:bg-muted/50',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Les champs d'un objet en édition — Nature (pas pour une mise en situation),
 * puis pour un intégré Énoncé, Solution, Évaluation ; Instructions (Critères
 * de réussite) ; Référence (pas pour une mise en situation). Partagés par la
 * modale d'objet et la fiche d'une pièce en Modifier (#149).
 */
export function ItemFields({
  item,
  value,
  set,
}: {
  item: PracticeItem | RampItem
  value: <K extends keyof PracticeItem>(key: K) => PracticeItem[K]
  set: (patch: PracticeItemUpdate) => void
}) {
  const kind = value('kind')
  const situation = item.nature === 'situation'

  return (
    <>
      {!situation && (
        <Field label="Nature">
          <Choice<PracticeKind>
            value={kind}
            options={[
              { value: 'manual', label: 'Manuel' },
              { value: 'integrated', label: 'Intégré' },
            ]}
            onChange={(k) => set({ kind: k })}
          />
        </Field>
      )}

      {kind === 'integrated' && (
        <>
          <Field label="Énoncé">
            <Choice
              value={value('statement_source') ?? 'generated'}
              options={[
                { value: 'generated', label: 'Généré' },
                { value: 'uploaded', label: 'Uploadé' },
              ]}
              onChange={(v) => set({ statement_source: v })}
            />
          </Field>
          <Field label="Solution">
            <Choice
              value={value('solution_source') ?? 'generated'}
              options={[
                { value: 'generated', label: 'Générée' },
                { value: 'uploaded', label: 'Uploadée' },
              ]}
              onChange={(v) => set({ solution_source: v })}
            />
          </Field>
        </>
      )}

      {kind !== 'manual' && (
        <Field label="Évaluation">
          <Choice<EvalMode>
            value={value('eval_mode')}
            options={[
              { value: 'self', label: 'Auto-évaluation' },
              { value: 'sophia', label: 'Évaluation Sophia' },
            ]}
            onChange={(v) => set({ eval_mode: v })}
          />
        </Field>
      )}

      <Field label={situation ? 'Critères de réussite' : 'Instructions'}>
        <Textarea
          value={value('instructions') ?? ''}
          onChange={(e) => set({ instructions: e.target.value })}
          placeholder={
            situation
              ? 'À quoi on saura que c’est tenu.'
              : 'La consigne — ce qu’on fait, et où.'
          }
          className="min-h-20"
        />
      </Field>

      {/* Pas de champ pour « où j'en suis » : ce texte est le compte-rendu
              d'une passe, il s'écrit sur la séance et se lit d'elle. L'objet
              n'a pas à recevoir un texte de plus. */}
      {!situation && (
        <Field label="Référence">
          <Input
            value={value('reference') ?? ''}
            onChange={(e) => set({ reference: e.target.value })}
            placeholder="Un lien, une page, une source"
          />
        </Field>
      )}
    </>
  )
}
