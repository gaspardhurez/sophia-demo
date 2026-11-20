import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'

import { cn } from '@/shared/lib/utils'
import {
  Button,
  DialogFooter,
  EmojiField,
  FormSection,
  FieldError,
  Input,
  Label,
  RequiredMark,
} from '@/shared/ui'

import { metricFormSchema, type MetricFormValues } from '../model/schema'

interface MetricFormProps {
  defaultValues?: MetricFormValues
  submitLabel: string
  /** Doit rejeter en cas d'échec (le form s'appuie dessus pour `isSubmitting`). */
  onSubmit: (values: MetricFormValues) => Promise<void>
  /** Ferme sans enregistrer. Absent → pas de bouton Annuler. */
  onCancel?: () => void
  /**
   * Champ d'unité, **rendu par l'appelant** : `UnitField` vit dans
   * `entities/unit`, qu'une autre entité ne peut pas importer.
   */
  unitField?: (field: {
    value: string | null
    onChange: (unitId: string | null) => void
    invalid: boolean
  }) => ReactNode
}

/**
 * On nomme l'usage, pas le concept. « Sens » obligeait à deviner ce que ça
 * pilote ; « quelle valeur est ton record » se répond sans rien savoir du
 * modèle. Les exemples font le reste — le kilo va dans les deux sens (un squat
 * monte, un poids de corps descend), aucune déduction automatique ne peut le
 * trancher, d'où la déclaration.
 */
const RECORD_PICKS = [
  {
    key: 'up' as const,
    icon: ArrowUp,
    label: 'La plus haute',
    hint: 'squat, FTP, tractions',
  },
  {
    key: 'down' as const,
    icon: ArrowDown,
    label: 'La plus basse',
    hint: 'temps, classement, poids',
  },
]

/**
 * Champs d'une métrique + validation. Inerte : aucune mutation, aucune
 * navigation — il vit donc dans l'entité, partagé par la création et l'édition.
 */
export function MetricForm({
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
  unitField,
}: MetricFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MetricFormValues>({
    resolver: zodResolver(metricFormSchema),
    defaultValues: defaultValues ?? {
      name: '',
      emoji: '',
      unit_id: null,
      direction: 'up',
    },
  })

  const direction = watch('direction')
  const unitId = watch('unit_id')
  const emoji = watch('emoji')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
      <FormSection
        title="La métrique"
        hint="Ce qu'on mesure et dans quelle unité — un squat en kg, un temps en minutes."
      >
        {/* Emoji + nom sur une ligne, comme le formulaire d'activité type : deux
          formulaires qui décrivent le même genre d'objet doivent se ressembler. */}
        <div className="flex gap-3">
          <div className="grid w-16 shrink-0 gap-1.5">
            <Label htmlFor="metric-emoji">Emoji</Label>
            <EmojiField
              id="metric-emoji"
              value={emoji}
              onChange={(v) => setValue('emoji', v, { shouldDirty: true })}
              aria-invalid={!!errors.emoji}
            />
          </div>
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="metric-name">
              Nom <RequiredMark />
            </Label>
            <Input
              id="metric-name"
              placeholder="Squat 1RM, Temps sur 10 km, FTP…"
              autoFocus
              aria-invalid={!!errors.name}
              {...register('name')}
            />
            <FieldError message={errors.name?.message} />
          </div>
        </div>
        <FieldError message={errors.emoji?.message} />

        {unitField && (
          <div className="grid gap-1.5">
            <Label>Unité</Label>
            {unitField({
              value: unitId ?? null,
              onChange: (id) => setValue('unit_id', id, { shouldDirty: true }),
              invalid: !!errors.unit_id,
            })}
            <FieldError message={errors.unit_id?.message} />
          </div>
        )}
      </FormSection>

      <FormSection
        title="Affichage du record"
        hint="Quelle valeur retenir comme record ? Le kilo va dans les deux sens — un squat monte, un poids de corps descend."
      >
        <div className="grid grid-cols-2 gap-2">
          {RECORD_PICKS.map(({ key, icon: Icon, label, hint }) => {
            const selected = direction === key
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  setValue('direction', key, { shouldDirty: true })
                }
                className={cn(
                  'flex items-start gap-2 rounded-lg border p-2.5 text-left text-sm transition-[border-color,background-color] duration-200',
                  selected
                    ? 'border-ring bg-muted/60'
                    : 'border-input bg-card hover:border-ring hover:bg-muted/40',
                )}
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {hint}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </FormSection>

      <DialogFooter>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
