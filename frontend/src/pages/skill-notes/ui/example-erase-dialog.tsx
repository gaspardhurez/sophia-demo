import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui'

/** Ce qu'un effacement emporterait : le nom de chaque exemple, de chaque
 *  question (son titre ou le début de son texte, son énoncé). */
export interface ErasedAnnotations {
  examples: string[]
  questions: string[]
}

/** Un nom, tronqué à 40 caractères. */
function short(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 40 ? `${clean.slice(0, 40).trim()}…` : clean
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n > 1 ? many : one}`

/** « Il porte un exemple (« … ») : il sera supprimé avec lui. », etc. */
function message({ examples, questions }: ErasedAnnotations) {
  const total = examples.length + questions.length
  if (total === 1 && examples.length)
    return `Il porte un exemple (« ${short(examples[0])} ») : il sera supprimé avec lui.`
  if (total === 1)
    return `Il porte une question (« ${short(questions[0])} ») : elle sera supprimée avec lui.`
  const detail = [
    examples.length && plural(examples.length, 'exemple', 'exemples'),
    questions.length && plural(questions.length, 'question', 'questions'),
  ]
    .filter(Boolean)
    .join(', ')
  return `Il porte ${total} annotations (${detail}) : elles seront supprimées aussi.`
}

/**
 * Effacer un passage annoté — ou le bloc d'une annotation — se confirme
 * (#211, #213, `kit/Annotations`, « Quand le texte change ») : « Supprimer ce
 * passage ? », Annuler (le texte reste) ou Supprimer (ses annotations
 * partent avec lui).
 */
export function ExampleEraseDialog({
  erased,
  onCancel,
  onConfirm,
}: {
  erased: ErasedAnnotations | null
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={erased !== null} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-base">
            Supprimer ce passage ?
          </DialogTitle>
          <DialogDescription className="leading-normal text-pretty">
            {erased && message(erased)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            className="text-xs font-semibold"
            onClick={onCancel}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            className="text-xs font-semibold"
            onClick={onConfirm}
          >
            Supprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
