import { type ReactNode, useState } from 'react'

import { type RampItem, useUpdatePlanItem } from '@/entities/plan'
import {
  type PracticeItem,
  type PracticeItemUpdate,
  useUpdatePracticeItem,
} from '@/entities/practice'
import { ApiError } from '@/shared/api'
import { Button, EmojiField, Input, toast } from '@/shared/ui'

import { CriterionField } from './criterion-field'
import { DeleteItemDialog } from './delete-item-dialog'
import { ItemFields } from './item-fields'

/** Les morceaux de la fiche d'une pièce en Modifier, posés par la fiche à la
 *  place des siens. */
export interface ItemEditorParts {
  /** La tuile du rail : elle ouvre le choix de l'emoji. */
  tile: ReactNode
  /** Le titre devenu le champ du nom. */
  title: ReactNode
  /** L'encadré gris : ses textes devenus les champs. */
  box: ReactNode
  /** Supprimer · Annuler · Enregistrer. */
  footer: ReactNode
}

/**
 * Modifier un objet **dans sa fiche** (#149, `kit/Fiche piece`) : la fiche
 * garde sa largeur et son rail ; la tuile ouvre l'emoji, le titre devient le
 * nom, l'encadré ses champs (`ItemFields`, ceux de la modale d'objet), et le
 * pied Supprimer · Annuler · Enregistrer. Annuler et Enregistrer rendent la
 * fiche en lecture (`onDone`) ; Supprimer, confirmé, la ferme (`onDeleted`).
 *
 * Dans un cycle (`planId`, un objet de sa rampe), l'encadré s'ouvre sur le
 * **critère de maîtrise** (#157, « Maîtrisée après 3 passes à 5/5 ») : il
 * appartient au lien de l'objet avec ce cycle, et s'enregistre avec le reste.
 *
 * Rendu par props : la fiche vit dans une autre feature, la page compose.
 */
export function PracticeItemEditor({
  item,
  planId,
  onDone,
  onDeleted,
  children,
}: {
  item: PracticeItem | RampItem
  /** Le cycle de la fiche : son critère s'y règle. */
  planId?: string
  onDone: () => void
  onDeleted: () => void
  children: (parts: ItemEditorParts) => ReactNode
}) {
  const [draft, setDraft] = useState<PracticeItemUpdate>({})
  const [deleting, setDeleting] = useState(false)
  const update = useUpdatePracticeItem()
  const updateLink = useUpdatePlanItem()
  // Le critère n'existe que dans un cycle, pour un objet de sa rampe.
  const link = planId && 'criterion_passes' in item ? item : null
  const [criterion, setCriterion] = useState(
    link
      ? { passes: link.criterion_passes, level: link.criterion_level }
      : null,
  )

  const value = <K extends keyof PracticeItem>(key: K): PracticeItem[K] =>
    ((draft as Record<string, unknown>)[key] as PracticeItem[K]) ?? item[key]
  const set = (patch: PracticeItemUpdate) =>
    setDraft((d) => ({ ...d, ...patch }))

  async function save() {
    // Un nom vidé garde l'ancien : un objet sans nom ne se lit plus.
    const { title, ...rest } = draft
    const body = title?.trim() ? { ...rest, title: title.trim() } : rest
    const criterionChanged =
      link &&
      criterion &&
      (criterion.passes !== link.criterion_passes ||
        criterion.level !== link.criterion_level)
    try {
      if (Object.keys(body).length > 0)
        await update.mutateAsync({ id: item.id, body })
      if (planId && criterionChanged)
        await updateLink.mutateAsync({
          planId,
          itemId: item.id,
          body: {
            criterion_passes: criterion.passes,
            criterion_level: criterion.level,
          },
        })
      onDone()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La mise à jour a échoué',
      )
    }
  }

  return (
    <>
      {children({
        tile: (
          <EmojiField
            value={value('emoji') ?? ''}
            onChange={(emoji) => set({ emoji })}
            aria-label="Emoji"
            className="size-[52px] rounded-[14px] border-0 bg-white text-[26px] shadow-[0_0_0_2px_rgb(255_255_255/0.35)]"
          />
        ),
        title: (
          <Input
            autoFocus
            aria-label="Nom"
            placeholder="Nom"
            value={value('title') ?? ''}
            onChange={(e) => set({ title: e.target.value })}
            className="-mt-1 -ml-[11px] h-10 font-heading text-[19px] font-semibold md:text-[19px]"
          />
        ),
        box: (
          <div className="flex flex-col gap-3.5 rounded-xl bg-muted/50 px-4 py-3.5">
            {criterion && (
              <CriterionField
                passes={criterion.passes}
                level={criterion.level}
                onChange={setCriterion}
              />
            )}
            <ItemFields item={item} value={value} set={set} />
          </div>
        ),
        footer: (
          <>
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/8 hover:text-destructive"
              onClick={() => setDeleting(true)}
            >
              Supprimer
            </Button>
            <span className="flex-1" />
            <Button variant="outline" onClick={onDone}>
              Annuler
            </Button>
            <Button
              isPending={update.isPending || updateLink.isPending}
              onClick={() => void save()}
            >
              Enregistrer
            </Button>
          </>
        ),
      })}

      {deleting && (
        <DeleteItemDialog
          item={item}
          onDone={() => {
            setDeleting(false)
            onDeleted()
          }}
          onCancel={() => setDeleting(false)}
        />
      )}
    </>
  )
}
