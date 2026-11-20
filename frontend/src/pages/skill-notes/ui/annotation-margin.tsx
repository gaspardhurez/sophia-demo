import type { Editor } from '@tiptap/core'
import { CircleHelp, Lightbulb, type LucideIcon } from 'lucide-react'
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import type { NoteQuestion } from '@/entities/note'
import { cn } from '@/shared/lib/utils'

import {
  cancelErase,
  cancelExampleDraft,
  cancelPassageChange,
  commitExampleDraft,
  confirmErase,
  erasingOf,
  type ExampleData,
  exampleDraftOf,
  examplesIn,
  LIT,
  MOVING,
  movingAnnotationOf,
  type PassageProblem,
  passageProblemOf,
  removeExample,
  removeQuestionAnchors,
  setLit,
  startExampleEdit,
  startQuestionEdit,
  startPassageChange,
  validatePassage,
} from '../lib/examples'
import {
  answerLines,
  commitQuestionDraft,
  questionsIn,
} from '../lib/question-anchors'
import { useQuestions } from '../model/questions-context'
import {
  type ErasedAnnotations,
  ExampleEraseDialog,
} from './example-erase-dialog'
import {
  AnnotationForm,
  CARD,
  ExampleBody,
  QuestionBody,
} from './annotation-card'

/** Une annotation du document et sa bulle, en coordonnées de `area`. */
type Annotation = {
  key: string
  id: string
  block: number
  from: number
  to: number
  whole: boolean
  /** Le nom de sa ligne dans la pile (et de la pastille, seule). */
  label: string
  /** La bulle : sous le dernier bloc du passage ; sur un titre, à gauche. */
  bubble: CSSProperties
  /** Le haut du premier bloc, moins 4 px : la bulle s'y pose quand la
   *  place manque dessous. */
  above: number
} & (
  | { kind: 'example'; title: string; text: string }
  | { kind: 'question'; question: NoteQuestion }
)

/** La pastille d'un bloc : ses annotations, dans l'ordre du texte. */
interface Pile {
  block: number
  top: number
  left: number
  /** La place jusqu'au bord de la fenêtre (moins 16 px) : la liste et le nom
   *  s'y tiennent, pas de défilement horizontal. */
  room: number
  items: Annotation[]
}

/** La largeur de la liste et du nom : la place de la marge, 300 px au plus
 *  (180 dans l'entre-deux de deux colonnes), 140 au moins. */
const pileWidth = (pile: Pile, narrow: boolean) =>
  Math.max(140, Math.min(narrow ? 180 : 300, pile.room))

/** La pastille : 24 px de haut, alignée sur la première ligne du bloc. */
const PILL = 24

/** Le mot du bandeau quand la sélection ne peut pas devenir le passage. */
const PROBLEMS: Record<PassageProblem, string> = {
  empty: 'Sélectionne au moins un mot',
}

/** Ce qu'un clic peut toucher sans refermer une bulle épinglée. */
const ANNOTATION_UI = 'data-annotation-ui'

/** Le formulaire d'une annotation qu'on écrit : sa bulle, sous le bloc. */
interface DraftBox {
  seq: number
  kind: 'example' | 'question'
  bubble: CSSProperties
  /** L'annotation qu'on modifie (son id, son titre ou énoncé, son texte). */
  edit: ExampleData | null
}

/** Le bandeau de « Changer le passage », au-dessus du bloc. */
interface MovingBox {
  top: number
  left: number
  /** Le refus de la dernière validation. */
  problem: PassageProblem | null
}

/** Une bande du surlignage : une ligne du passage, en coordonnées de `area`. */
interface Band {
  top: number
  left: number
  width: number
  height: number
  kind: 'lit' | 'moving'
}

/**
 * Les bandes d'un repère (`className`) : ses morceaux mesurés, regroupés par
 * ligne — une bande du premier au dernier caractère de la ligne, à la
 * hauteur de son plus haut morceau, 2 px de débord.
 */
function bandsOf(
  dom: HTMLElement,
  root: DOMRect,
  className: string,
  kind: Band['kind'],
): Band[] {
  const rects = [...dom.querySelectorAll(`.${className}`)]
    .flatMap((el) => [...el.getClientRects()])
    .filter((r) => r.width > 0)
    .sort((a, b) => a.top - b.top || a.left - b.left)
  const lines: { top: number; bottom: number; left: number; right: number }[] =
    []
  for (const r of rects) {
    const middle = (r.top + r.bottom) / 2
    const line = lines.find((l) => middle >= l.top && middle <= l.bottom)
    if (line) {
      line.top = Math.min(line.top, r.top)
      line.bottom = Math.max(line.bottom, r.bottom)
      line.left = Math.min(line.left, r.left)
      line.right = Math.max(line.right, r.right)
    } else
      lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right })
  }
  return lines.map((l) => ({
    top: l.top - root.top - 2,
    left: l.left - root.left - 2,
    width: l.right - l.left + 4,
    height: l.bottom - l.top + 4,
    kind,
  }))
}

/** Le début d'un texte, pour le nommer : `max` caractères au plus. */
function excerpt(text: string, max = 30) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean
}

/**
 * Les pastilles et les bulles, la carte de l'exemple qu'on écrit, le
 * bandeau du passage qu'on change et le surlignage, d'après le document et
 * sa mise en page. `question` : le contenu d'une question (nul, elle ne se
 * montre pas — supprimée, ou une vue sans questions).
 */
function place(
  editor: Editor,
  area: HTMLElement,
  narrow: boolean,
  question: (id: string) => NoteQuestion | undefined,
): {
  piles: Pile[]
  draft: DraftBox | null
  moving: MovingBox | null
  bands: Band[]
} {
  const { view } = editor
  const { doc } = view.state
  const root = area.getBoundingClientRect()
  const boxOf = (pos: number) => {
    const dom = view.nodeDOM(pos)
    return dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
  }
  /** La bulle d'une annotation : sous son dernier bloc, à droite du bloc —
   *  à gauche sur un titre (`kit/Annotations`). */
  const bubbleOf = (block: number, lastBlock: number, heading: boolean) => {
    const box = boxOf(block)
    const end = boxOf(lastBlock) ?? box
    if (!box || !end) return null
    // Un titre se dessine à la largeur de son texte : la bulle prend celle
    // de la colonne qui le porte.
    const dom = view.nodeDOM(block)
    const column =
      heading && dom instanceof HTMLElement && dom.parentElement
        ? dom.parentElement.getBoundingClientRect()
        : box
    const width = Math.min(narrow ? 300 : 420, column.width)
    return {
      above: box.top - root.top - 4,
      ...({
        top: end.bottom - root.top + 4,
        width,
        minWidth: Math.min(narrow ? 260 : 300, column.width),
        ...(heading
          ? { left: box.left - root.left }
          : { right: root.right - box.right }),
      } satisfies CSSProperties),
    }
  }

  const annotations: Annotation[] = []
  for (const e of examplesIn(doc)) {
    const placed = bubbleOf(e.block, e.lastBlock, false)
    if (!placed) continue
    const { above, ...bubble } = placed
    annotations.push({
      kind: 'example',
      key: `example:${e.id}`,
      id: e.id,
      block: e.block,
      from: e.from,
      to: e.to,
      whole: e.whole,
      title: e.title,
      text: e.text,
      label: e.title || excerpt(e.text, 40),
      bubble,
      above,
    })
  }
  for (const q of questionsIn(doc)) {
    const content = question(q.id)
    const placed = bubbleOf(q.block, q.lastBlock, q.heading)
    if (!content || !placed) continue
    const { above, ...bubble } = placed
    annotations.push({
      kind: 'question',
      key: `question:${q.id}`,
      id: q.id,
      block: q.block,
      from: q.from,
      to: q.to,
      whole: q.whole,
      question: content,
      label: excerpt(content.prompt, 60) || 'Question sans énoncé',
      bubble,
      above,
    })
  }

  // Une pastille par bloc où commence au moins une annotation.
  const byBlock = new Map<number, Annotation[]>()
  for (const a of annotations.sort(
    (x, y) => x.from - y.from || Number(y.whole) - Number(x.whole),
  ))
    byBlock.set(a.block, [...(byBlock.get(a.block) ?? []), a])
  const piles: Pile[] = []
  for (const [block, items] of byBlock) {
    const box = boxOf(block)
    if (!box) continue
    const line = view.coordsAtPos(block + 1, 1)
    const gap = narrow ? 10 : 14
    piles.push({
      block,
      items,
      top: (line.top + line.bottom) / 2 - PILL / 2 - root.top,
      // À 14 px du bord droit du bloc ; 10 dans l'entre-deux de deux colonnes.
      left: box.right - root.left + gap,
      room: document.documentElement.clientWidth - (box.right + gap) - 16,
    })
  }

  let draft: DraftBox | null = null
  const writing = exampleDraftOf(view.state)
  const placed =
    writing && bubbleOf(writing.block, writing.lastBlock, writing.heading)
  if (writing && placed) {
    const { above: _, ...bubble } = placed
    draft = {
      seq: writing.seq,
      kind: writing.kind,
      bubble,
      edit: writing.edit,
    }
  }

  let moving: MovingBox | null = null
  const shifting = movingAnnotationOf(view.state)
  const box = shifting && boxOf(shifting.block)
  if (box)
    moving = {
      top: box.top - root.top - 36,
      left: box.left - root.left,
      problem: passageProblemOf(view.state),
    }
  const bands = [
    ...bandsOf(view.dom, root, LIT, 'lit'),
    ...bandsOf(view.dom, root, MOVING, 'moving'),
  ]
  return { piles, draft, moving, bands }
}

/**
 * Les **annotations** dans la marge des notes (#213, `kit/Annotations`) :
 * exemples et questions attachés à un passage, à un bloc entier ou au titre
 * d'une section. Au repos, **une pastille par bloc**, à droite de sa
 * première ligne : l'ampoule et le nombre d'exemples, le point
 * d'interrogation et le nombre de questions, en gris.
 *
 * Au survol, la pastille se teinte et **se déploie** dans la marge en une
 * liste, une ligne par annotation (icône, nom tronqué), dans l'ordre du
 * texte, en cascade. Survoler une ligne éclaire son passage et ouvre sa
 * **bulle** sous le bloc (à droite ; sur un titre, à gauche), le temps du
 * survol : quitter la pastille la ferme aussitôt. Un clic l'**épingle**,
 * avec ses actions — c'est là qu'on la modifie ; un second, ou un clic
 * ailleurs, la referme. **Une seule
 * annotation** : pas de liste — au survol, son nom remplace le chiffre et sa
 * bulle s'ouvre.
 *
 * Bulle d'un exemple : « EXEMPLE », titre, texte. Bulle d'une question :
 * « QUESTION », l'énoncé, « Voir la réponse » — un clic la dévoile sous un
 * filet pointillé, en liste « · » si elle a plusieurs éléments.
 *
 * Un exemple **en cours d'écriture** s'écrit dans une carte montée sous son
 * bloc (elle pousse la suite) ; « Changer le passage » met l'ancien en
 * pointillé sous un bandeau sombre ; une modification qui effacerait un
 * passage annoté attend sa confirmation (`ExampleEraseDialog`).
 *
 * À côté d'une colonne (`narrow` : « Préparer les questions », les notes
 * d'une ressource avec la marge des commentaires), la pastille se pose dans
 * l'entre-deux, la liste à 180 px, la bulle à la largeur du bloc. En
 * lecture, les bulles s'épinglent sans actions. `questions` : faux là où
 * les questions se montrent ailleurs (« Préparer les questions »).
 *
 * `area` : l'élément qui contient l'éditeur, repère des positions.
 */
export function AnnotationMargin({
  editor,
  area,
  narrow = false,
  questions = true,
  open = null,
}: {
  editor: Editor
  area: RefObject<HTMLElement | null>
  /** Une question à ouvrir à l'arrivée (`?question=<id>`), épinglée. */
  open?: string | null
  /** Le bloc a une colonne à sa droite : la pastille dans l'entre-deux. */
  narrow?: boolean
  questions?: boolean
}) {
  const { question, create, update, remove } = useQuestions()
  const [piles, setPiles] = useState<Pile[]>([])
  const [draft, setDraft] = useState<DraftBox | null>(null)
  const [moving, setMoving] = useState<MovingBox | null>(null)
  const [bands, setBands] = useState<Band[]>([])
  const [erasing, setErasing] = useState<{
    questionIds: string[]
    names: ErasedAnnotations
  } | null>(null)
  // La pile survolée (son bloc), l'annotation survolée, l'épinglée.
  const [openPile, setOpenPile] = useState<number | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  // Le contenu des questions change sans transaction : relu au rendu.
  const questionOf = useRef(question)
  useEffect(() => {
    questionOf.current = question
  })

  // La place des pastilles suit le document et sa mise en page. Un effet, pas
  // un effet de mise en page : la ref de `area` (un parent) n'est posée
  // qu'après ceux des enfants.
  useEffect(() => {
    const root = area.current
    if (!root) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (editor.isDestroyed) return
        const placed = place(editor, root, narrow, (id) =>
          questions ? questionOf.current(id) : undefined,
        )
        setPiles(placed.piles)
        setDraft(placed.draft)
        setMoving(placed.moving)
        setBands(placed.bands)
        const held = erasingOf(editor.state)
        setErasing(
          held && {
            questionIds: held.questions,
            names: {
              examples: held.examples.map((e) => e.title || e.text),
              questions: held.questions.map(
                (id) => questionOf.current(id)?.prompt || 'Question',
              ),
            },
          },
        )
      })
    }
    update()
    editor.on('transaction', update)
    const resize = new ResizeObserver(update)
    resize.observe(editor.view.dom)
    resize.observe(root)
    return () => {
      cancelAnimationFrame(frame)
      editor.off('transaction', update)
      resize.disconnect()
    }
    // Relu aussi quand les questions arrivent ou changent.
  }, [area, editor, narrow, questions, question])

  const all = piles.flatMap((p) => p.items)
  const find = (key: string | null) =>
    key === null ? undefined : all.find((a) => a.key === key)
  const pin = find(pinned) ? pinned : null
  const active = find(hovered) ?? find(pin)

  // `open` : sa bulle s'épingle, une fois, dès que sa pastille est posée.
  const opened = useRef(false)
  const openKey = open && `question:${open}`
  const openReady =
    !!openKey && piles.some((p) => p.items.some((a) => a.key === openKey))
  useEffect(() => {
    if (!openKey || !openReady || opened.current) return
    opened.current = true
    setPinned(openKey)
  }, [openKey, openReady])

  // Le passage de l'annotation ouverte s'éclaire.
  useEffect(() => {
    if (!editor.isDestroyed) setLit(editor.view, active ?? null)
  }, [editor, active])

  // Sans clic, la bulle ne vit que le temps du survol : quitter la pastille
  // (ou sa liste) la ferme aussitôt — décision de l'utilisateur, 17/11 ; on
  // remettra un délai si l'usage le demande. Épinglée, elle reste : c'est là
  // qu'on la modifie.
  const exit = () => {
    setOpenPile(null)
    setHovered(null)
  }

  // « Changer le passage » : Entrée et Échap sont au plugin (`validatePassage`) ;
  // hors de l'éditeur (le focus sur le bandeau), Échap renonce aussi.
  const shifting = moving !== null
  useEffect(() => {
    if (!shifting) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || editor.view.hasFocus()) return
      e.preventDefault()
      cancelPassageChange(editor.view)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [editor, shifting])

  // Épinglée, un clic ailleurs que sur une pastille ou la bulle la referme.
  useEffect(() => {
    if (!pin) return
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest(`[${ANNOTATION_UI}]`)) return
      setPinned(null)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [pin])

  // Une action de la bulle la referme.
  const act = (run: () => void) => {
    setPinned(null)
    setHovered(null)
    setOpenPile(null)
    run()
  }
  const togglePin = (key: string) => setPinned((p) => (p === key ? null : key))

  return (
    <>
      {/* Le surlignage : une bande par ligne, par-dessus le texte mais en
          « multiplier » (« écran » en sombre) — il teinte le fond, pas les
          lettres, comme un surligneur. */}
      {bands.map((band, i) => (
        <div
          key={i}
          aria-hidden
          style={{
            top: band.top,
            left: band.left,
            width: band.width,
            height: band.height,
          }}
          className={cn(
            'pointer-events-none absolute rounded-[3px]',
            band.kind === 'lit'
              ? 'bg-[color-mix(in_oklch,var(--note-accent)_18%,white)] mix-blend-multiply dark:bg-[color-mix(in_oklch,var(--note-accent)_32%,black)] dark:mix-blend-screen'
              : 'border-[1.5px] border-dashed border-(--note-accent)',
          )}
        />
      ))}
      {piles.map((pile) => (
        <PileView
          key={pile.block}
          pile={pile}
          narrow={narrow}
          open={openPile === pile.block}
          active={active?.block === pile.block ? active.key : null}
          pinned={pin}
          onEnter={() => {
            setOpenPile(pile.block)
            // Seule, elle s'ouvre dès la pastille.
            if (pile.items.length === 1) setHovered(pile.items[0].key)
          }}
          onLeave={exit}
          onHoverItem={(key) => setHovered(key)}
          onPin={togglePin}
        />
      ))}
      {draft && (
        <BubbleFrame
          // Un formulaire neuf à chaque annotation commencée.
          key={draft.seq}
          kind={draft.kind}
          bubble={draft.bubble}
          pinned
        >
          <AnnotationForm
            kind={draft.kind}
            initial={draft.edit}
            onCancel={() => {
              cancelExampleDraft(editor.view)
              editor.commands.focus()
            }}
            onSubmit={async (fields) => {
              if (draft.kind === 'example')
                commitExampleDraft(editor.view, {
                  title: fields.first,
                  text: fields.second,
                })
              else if (draft.edit) {
                update?.(draft.edit.id, {
                  prompt: fields.first,
                  answer: fields.second,
                })
                cancelExampleDraft(editor.view)
              } else {
                const id = await create?.({
                  prompt: fields.first,
                  answer: fields.second,
                })
                if (id) commitQuestionDraft(editor.view, id)
              }
              editor.commands.focus()
            }}
          />
        </BubbleFrame>
      )}
      {active && !draft && !moving && (
        <BubbleFrame
          // Une confirmation ouverte ne passe pas à une autre annotation.
          key={active.key}
          kind={active.kind}
          bubble={active.bubble}
          above={active.above}
          pinned={active.key === pin}
          onMouseLeave={exit}
        >
          {active.kind === 'example' ? (
            <ExampleBody
              title={active.title}
              text={active.text}
              // En lecture (« Préparer les questions »), pas d'action.
              actions={active.key === pin && editor.isEditable}
              onEdit={() => act(() => startExampleEdit(editor.view, active.id))}
              onMove={() =>
                act(() => startPassageChange(editor.view, active.id))
              }
              onRemove={() => act(() => removeExample(editor.view, active.id))}
            />
          ) : (
            <QuestionBody
              question={active.question}
              actions={active.key === pin && editor.isEditable && !!update}
              onEdit={() =>
                act(() =>
                  startQuestionEdit(editor.view, active.id, {
                    prompt: active.question.prompt,
                    answer: answerLines(active.question).join('\n'),
                  }),
                )
              }
              onMove={() =>
                act(() =>
                  startPassageChange(editor.view, active.id, 'question'),
                )
              }
              onRemove={() =>
                act(async () => {
                  if (await remove?.(active.id))
                    removeQuestionAnchors(editor.view, active.id)
                })
              }
            />
          )}
        </BubbleFrame>
      )}
      <ExampleEraseDialog
        erased={erasing?.names ?? null}
        onCancel={() => {
          cancelErase(editor.view)
          editor.commands.focus()
        }}
        onConfirm={() => {
          // Les questions du passage effacé partent aussi de la table.
          const ids = erasing?.questionIds ?? []
          confirmErase(editor.view)
          for (const id of ids) void remove?.(id)
          editor.commands.focus()
        }}
      />
      {moving && (
        <div
          role="status"
          // Le clic ne vole pas la sélection à l'éditeur.
          onMouseDown={(e) => e.preventDefault()}
          style={{ top: moving.top, left: moving.left }}
          className="absolute z-30 flex h-[30px] items-center gap-2 rounded-lg bg-zinc-800 pr-1.5 pl-2.5 text-[12.5px] whitespace-nowrap text-white shadow-[0_6px_18px_oklch(0.21_0.008_285/0.25)]"
        >
          <span className={cn(moving.problem && 'text-amber-300')}>
            {moving.problem
              ? PROBLEMS[moving.problem]
              : 'Ajuste la sélection du passage'}
          </span>
          <button
            type="button"
            onClick={() => {
              validatePassage(editor.view)
              editor.commands.focus()
            }}
            className="inline-flex h-[22px] items-center rounded-[5px] bg-white px-2 font-semibold text-zinc-900 hover:bg-white/90"
          >
            Valider ↵
          </button>
          <button
            type="button"
            onClick={() => cancelPassageChange(editor.view)}
            className="inline-flex h-[22px] items-center rounded-[5px] bg-white/14 px-2 font-semibold hover:bg-white/22"
          >
            Annuler · Échap
          </button>
        </div>
      )}
    </>
  )
}

/** L'icône d'une sorte d'annotation. */
const ICON: Record<Annotation['kind'], LucideIcon> = {
  example: Lightbulb,
  question: CircleHelp,
}

/**
 * La pastille d'un bloc et sa pile (`kit/Annotations`) : 24 px, 11,5 px
 * demi-gras, chiffres tabulaires — l'ampoule et le nombre d'exemples, le
 * point d'interrogation et le nombre de questions. Teintée quand elle est
 * ouverte ou qu'une de ses annotations l'est. Plusieurs annotations : la
 * liste se déploie dessous (à la place de la marge, 300 px au plus — plus
 * que la maquette, pour lire les noms, 17/11 — ; 180 en étroit), ses lignes en cascade
 * (180 ms, 30 ms d'écart). Une seule : son nom à la place du chiffre
 * — liste et nom à la place de la marge jusqu'au bord de la fenêtre, 300 px
 * au plus (180 en étroit), sans défilement horizontal ; un nom trop long y
 * passe à la ligne (deux lignes au plus) plutôt que d'être coupé.
 */
function PileView({
  pile,
  narrow,
  open,
  active,
  pinned,
  onEnter,
  onLeave,
  onHoverItem,
  onPin,
}: {
  pile: Pile
  narrow: boolean
  open: boolean
  /** L'annotation de cette pile qui est ouverte, s'il y en a une. */
  active: string | null
  pinned: string | null
  onEnter: () => void
  onLeave: () => void
  onHoverItem: (key: string) => void
  onPin: (key: string) => void
}) {
  const examples = pile.items.filter((a) => a.kind === 'example').length
  const questions = pile.items.length - examples
  const lone = pile.items.length === 1 ? pile.items[0] : null
  const lit = open || active !== null
  const named = lone && lit
  return (
    <div
      {...{ [ANNOTATION_UI]: '' }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ top: pile.top, left: pile.left }}
      className={cn(
        'absolute flex flex-col items-start gap-1',
        open ? 'z-30' : 'z-10',
      )}
    >
      <button
        type="button"
        aria-label={
          lone
            ? lone.label
            : `${pile.items.length} annotations : ${examples} exemple${examples > 1 ? 's' : ''}, ${questions} question${questions > 1 ? 's' : ''}`
        }
        aria-pressed={lone ? lone.key === pinned : undefined}
        // Le curseur reste dans les notes.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => lone && onPin(lone.key)}
        className={cn(
          'inline-flex min-h-6 items-start gap-[7px] rounded-[7px] px-[7px] py-[5.5px] text-left text-[11.5px] leading-[13px] font-semibold tabular-nums transition-colors duration-150',
          lit
            ? 'bg-(--note-accent)/18 text-(--note-accent)'
            : 'text-muted-foreground/85 hover:text-muted-foreground',
        )}
      >
        {examples > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <Lightbulb aria-hidden className="size-[13px]" />
            {!named && examples}
          </span>
        )}
        {questions > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <CircleHelp aria-hidden className="size-[13px]" />
            {!named && questions}
          </span>
        )}
        {named && (
          <span
            // Trop long : à la ligne, deux lignes au plus, plutôt que coupé.
            className="-ml-[3px] line-clamp-2 text-[12.5px] leading-[13px] font-medium"
            // La liste moins l'icône et les marges de la pastille.
            style={{
              width: 'max-content',
              maxWidth: pileWidth(pile, narrow) - 36,
            }}
          >
            {lone.label}
          </span>
        )}
      </button>
      {!lone && (
        <div
          className={cn('flex flex-col gap-px', !open && 'pointer-events-none')}
          style={{ width: pileWidth(pile, narrow) }}
        >
          {pile.items.map((a, i) => {
            const Icon = ICON[a.kind]
            const on = a.key === active
            return (
              <button
                key={a.key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => onHoverItem(a.key)}
                onClick={() => onPin(a.key)}
                aria-pressed={a.key === pinned}
                style={{
                  transitionDelay: open ? `${i * 30}ms` : '0ms',
                }}
                className={cn(
                  'flex min-h-[26px] w-full items-start gap-1.5 rounded-md px-2 py-[5px] text-left leading-4 text-[12.5px] font-medium text-foreground/85 transition-[opacity,translate,background-color] duration-[180ms] ease-out',
                  open
                    ? 'translate-y-0 opacity-100'
                    : '-translate-y-1 opacity-0',
                  on && 'bg-(--note-accent)/14',
                )}
              >
                <span
                  className={cn(
                    'grid h-4 w-4 shrink-0 place-items-center',
                    on ? 'text-(--note-accent)' : 'text-muted-foreground',
                  )}
                >
                  <Icon aria-hidden className="size-[13px]" />
                </span>
                {/* Trop long pour la marge : à la ligne, deux lignes au
                    plus, plutôt que coupé. */}
                <span className="line-clamp-2 min-w-0">{a.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Le cadre d'une bulle : sous le bloc, bord à l'accent (plus marqué
 * épinglée), ombre douce ; 420 px au plus (300 en étroit), 300 au moins.
 * `above` : sans la place de s'ouvrir sous le bloc dans la fenêtre, elle
 * s'ouvre au-dessus, s'il y en a plus — le survol ne laisse pas défiler.
 */
function BubbleFrame({
  kind,
  bubble,
  above,
  pinned,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  kind: Annotation['kind']
  bubble: CSSProperties
  above?: number
  pinned: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  children: ReactNode
}) {
  const frame = useRef<HTMLDivElement>(null)
  const [up, setUp] = useState<number | null>(null)
  const below = bubble.top
  useLayoutEffect(() => {
    const el = frame.current
    const root = el?.offsetParent
    if (above === undefined || typeof below !== 'number' || !el || !root) return
    const place = () => {
      // La place sous le bloc et au-dessus, dans la fenêtre.
      const origin = root.getBoundingClientRect().top
      const down = innerHeight - (origin + below) - 8
      const upward = origin + above - 8
      const height = el.offsetHeight
      setUp(height > down && upward > down ? above - height : null)
    }
    place()
    // Elle grandit (la réponse dévoilée) : elle se replace.
    const observer = new ResizeObserver(place)
    observer.observe(el)
    return () => observer.disconnect()
  }, [above, below])
  return (
    <div
      ref={frame}
      role="note"
      aria-label={kind === 'example' ? 'Exemple' : 'Question'}
      {...{ [ANNOTATION_UI]: '' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      // Le curseur reste dans les notes.
      onMouseDown={(e) => e.preventDefault()}
      style={up === null ? bubble : { ...bubble, top: up }}
      className={cn(
        CARD,
        'absolute z-20 animate-in fade-in-0 [animation-duration:150ms]',
        pinned ? 'border-(--note-accent)/67' : 'border-(--note-accent)/40',
      )}
    >
      {children}
    </div>
  )
}
