import { CalendarDays, Pencil } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { LevelChip } from '@/entities/activity'
import type { DomainColorClasses, DomainColorValues } from '@/entities/domain'
import { cn } from '@/shared/lib/utils'
import { Button, DoneMark, MissedMark } from '@/shared/ui'

import type { PieceSheetMark, PieceSheetPass } from '../model/types'

/** La saisie du retour d'une passe, fournie par qui monte la fiche (elle vit
 *  dans une autre feature) : `close` la referme, enregistrée ou non. */
export type FeedbackEditorSlot = (
  pass: PieceSheetPass & { feedback: NonNullable<PieceSheetPass['feedback']> },
  close: () => void,
) => ReactNode

/** « Septembre » ; l'année en plus hors de l'année en cours. */
function monthOf(day: string): string {
  const d = new Date(`${day}T00:00:00`)
  const label = d.toLocaleDateString('fr-FR', {
    month: 'long',
    ...(d.getFullYear() === new Date().getFullYear()
      ? {}
      : { year: 'numeric' }),
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Les lignes, groupées par mois dans l'ordre du fil. */
function byMonth(passes: PieceSheetPass[]) {
  const groups: { month: string; rows: PieceSheetPass[] }[] = []
  for (const p of passes) {
    const month = monthOf(p.day)
    const last = groups.at(-1)
    if (last?.month === month) last.rows.push(p)
    else groups.push({ month, rows: [p] })
  }
  return groups
}

/**
 * Les **séances** de la fiche (`kit/Fiche piece`, idéation 14k ; #139 point
 * 3 : « Séances », plus « Passes ») : le nombre, l'icône Planifier juste
 * après ; puis par mois, une ligne par séance — le jour en grand, un point
 * relié au suivant par un fil (coche pleine si faite, anneau si à venir), le
 * titre de la séance, le niveau (« 3/5 · Avec erreurs ») et la note dessous.
 * Au survol d'une séance faite, un crayon rouvre la saisie du retour. Sans
 * séance : « Jamais fait » en pointillé.
 */
export function SheetPasses({
  passes,
  count,
  accent,
  values,
  onPlan,
  feedbackEditor,
}: {
  passes: PieceSheetPass[]
  count: number
  accent: DomainColorClasses
  values: DomainColorValues
  /** Absent : pas d'icône Planifier (cycle clos). */
  onPlan?: () => void
  /** Absent : pas de crayon. */
  feedbackEditor?: FeedbackEditorSlot
}) {
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <section className="flex flex-col gap-0.5">
      <h3 className="mb-1.5 flex items-center gap-2 font-heading text-sm font-semibold">
        Séances
        {count > 0 && (
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
        {onPlan && (
          <Button
            variant="ghost"
            size="icon-xs"
            title="Planifier"
            aria-label="Planifier"
            onClick={onPlan}
            className="-ml-0.5 text-muted-foreground"
          >
            <CalendarDays className="size-[15px]" />
          </Button>
        )}
      </h3>

      {byMonth(passes).map((group) => (
        <div key={group.month} className="flex flex-col">
          <span className="py-1.5 pl-10 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {group.month}
          </span>
          {group.rows.map((p) => {
            const target = p.feedback
            const isEditing = editing === p.key && target && feedbackEditor
            return (
              <div
                key={p.key}
                className="grid grid-cols-[26px_15px_minmax(0,1fr)] gap-x-3"
              >
                <span
                  className={cn(
                    'text-right font-heading text-[15px] leading-[15px] font-semibold tabular-nums',
                    (p.mark === 'planned' || p.mark === 'missed') &&
                      'text-muted-foreground',
                  )}
                >
                  {Number(p.day.slice(8, 10))}
                </span>
                <span className="flex flex-col items-center">
                  <PassMark mark={p.mark} accent={accent} values={values} />
                  <span
                    aria-hidden
                    className="min-h-2.5 w-0.5 flex-1 bg-border"
                  />
                </span>
                <div className="group/pass flex min-w-0 flex-col gap-[3px] pb-3">
                  <span className="flex min-h-[15px] items-center gap-2 leading-[15px]">
                    <span className="truncate text-[13.5px] font-medium">
                      {p.title}
                    </span>
                    {p.level !== null && !isEditing && (
                      <LevelChip level={p.level} withLabel />
                    )}
                    {target && feedbackEditor && !isEditing && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Niveau"
                        aria-label="Modifier le retour"
                        onClick={() => setEditing(p.key)}
                        // Hors du flux en hauteur : ses 24 px ne doivent pas
                        // pousser le titre sous la date et la coche.
                        className="-my-[5px] ml-auto text-muted-foreground opacity-0 group-hover/pass:opacity-100 focus-visible:opacity-100"
                      >
                        <Pencil className="size-[13px]" />
                      </Button>
                    )}
                  </span>
                  {isEditing
                    ? feedbackEditor({ ...p, feedback: target }, () =>
                        setEditing(null),
                      )
                    : p.note && (
                        <span className="text-[12.5px] text-pretty whitespace-pre-wrap text-foreground/70">
                          {p.note}
                        </span>
                      )}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {passes.length === 0 && (
        <div className="grid min-h-11 place-items-center rounded-lg border border-dashed text-[12.5px] text-muted-foreground">
          Jamais fait
        </div>
      )}
    </section>
  )
}

/**
 * Le point d'une ligne : coche pleine à l'encre (faite), anneau (à venir),
 * croix grise (passée sans être cochée), demi-disque (passation ouverte), ou
 * la marque grise d'un événement de l'interro (📓, ↺).
 */
function PassMark({
  mark,
  accent,
  values,
}: {
  mark: PieceSheetMark
  accent: DomainColorClasses
  values: DomainColorValues
}) {
  if (mark === 'done') return <DoneMark size="row" className={accent.ink} />
  if (mark === 'missed') return <MissedMark size="row" />
  if (mark === 'launch' || mark === 'restart')
    return (
      <span
        aria-hidden
        className="grid size-[15px] shrink-0 place-items-center rounded-full bg-muted text-[10px] leading-none text-foreground/70"
      >
        {mark === 'launch' ? '📓' : '↺'}
      </span>
    )
  if (mark === 'open')
    return (
      <span
        aria-hidden
        className="size-[15px] shrink-0 rounded-full border-[1.5px]"
        style={{
          borderColor: values.ink,
          background: `conic-gradient(${values.ink} 0 50%, var(--color-card) 50% 100%)`,
        }}
      />
    )
  return (
    <span
      aria-hidden
      className="size-[15px] shrink-0 rounded-full border-[1.5px] border-muted-foreground/50 bg-card"
    />
  )
}
