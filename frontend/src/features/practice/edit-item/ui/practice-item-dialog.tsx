import { ArrowUpRight, CalendarDays, Check } from 'lucide-react'
import { useState } from 'react'

import type { DomainColorClasses } from '@/entities/domain'
import { PHASES, type RampItem, useUpdatePlanItem } from '@/entities/plan'
import {
  type PracticeItem,
  type PracticeItemUpdate,
  PRACTICE_KIND_META,
  useCreatePracticeItem,
  useUpdatePracticeItem,
} from '@/entities/practice'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  Chip,
  CHIP_TONES,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  EmojiField,
  Input,
  toast,
} from '@/shared/ui'

import { DeleteItemDialog } from './delete-item-dialog'
import { Field, ItemFields } from './item-fields'
import { ItemHistory } from './item-history'

/**
 * La modale d'un objet de pratique — **le même objet, en lecture puis en
 * édition**, et non deux écrans.
 *
 * Pas de croix, pas de bascule en haut à droite : tout ce qui engage vit dans
 * le pied. En lecture on planifie, on tranche, on passe en édition ; en édition
 * on supprime, on annule, on enregistre. Le nom s'édite dans l'en-tête — un
 * champ « Nom » dans le corps ferait doublon avec le titre.
 *
 * **Le verdict est celui d'un cycle** : ouverte depuis la rampe d'un cycle
 * (`planId` et un objet de sa rampe), la modale tranche dans ce cycle. Ouverte
 * depuis la bibliothèque, elle n'en porte pas. Créé depuis un cycle, l'objet
 * entre aussi en fin de sa rampe.
 */
export function PracticeItemDialog({
  item,
  open,
  onOpenChange,
  accent,
  domainEmoji,
  onPlan,
  planId,
  initialMode = 'read',
}: {
  item: PracticeItem | RampItem
  /** Le cycle d'où on l'ouvre : son verdict s'y lit et s'y tranche. */
  planId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `edit` quand on arrive par le crayon du mode édition. */
  initialMode?: 'read' | 'edit'
  accent: DomainColorClasses
  domainEmoji: string
  /** Planifier une séance sur cet objet — la page tient la modale. */
  onPlan: (item: PracticeItem | RampItem) => void
}) {
  // Un objet sans id n'existe pas encore : la modale s'ouvre alors en édition
  // et « Enregistrer » le crée.
  const creating = item.id === ''
  const [editing, setEditing] = useState(creating || initialMode === 'edit')
  const [deleting, setDeleting] = useState(false)
  const [draft, setDraft] = useState<PracticeItemUpdate>({})
  const update = useUpdatePracticeItem()
  const create = useCreatePracticeItem()
  const judge = useUpdatePlanItem()
  // Le verdict n'existe que dans un cycle, pour un objet de sa rampe.
  const done = planId && 'done' in item ? item.done : null
  // Réussi(e) en chip : le critère rempli ou le verdict posé (#157) ; le
  // bouton, lui, ne dit que le verdict.
  const mastered = planId && 'mastered' in item ? item.mastered : done

  async function setDone(value: boolean) {
    if (!planId) return
    try {
      await judge.mutateAsync({
        planId,
        itemId: item.id,
        body: { done: value },
      })
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La mise à jour a échoué',
      )
    }
  }

  const value = <K extends keyof PracticeItem>(key: K): PracticeItem[K] =>
    ((draft as Record<string, unknown>)[key] as PracticeItem[K]) ?? item[key]
  const set = (patch: PracticeItemUpdate) =>
    setDraft((d) => ({ ...d, ...patch }))

  const kind = PRACTICE_KIND_META[value('kind')]
  const situation = item.nature === 'situation'
  const phase = PHASES.find((p) => p.nature === item.nature)
  const badge = item.kind === 'integrated' ? CHIP_TONES.sky : accent.soft

  function close() {
    setEditing(false)
    setDraft({})
    onOpenChange(false)
  }

  async function patch(body: PracticeItemUpdate) {
    try {
      await update.mutateAsync({ id: item.id, body })
      return true
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La mise à jour a échoué',
      )
      return false
    }
  }

  async function save() {
    if (creating) {
      const title = (draft.title ?? '').trim()
      if (!title) return close()
      try {
        await create.mutateAsync({
          skillId: item.skill_id,
          body: {
            nature: item.nature,
            kind: draft.kind ?? 'manual',
            title,
            emoji: draft.emoji ?? null,
            instructions: draft.instructions ?? null,
            reference: draft.reference ?? null,
            eval_mode: draft.eval_mode ?? 'self',
            plan_id: planId ?? null,
            statement_source: draft.statement_source ?? null,
            solution_source: draft.solution_source ?? null,
          },
        })
        return close()
      } catch (err) {
        return toast.error(
          err instanceof ApiError ? err.message : "L'ajout a échoué",
        )
      }
    }
    if (Object.keys(draft).length === 0) return close()
    if (await patch(draft)) close()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent showCloseButton={false} className="sm:max-w-[512px]">
          <header className="flex items-center gap-3">
            {editing ? (
              <EmojiField
                value={value('emoji') ?? ''}
                onChange={(emoji) => set({ emoji })}
                className="size-[38px] shrink-0 rounded-[10px]"
              />
            ) : (
              <span
                aria-hidden
                className={cn(
                  'grid size-[38px] shrink-0 place-items-center rounded-[10px] border text-[19px]',
                  badge,
                )}
              >
                {item.emoji || domainEmoji || '•'}
              </span>
            )}
            {editing ? (
              <Input
                autoFocus
                value={value('title') ?? ''}
                onChange={(e) => set({ title: e.target.value })}
                aria-label="Nom"
              />
            ) : (
              <DialogTitle className="min-w-0 flex-1 text-lg">
                {item.title}
              </DialogTitle>
            )}
          </header>

          {/* La chip de phase reste en édition : c'est ce que l'objet sert,
              pas un état — et elle ne se change pas ici, la phase se choisit
              en créant l'objet. */}
          <div className="flex flex-wrap gap-1.5">
            {!editing && !situation && (
              <Chip className={kind.chipClassName}>{kind.label}</Chip>
            )}
            {phase && <Chip className={accent.soft}>{phase.label}</Chip>}
            {/* Une application porte son verdict en chip : ce qui compte
                d'elle, c'est si elle tient. */}
            {!editing && situation && mastered !== null && (
              <Chip tone={mastered ? 'emerald' : 'neutral'}>
                {mastered ? 'Réussie' : 'Pas réussie'}
              </Chip>
            )}
            {!editing && !situation && mastered && (
              <Chip tone="emerald">Réussi</Chip>
            )}
          </div>

          <div className="flex flex-col gap-5">
            {editing ? (
              <ItemFields item={item} value={value} set={set} />
            ) : (
              <ReadBody item={item} />
            )}
          </div>

          <DialogFooter className="sm:justify-start">
            {editing ? (
              <>
                {!creating && (
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setDeleting(true)}
                  >
                    Supprimer
                  </Button>
                )}
                <span className="flex-1" />
                <Button variant="ghost" onClick={close}>
                  Annuler
                </Button>
                <Button onClick={() => void save()}>Enregistrer</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => onPlan(item)}>
                  <CalendarDays className="size-4" /> Planifier
                </Button>
                <span className="flex-1" />
                {/* Un exercice intégré et une interro se valident en les
                    passant, pas en le déclarant : leur page arrive plus tard,
                    et un bouton qui n'ouvre rien vaut moins que son absence. */}
                {done === null ? null : item.kind === 'manual' ? (
                  /* Le libellé ne bouge pas — c'est le remplissage qui dit
                     l'état, comme partout ailleurs. Un bouton qui change de
                     mot à chaque clic se relit à chaque fois. */
                  <Button
                    variant={done ? 'outline' : 'default'}
                    className={done ? accent.filled : undefined}
                    onClick={() => void setDone(!done)}
                  >
                    <Check className="size-4" />
                    {situation
                      ? 'Mise en situation réussie'
                      : 'Exercice réussi'}
                  </Button>
                ) : (
                  /* Un intégré et une interro se valident en les passant : le
                     bouton mène à leur page, qui arrive plus tard. */
                  <Button disabled title="Sa page arrive au chantier suivant">
                    Ouvrir <ArrowUpRight className="size-4" />
                  </Button>
                )}
                <Button variant="outline" onClick={() => setEditing(true)}>
                  Modifier
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleting && (
        <DeleteItemDialog
          item={item}
          onDone={() => {
            setDeleting(false)
            close()
          }}
          onCancel={() => setDeleting(false)}
        />
      )}
    </>
  )
}

function ReadBody({ item }: { item: PracticeItem | RampItem }) {
  const evalLabel =
    item.eval_mode === 'sophia'
      ? 'Sophia, contre la solution'
      : 'auto-évaluation'

  return (
    <>
      {/* Le « Dernier bilan » de la maquette (intégré) attend la passation :
          rien ne le produit encore, la zone n'est donc pas affichée. */}

      {item.kind === 'integrated' && (
        <Field label="Comment il est fait">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Énoncé</dt>
            <dd>{sourceLabel(item.statement_source)}</dd>
            <dt className="text-muted-foreground">Solution</dt>
            <dd>{sourceLabel(item.solution_source)}</dd>
            <dt className="text-muted-foreground">Évaluation</dt>
            <dd>{evalLabel}</dd>
          </dl>
        </Field>
      )}

      {item.instructions && (
        <Field
          label={
            item.nature === 'situation'
              ? 'Critères de réussite'
              : 'Instructions'
          }
        >
          <p className="text-sm whitespace-pre-wrap text-pretty text-foreground/80">
            {item.instructions}
          </p>
        </Field>
      )}

      {item.reference && (
        <Field label="Référence">
          <p className="text-sm break-words underline underline-offset-[3px]">
            {item.reference}
          </p>
        </Field>
      )}

      <Field label="Historique">
        <ItemHistory item={item} />
      </Field>
    </>
  )
}

function sourceLabel(source: PracticeItem['statement_source']): string {
  if (source === 'uploaded') return 'uploadé'
  if (source === 'generated') return 'généré'
  return 'à définir'
}
