import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import {
  Button,
  DialogFooter,
  FieldError,
  Input,
  Label,
  RequiredMark,
  Textarea,
} from '@/shared/ui'

import { skillFormSchema, type SkillFormValues } from '../model/schema'

interface SkillFormProps {
  submitLabel: string
  /** Doit rejeter en cas d'échec — le formulaire s'appuie dessus pour `isSubmitting`. */
  onSubmit: (values: SkillFormValues) => Promise<void>
  /** Ferme sans enregistrer. Absent → pas de bouton Annuler. */
  onCancel?: () => void
}

/**
 * Les champs d'une compétence et leur validation. Ne connaît ni mutation, ni
 * dialog, ni le parent sous lequel elle sera créée : ce sont les features qui
 * l'enveloppent.
 */
export function SkillForm({ submitLabel, onSubmit, onCancel }: SkillFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SkillFormValues>({
    resolver: zodResolver(skillFormSchema),
    defaultValues: { name: '', description: '' },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <fieldset disabled={isSubmitting} className="contents">
        <div className="grid gap-2">
          <Label htmlFor="name">
            Nom <RequiredMark />
          </Label>
          <Input
            id="name"
            placeholder="Algèbre"
            aria-invalid={!!errors.name}
            {...register('name')}
          />
          <FieldError message={errors.name?.message} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            rows={2}
            aria-invalid={!!errors.description}
            {...register('description')}
          />
          <FieldError message={errors.description?.message} />
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
