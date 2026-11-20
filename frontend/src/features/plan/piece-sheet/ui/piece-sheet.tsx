import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Play,
  RotateCcw,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { domainColor, domainColorValues } from '@/entities/domain'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DoneMark,
  toast,
} from '@/shared/ui'

import type { PieceSheetData } from '../model/types'
import { SheetBox } from './sheet-box'
import { type FeedbackEditorSlot, SheetPasses } from './sheet-passes'
import { SheetRail } from './sheet-rail'

/** La fiche en Modifier (#149) : ses morceaux, posés par l'appelant (l'édition
 *  d'un objet vit dans une autre feature). */
export interface PieceSheetEditor {
  tile: ReactNode
  title: ReactNode
  box: ReactNode
  footer: ReactNode
}

const RECALL_LABEL = {
  take: "Passer l'interro",
  resume: "Reprendre l'interro",
} as const

/**
 * La **fiche d'une pièce** (design #137, #138 ; `kit/Fiche piece`, et
 * « Fiche d'une pièce » à plat dans `prod/Savoir`) : une modale commune à
 * l'exercice, la mise en situation, l'intégré, la pièce générique (« Pratique
 * libre ») et l'interro, ouverte depuis les tuiles de phase. L'étude n'en a
 * pas (son clic ouvre les notes).
 *
 * Elle remplace la modale d'objet et la modale de l'interro. **Modifier**
 * (#149, `editor`) passe la fiche elle-même en édition : même largeur, même
 * rail dont la tuile ouvre l'emoji, le titre devenu le nom, l'encadré ses
 * champs, les séances estompées et inertes, et le pied de l'éditeur. À gauche le rail à l'encre du
 * domaine ; à droite le titre, l'encadré gris, les séances en fil, et le pied,
 * toujours en bas : Recommencer (interro), le verdict, Passer / Reprendre
 * l'interro, Fermer, Ouvrir ↗ (intégré, désactivé), Modifier.
 *
 * Présentationnelle : tout se lit sur `data` (`model/build.ts`), les
 * écritures passent par les callbacks. Seule la confirmation de Recommencer
 * vit ici, telle que la modale de l'interro la posait.
 */
export function PieceSheet({
  data,
  color,
  onClose,
  onEdit,
  onPlan,
  onVerdict,
  verdictPending = false,
  onRecall,
  recallPending = false,
  onRestart,
  feedbackEditor,
  editor,
}: {
  data: PieceSheetData
  /** La couleur du domaine (`domain.color`) : le rail, les coches, la
   *  courbe. */
  color: string | null | undefined
  onClose: () => void
  /** Modifier : l'appelant passe la fiche en édition (`editor`). */
  onEdit?: () => void
  /** Planifier une séance sur la pièce. */
  onPlan?: () => void
  /** Poser ou retirer le verdict (`!data.verdict.done`). */
  onVerdict?: (done: boolean) => void
  verdictPending?: boolean
  /** Passer ou reprendre l'interro, selon `data.actions.recall`. */
  onRecall?: () => void
  recallPending?: boolean
  /** Recommencer, une fois confirmé. La promesse rejetée est dite ici (ne la
   *  toaste pas) et garde la confirmation ouverte. */
  onRestart?: () => Promise<unknown>
  /** La saisie du retour d'une passe (crayon au survol) — absente : pas de
   *  crayon. */
  feedbackEditor?: FeedbackEditorSlot
  /** Présent : la fiche est en Modifier. */
  editor?: PieceSheetEditor
}) {
  const accent = domainColor(color)
  const values = domainColorValues(color)
  const [confirming, setConfirming] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const { actions, verdict } = data
  const done = data.state.tone === 'done'

  async function doRestart() {
    if (!onRestart) return
    setRestarting(true)
    try {
      await onRestart()
      setConfirming(false)
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "L'interro n'a pas pu recommencer",
      )
    } finally {
      setRestarting(false)
    }
  }

  const footer =
    editor ||
    actions.restart ||
    verdict ||
    actions.recall ||
    actions.close ||
    actions.open ||
    actions.edit ||
    (data.kind === 'recall' && actions.plan && onPlan)

  return (
    <>
      <Dialog open={!confirming} onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="flex gap-0 overflow-hidden p-0 sm:max-w-[600px]"
        >
          <SheetRail data={data} accent={accent} tile={editor?.tile} />

          <div className="flex min-w-0 flex-1 flex-col gap-4 px-[22px] pt-[22px] pb-[18px]">
            <DialogTitle
              className={cn(
                'font-heading text-[19px] leading-tight font-semibold text-pretty',
                editor && 'sr-only',
              )}
            >
              <span className={cn(done && accent.text)}>{data.title}</span>
              {done && (
                <DoneMark
                  size="row"
                  className={cn(
                    'ml-2 inline-grid size-[17px] align-[-2px]',
                    accent.ink,
                  )}
                />
              )}
            </DialogTitle>
            {editor?.title}

            {editor
              ? editor.box
              : data.box && <SheetBox box={data.box} accent={accent} />}

            {/* En Modifier, les séances restent sous les yeux, inertes. */}
            <div
              className={cn(editor && 'pointer-events-none opacity-50')}
              inert={editor ? true : undefined}
            >
              <SheetPasses
                passes={data.passes}
                count={data.count}
                accent={accent}
                values={values}
                onPlan={actions.plan && !editor ? onPlan : undefined}
                feedbackEditor={editor ? undefined : feedbackEditor}
              />
            </div>

            {footer && (
              <footer className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                {editor ? (
                  editor.footer
                ) : (
                  <>
                    {actions.restart && (
                      <Button
                        variant="ghost"
                        onClick={() => setConfirming(true)}
                      >
                        <RotateCcw className="size-3.5" />
                        Recommencer
                      </Button>
                    )}
                    <span className="flex-1" />
                    {verdict && (
                      /* Le libellé ne bouge pas : c'est le remplissage qui dit
                     que le verdict est posé. */
                      <Button
                        variant={verdict.done ? 'outline' : 'default'}
                        className={cn(verdict.done && accent.soft)}
                        isPending={verdictPending}
                        onClick={() => onVerdict?.(!verdict.done)}
                      >
                        <Check className="size-4" strokeWidth={2.5} />
                        {verdict.label}
                      </Button>
                    )}
                    {/* L'interro : Planifier à gauche de Passer l'interro, chacun
                        avec son icône (26/10). */}
                    {data.kind === 'recall' && actions.plan && onPlan && (
                      <Button variant="outline" onClick={onPlan}>
                        <CalendarDays className="size-4" />
                        Planifier
                      </Button>
                    )}
                    {actions.recall && (
                      <Button isPending={recallPending} onClick={onRecall}>
                        <Play className="size-3.5 fill-current" />
                        {RECALL_LABEL[actions.recall]}
                      </Button>
                    )}
                    {actions.close && (
                      <Button variant="outline" onClick={onClose}>
                        Fermer
                      </Button>
                    )}
                    {actions.open && (
                      /* Un intégré se valide en le passant : sa page n'existe
                     pas encore. */
                      <Button
                        disabled
                        title="Sa page arrive au chantier suivant"
                      >
                        Ouvrir <ArrowUpRight className="size-4" />
                      </Button>
                    )}
                    {actions.edit && (
                      <Button variant="outline" onClick={onEdit}>
                        Modifier
                      </Button>
                    )}
                  </>
                )}
              </footer>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {confirming && (
        <Dialog open onOpenChange={(o) => !o && setConfirming(false)}>
          <DialogContent showCloseButton={false} className="max-w-[420px]">
            <DialogHeader>
              <DialogTitle className="text-lg">
                Recommencer l'interro ?
              </DialogTitle>
              <DialogDescription>
                {data.openRecall
                  ? `La passation en cours (${data.openRecall}) est abandonnée et la courbe repart à J+1 : prochaine interro demain. L'historique est gardé.`
                  : "La courbe repart à J+1 : prochaine interro demain. L'historique est gardé."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Annuler
              </Button>
              <Button isPending={restarting} onClick={() => void doRestart()}>
                Recommencer à J+1
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
