import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import {
  Captions,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  Lightbulb,
  type LucideIcon,
  Palette,
  Repeat2,
  Trash2,
} from 'lucide-react'
import {
  Fragment,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { cn } from '@/shared/lib/utils'

import {
  type Block,
  blockSelOf,
  clearBlockSel,
  deleteBlocks,
  duplicateBlocks,
  selectedBlocks,
  setBlockMenu,
} from '../lib/block-selection'
import {
  blockLabel,
  canTurn,
  colorBlocks,
  currentItem,
  turnInto,
} from '../lib/block-transform'
import { isItem, unitAt } from '../lib/block-unit'
import { HEADING, PARAGRAPH, TURN_INTO_ITEMS } from '../lib/blocks'
import { startAnnotationDraft } from '../lib/examples'
import { useQuestions } from '../model/questions-context'
import { HANDLE_HEIGHT, handleSpot } from '../lib/handle-spot'
import {
  type ColorKind,
  colorLabel,
  colorValue,
  NOTE_COLORS,
  type NoteColor,
  recentColors,
} from '../lib/marks'
import { IMAGE } from '../lib/image-node'
import { QUESTION } from '../lib/question-node'
import { fold } from '../lib/slash'

/** Largeur du menu (annexe §2 : 265 px). */
const WIDTH = 265
/** Écart entre le menu et la poignée ⋮⋮ (5 px), et la poignée et le texte. */
const GAP = 5
const GRIP_FROM_TEXT = 36

/** Une ligne du menu : une action, ou l'entrée d'un sous-menu. */
interface Row {
  id: string
  label: string
  icon?: LucideIcon
  /** Une pastille « A » (couleur du texte ou du fond) à la place de l'icône. */
  swatch?: { kind: ColorKind; color: NoteColor }
  hint?: string
  check?: boolean
  danger?: boolean
  sub?: 'turn' | 'color'
  run?: () => void
}

interface Section {
  title?: string
  rows: Row[]
}

/**
 * Le menu de bloc (annexe §2) : ouvert par un clic sur ⋮⋮ ou par ⌘/, sur
 * les blocs sélectionnés (`block-selection`). À gauche de la poignée, centré
 * sur elle : « Rechercher des actions… », le type du bloc, « Transformer en › »,
 * « Couleur › », puis « Ajouter un exemple » (un paragraphe ou un élément
 * seul, #211), Dupliquer et Supprimer. Sur une question : Supprimer
 * seulement — le seul moyen d'en retirer une.
 *
 * Le champ de recherche a le focus : la frappe filtre, ↑/↓ et Entrée
 * choisissent, → ouvre un sous-menu, ← le referme, Échap ferme (les blocs
 * restent sélectionnés).
 */
export function BlockMenu({
  editor,
  area,
  onDeleteQuestion,
}: {
  editor: Editor
  area: RefObject<HTMLElement | null>
  onDeleteQuestion: (id: string) => void
}) {
  const sel = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? blockSelOf(e.state) : null),
    equalityFn: (a, b) =>
      a === b ||
      (!!a &&
        !!b &&
        a.anchor === b.anchor &&
        a.head === b.head &&
        a.menu === b.menu),
  })
  if (!sel?.menu || !editor.isEditable) return null
  return (
    <Panel
      key={`${sel.anchor}:${sel.head}`}
      editor={editor}
      area={area}
      head={sel.head}
      onDeleteQuestion={onDeleteQuestion}
    />
  )
}

function Panel({
  editor,
  area,
  head,
  onDeleteQuestion,
}: {
  editor: Editor
  area: RefObject<HTMLElement | null>
  head: number
  onDeleteQuestion: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [sub, setSub] = useState<{ kind: 'turn' | 'color'; row: number }>()
  const [subActive, setSubActive] = useState<number | null>(null)
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const rowRefs = useRef<(HTMLElement | null)[]>([])

  const blocks = selectedBlocks(editor.state)
  const close = (focus = true) => {
    setBlockMenu(editor.view, false)
    if (focus) editor.view.focus()
  }
  const done = () => editor.view.focus()

  const { create: asks } = useQuestions()
  const sections = menuSections(editor, blocks, fold(query), {
    done,
    onDeleteQuestion,
    questions: Boolean(asks),
  })
  const rows = sections.flatMap((s) => s.rows)
  const subSections =
    sub && rows[sub.row]?.sub === sub.kind
      ? subMenu(editor, blocks, sub.kind, done)
      : null
  const subRows = subSections?.flatMap((s) => s.rows) ?? []

  // La frappe change le filtre : on repart du premier, sous-menu fermé.
  useEffect(() => {
    setActive(0)
    setSub(undefined)
  }, [query])

  // Le focus au champ — après le clic sur ⋮⋮, qui le prend pour lui.
  useEffect(() => {
    const id = setTimeout(() => input.current?.focus({ preventScroll: true }))
    return () => clearTimeout(id)
  }, [])

  // Un clic hors du menu le ferme, et défait la sélection (Notion).
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (panel.current?.contains(e.target as Node)) return
      if ((e.target as HTMLElement).closest?.('[data-block-handle]')) return
      clearBlockSel(editor.view)
    }
    document.addEventListener('mousedown', down, true)
    return () => document.removeEventListener('mousedown', down, true)
  }, [editor])

  // À gauche de la poignée, centré sur elle — même quand la liste change
  // de hauteur —, sans sortir de l'écran.
  useLayoutEffect(() => {
    const root = area.current
    const el = panel.current
    const unit = unitAt(editor.state.doc, head)
    if (!root || !el || !unit) return
    const spot = handleSpot(editor.view, unit)
    if (!spot) return
    const at = root.getBoundingClientRect()
    const height = el.offsetHeight
    const right = spot.text - GRIP_FROM_TEXT - GAP
    const left = Math.max(8, right - WIDTH)
    const center = spot.top + HANDLE_HEIGHT / 2
    const top = Math.min(
      Math.max(8, center - height / 2),
      window.innerHeight - 8 - height,
    )
    const next = { top: top - at.top, left: left - at.left }
    setPlace((p) =>
      p && p.top === next.top && p.left === next.left ? p : next,
    )
    // La hauteur suit le filtre.
  }, [editor, area, head, query])

  const openSub = (index: number, kind: 'turn' | 'color', focus: boolean) => {
    setSub({ kind, row: index })
    setSubActive(focus ? 0 : null)
  }
  const activate = (row: Row, index: number) => {
    if (row.sub) openSub(index, row.sub, true)
    else row.run?.()
  }

  const onKey = (e: React.KeyboardEvent) => {
    const inSub = subActive !== null && subRows.length > 0
    const take = () => {
      e.preventDefault()
      e.stopPropagation()
    }
    if (e.key === 'Escape') {
      take()
      if (inSub) setSubActive(null)
      else if (sub) setSub(undefined)
      else close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      take()
      const dir = e.key === 'ArrowDown' ? 1 : -1
      if (inSub)
        setSubActive((a) => ((a ?? 0) + dir + subRows.length) % subRows.length)
      else if (rows.length) {
        setSub(undefined)
        setActive((a) => (a + dir + rows.length) % rows.length)
      }
    } else if (e.key === 'ArrowRight') {
      const row = rows[active]
      if (!inSub && row?.sub) {
        take()
        openSub(active, row.sub, true)
      }
    } else if (e.key === 'ArrowLeft') {
      if (inSub) {
        take()
        setSub(undefined)
        setSubActive(null)
      }
    } else if (e.key === 'Enter') {
      take()
      if (inSub) subRows[subActive]?.run?.()
      else if (rows[active]) activate(rows[active], active)
    } else if (e.key === 'Tab') take()
    // Suppr — et Retour arrière tant que la recherche est vide — : comme sur
    // un bloc sélectionné depuis la marge, les blocs partent (sauf les
    // questions, qui restent sélectionnées).
    else if (e.key === 'Delete' || (e.key === 'Backspace' && query === '')) {
      take()
      deleteBlocks(editor.view)
      done()
    }
  }

  // Le sous-menu à hauteur de sa ligne, sans sortir de l'écran (28 px par
  // ligne et par en-tête, 60 % de la fenêtre au plus).
  let subTop = 0
  const subRow = sub && rowRefs.current[sub.row]
  if (subRow && panel.current && subSections) {
    const height = Math.min(
      (subRows.length + subSections.length) * 28 + 8,
      window.innerHeight * 0.6,
    )
    const top = Math.min(
      subRow.getBoundingClientRect().top - 5,
      window.innerHeight - 8 - height,
    )
    subTop = Math.max(8, top) - panel.current.getBoundingClientRect().top
  }
  let index = -1
  return (
    <div
      ref={panel}
      data-block-menu=""
      role="menu"
      aria-label="Menu du bloc"
      onKeyDown={onKey}
      // La palette des couleurs, hors de l'éditeur.
      className="notes-palette absolute z-40"
      style={{
        top: place?.top ?? 0,
        left: place?.left ?? 0,
        width: WIDTH,
      }}
    >
      <div
        className={cn(
          MENU_SURFACE,
          'max-h-[70vh] origin-center animate-in overflow-y-auto py-1 duration-200 fade-in-0 zoom-in-96',
        )}
      >
        <div className="px-1 pb-1">
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher des actions…"
            aria-label="Rechercher des actions"
            className="h-7 w-full rounded-md bg-foreground/[3%] px-2 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {sections.map((section, s) => (
          <Fragment key={section.title ?? s}>
            {s > 0 && !section.title && <Separator />}
            {section.title && <Heading>{section.title}</Heading>}
            {section.rows.map((row) => {
              index += 1
              const i = index
              return (
                <MenuRow
                  key={row.id}
                  row={row}
                  ref={(el) => {
                    rowRefs.current[i] = el
                  }}
                  active={i === active}
                  open={sub?.row === i}
                  onHover={() => {
                    setActive(i)
                    if (row.sub) openSub(i, row.sub, false)
                    else setSub(undefined)
                  }}
                  onPick={() => activate(row, i)}
                />
              )
            })}
          </Fragment>
        ))}
        {!rows.length && (
          <p className="px-3 py-1.5 text-sm text-muted-foreground">
            Aucune action
          </p>
        )}
      </div>
      {subSections && (
        <div
          role="menu"
          className={cn(
            MENU_SURFACE,
            'absolute left-full ml-1 max-h-[60vh] w-[220px] animate-in overflow-y-auto py-1 duration-200 fade-in-0 zoom-in-96',
          )}
          style={{ top: subTop }}
        >
          {(() => {
            let j = -1
            return subSections.map((section, s) => (
              <Fragment key={section.title ?? s}>
                {section.title && <Heading>{section.title}</Heading>}
                {section.rows.map((row) => {
                  j += 1
                  const k = j
                  return (
                    <MenuRow
                      key={row.id}
                      row={row}
                      active={k === subActive}
                      onHover={() => setSubActive(k)}
                      onPick={() => row.run?.()}
                    />
                  )
                })}
              </Fragment>
            ))
          })()}
        </div>
      )}
    </div>
  )
}

/** Les sections du menu ; filtrées par `query`, à plat. */
function menuSections(
  editor: Editor,
  blocks: Block[],
  query: string,
  {
    done,
    onDeleteQuestion,
    questions,
  }: {
    done: () => void
    onDeleteQuestion: (id: string) => void
    /** Le document a des questions : « Ajouter une question » (#213). */
    questions: boolean
  },
): Section[] {
  const view = editor.view
  const lone = blocks.length === 1 ? blocks[0].node : null
  const question =
    lone?.type.name === QUESTION ? (lone.attrs.id as string | null) : null
  const remove: Row = {
    id: 'delete',
    label: 'Supprimer',
    icon: Trash2,
    hint: 'Suppr',
    danger: true,
    run: () => {
      if (question) {
        clearBlockSel(view)
        onDeleteQuestion(question)
      } else {
        deleteBlocks(view)
        done()
      }
    },
  }
  if (question) return filter([{ rows: [remove] }], query)

  const turnable = canTurn(blocks)
  // Une image (posée) : sa légende s'ajoute ou se retire d'ici (Notion).
  const image = lone?.type.name === IMAGE && lone.attrs.src ? blocks[0] : null
  const captioned = image ? image.node.attrs.caption !== null : false
  // Un paragraphe, ou le texte d'un élément : un exemple sur le bloc entier.
  const text =
    lone?.type.name === PARAGRAPH
      ? blocks[0].pos
      : lone && isItem(lone) && lone.firstChild?.type.name === PARAGRAPH
        ? blocks[0].pos + 1
        : null
  // Sur un titre, une question de section (#213).
  const heading = lone?.type.name === HEADING ? blocks[0].pos : null
  const annotate = (block: number, kind: 'example' | 'question') => () => {
    clearBlockSel(view)
    startAnnotationDraft(view, { block }, kind)
  }
  const actions: Row[] = [
    ...(text !== null
      ? [
          {
            id: 'example',
            label: 'Ajouter un exemple',
            icon: Lightbulb,
            run: annotate(text, 'example'),
          },
        ]
      : []),
    ...(questions && (text ?? heading) !== null
      ? [
          {
            id: 'question',
            label:
              heading !== null
                ? 'Ajouter une question de section'
                : 'Ajouter une question',
            icon: CircleHelp,
            run: annotate((text ?? heading)!, 'question'),
          },
        ]
      : []),
    ...(image
      ? [
          {
            id: 'caption',
            label: captioned ? 'Retirer la légende' : 'Légende',
            icon: Captions,
            run: () => {
              const { tr } = view.state
              tr.setNodeAttribute(image.pos, 'caption', captioned ? null : '')
              view.dispatch(tr)
              clearBlockSel(view)
            },
          },
        ]
      : []),
    {
      id: 'duplicate',
      label: 'Dupliquer',
      icon: Copy,
      hint: '⌘D',
      run: () => {
        duplicateBlocks(view)
        done()
      },
    },
    remove,
  ]
  if (!query)
    return [
      {
        title: blockLabel(blocks),
        rows: turnable
          ? [
              {
                id: 'turn',
                label: 'Transformer en',
                icon: Repeat2,
                sub: 'turn' as const,
              },
              {
                id: 'color',
                label: 'Couleur',
                icon: Palette,
                sub: 'color' as const,
              },
            ]
          : [],
      },
      { rows: actions },
    ].filter((s) => s.rows.length > 0)

  // Filtré : les entrées des sous-menus remontent, à plat.
  return filter(
    [
      ...(turnable ? subMenu(editor, blocks, 'turn', done) : []),
      ...(turnable ? subMenu(editor, blocks, 'color', done) : []),
      { title: 'Actions', rows: actions },
    ],
    query,
  )
}

function filter(sections: Section[], query: string): Section[] {
  if (!query) return sections
  return sections
    .map((s) => ({
      ...s,
      rows: s.rows.filter((r) =>
        fold(`${s.title ?? ''} ${r.label}`).includes(query),
      ),
    }))
    .filter((s) => s.rows.length > 0)
}

/** « Transformer en › » et « Couleur › ». */
function subMenu(
  editor: Editor,
  blocks: Block[],
  kind: 'turn' | 'color',
  done: () => void,
): Section[] {
  if (kind === 'turn') {
    const current = currentItem(blocks)
    return [
      {
        title: 'Transformer en',
        rows: TURN_INTO_ITEMS.map((item) => ({
          id: `turn-${item.id}`,
          label: item.label,
          icon: item.icon,
          check: item === current,
          run: () => {
            turnInto(editor, blocks, item)
            done()
          },
        })),
      },
    ]
  }
  const row = (k: ColorKind, color: NoteColor, prefix = ''): Row => ({
    id: `${prefix}${k}-${color}`,
    label: colorLabel(k, color),
    swatch: { kind: k, color },
    run: () => {
      colorBlocks(editor, blocks, k, color)
      done()
    },
  })
  const recent = recentColors()
  return [
    ...(recent.length
      ? [
          {
            title: 'Utilisé dernièrement',
            rows: recent.map((r) => row(r.kind, r.color, 'recent-')),
          },
        ]
      : []),
    {
      title: 'Couleur du texte',
      rows: NOTE_COLORS.map((c) => row('text', c.id)),
    },
    {
      title: "Couleur d'arrière-plan",
      rows: NOTE_COLORS.map((c) => row('background', c.id)),
    },
  ]
}

/** La surface des menus de l'éditeur (annexe §2) : rayon 10, ombre douce. */
const MENU_SURFACE =
  'flex flex-col rounded-[10px] border bg-popover text-popover-foreground shadow-[0_14px_28px_-6px_oklch(0.21_0.008_285/0.2),0_2px_4px_-1px_oklch(0.21_0.008_285/0.12)]'

function Heading({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-7 shrink-0 items-center truncate px-3 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  )
}

function Separator() {
  return <span aria-hidden className="mx-3 my-1 h-px shrink-0 bg-border" />
}

function MenuRow({
  row,
  active,
  open,
  onHover,
  onPick,
  ref,
}: {
  row: Row
  active: boolean
  open?: boolean
  onHover: () => void
  onPick: () => void
  ref?: React.Ref<HTMLButtonElement>
}) {
  const Icon = row.icon
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      aria-haspopup={row.sub ? 'menu' : undefined}
      aria-expanded={row.sub ? !!open : undefined}
      tabIndex={-1}
      // Le focus reste dans le champ de recherche.
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={onHover}
      onClick={onPick}
      className={cn(
        'mx-1 flex h-7 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors duration-[20ms] ease-in',
        (active || open) && 'bg-foreground/[5.5%]',
        row.danger && active && 'text-destructive',
      )}
    >
      {row.swatch ? (
        <span
          aria-hidden
          className="grid size-5 shrink-0 place-items-center rounded-[4px] border text-xs font-semibold"
          style={
            row.swatch.kind === 'text'
              ? { color: colorValue('text', row.swatch.color) ?? undefined }
              : {
                  background:
                    colorValue('background', row.swatch.color) ?? undefined,
                }
          }
        >
          A
        </span>
      ) : (
        Icon && <Icon aria-hidden className="size-[18px] shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{row.label}</span>
      {row.hint && (
        <span className="text-xs text-muted-foreground">{row.hint}</span>
      )}
      {row.check && <Check aria-hidden className="size-4 shrink-0" />}
      {row.sub && (
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
      )}
    </button>
  )
}
