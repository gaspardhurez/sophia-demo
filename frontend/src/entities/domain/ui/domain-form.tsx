import { zodResolver } from '@hookform/resolvers/zod'
import { Check } from 'lucide-react'
import { useForm } from 'react-hook-form'

import { cn } from '@/shared/lib/utils'
import {
  Button,
  DialogFooter,
  EmojiField,
  FieldError,
  Input,
  Label,
  RequiredMark,
  Textarea,
} from '@/shared/ui'

import {
  DEFAULT_DOMAIN_COLOR,
  domainColor,
  DOMAIN_COLORS,
} from '../model/color'
import { domainFormSchema, type DomainFormValues } from '../model/schema'

interface DomainFormProps {
  defaultValues?: DomainFormValues
  submitLabel: string
  /** Doit rejeter en cas d'échec — le formulaire s'appuie dessus pour `isSubmitting`. */
  onSubmit: (values: DomainFormValues) => Promise<void>
  /** Ferme sans enregistrer. Absent → pas de bouton Annuler. */
  onCancel?: () => void
}

/**
 * Les champs d'un domaine et leur validation. Ne connaît ni mutation, ni
 * dialog, ni navigation : ce sont les features qui l'enveloppent.
 */
export function DomainForm({
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: DomainFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DomainFormValues>({
    resolver: zodResolver(domainFormSchema),
    defaultValues: defaultValues ?? {
      name: '',
      emoji: '',
      color: DEFAULT_DOMAIN_COLOR,
      vision: '',
    },
  })
  const color = watch('color')
  const emoji = watch('emoji')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      {/* `contents` : le fieldset désactive tout pendant l'envoi sans peser
          sur la grille. Sinon on continue à taper dans un formulaire parti. */}
      <fieldset disabled={isSubmitting} className="contents">
        <div className="flex gap-3">
          <div className="grid w-16 shrink-0 gap-2">
            <Label htmlFor="emoji">Emoji</Label>
            <EmojiField
              id="emoji"
              value={emoji}
              onChange={(v) => setValue('emoji', v, { shouldDirty: true })}
              aria-invalid={!!errors.emoji}
            />
          </div>
          <div className="grid flex-1 gap-2">
            <Label htmlFor="name">
              Nom <RequiredMark />
            </Label>
            <Input
              id="name"
              placeholder="Cuisine"
              aria-invalid={!!errors.name}
              {...register('name')}
            />
            <FieldError message={errors.name?.message} />
          </div>
        </div>
        <FieldError message={errors.emoji?.message} />

        <div className="grid gap-2">
          <Label>Couleur</Label>
          <div className="flex flex-wrap gap-2">
            {DOMAIN_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setValue('color', c.key, { shouldDirty: true })}
                title={c.label}
                aria-label={c.label}
                aria-pressed={color === c.key}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-white transition-transform hover:scale-110',
                  domainColor(c.key).dot,
                  color === c.key && 'ring-2 ring-ring ring-offset-2',
                )}
              >
                {color === c.key && <Check className="size-4" />}
              </button>
            ))}
          </div>
          <FieldError message={errors.color?.message} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="vision">Vision</Label>
          <Textarea
            id="vision"
            rows={3}
            placeholder="Devenir un chef cuisinier à la maison…"
            aria-invalid={!!errors.vision}
            {...register('vision')}
          />
          <FieldError message={errors.vision?.message} />
        </div>
      </fieldset>

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
        <Button type="submit" isPending={isSubmitting}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
