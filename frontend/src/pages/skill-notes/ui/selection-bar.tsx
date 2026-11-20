import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { useEditorState } from '@tiptap/react'
import {
  Bold,
  Check,
  ChevronDown,
  CircleHelp,
  Code,
  Italic,
  Lightbulb,
  Link2,
  Link2Off,
  Strikethrough,
  Underline,
} from 'lucide-react'
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { cn } from '@/shared/lib/utils'

import { BODY_CONTAINERS, blockOfNode, TURN_INTO_ITEMS } from '../lib/blocks'
import {
  applyColor,
  type ColorKind,
  colorLabel,
  colorValue,
  currentColor,
  NOTE_COLORS,
  type NoteColor,
  recentColors,
} from '../lib/marks'
import {
  canIllustrate,
  movingAnnotationOf,
  startAnnotationDraft,
} from '../lib/examples'
import { normalizeHref } from '../lib/link'
import { blockAt } from '../model/document'
import { useQuestions } from '../model/questions-context'
import { LinkMenu } from './link-menu'

/** Le délai d'apparition après la fin d'une sélection (Notion : ~250 ms). */
const SETTLE_MS = 250
/** L'écart entre la barre et la ligne sélectionnée. */
const GAP = 8

/**
 * La barre d'une sélection de texte (design #88, « Sélection » ; relevé
 * Notion §5, en barre horizontale — décision du 03/10) :
 * [type du bloc ›] | gras, italique, souligné, barré, code | « Exemple » ·
 * « Question » | lien | A (couleur ›). « Exemple » et « Question » (#213,
 * la barre « Exemple | Question » de `kit/Annotations`, ici dans la barre de
 * mise en forme) ouvrent le formulaire d'une annotation sur la sélection —
 * dans un bloc ou à travers plusieurs ; une question sur un titre est une
 * question de section. « Question » n'est là que dans un document qui a des
 * questions (pas les notes d'une ressource).
 *
 * Elle se pose au-dessus de la sélection (au-dessous faute de place), centrée
 * sur une sélection d'une ligne, alignée sur son début sinon ; elle apparaît
 * 250 ms après la fin de la sélection — au relâcher de la souris, ou au
 * dernier ⇧flèche — puis suit la sélection sans clignoter. La frappe, un clic
 * ailleurs ou Échap la retirent. Jamais dans un bloc de code.
 *
 * Le lien (bouton, ou ⌘K) ouvre `LinkMenu` sous la sélection, à la place de
 * la barre : Entrée le pose et la barre revient, Échap renonce ; sur un lien
 * déjà posé, le bouton le retire.
 *
 */
export function SelectionBar({
  editor,
  area,
}: {
  editor: Editor
  area: RefObject<HTMLElement | null>
}) {
  const { create: asks } = useQuestions()
  const [linking, setLinking] = useState(false)
  const [menu, setMenu] = useState<'type' | 'color' | null>(null)
  const [shown, setShown] = useState(false)
  const sel = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null
      const { selection, doc } = e.state
      if (selection.empty || !(selection instanceof TextSelection)) return null
      // On ajuste le passage d'un exemple : son bandeau suffit.
      if (movingAnnotationOf(e.state)) return null
      const { $from, $to } = selection
      if ($from.parent.type.spec.code || $to.parent.type.spec.code) return null
      const block = blockAt(doc, selection.from)
      if (!block) return null
      return {
        from: selection.from,
        to: selection.to,
        focused: e.isFocused,
        type: typeOfRange(doc, selection.from, selection.to),
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        code: e.isActive('code'),
        link: e.isActive('link'),
        illustrable: canIllustrate(e.state, selection.from, selection.to),
        text: currentColor(e, 'text'),
        background: currentColor(e, 'background'),
      }
    },
  })

  // L'apparition : 250 ms après la fin de la sélection. Pendant un glisser
  // de souris, rien ; au relâcher, le délai part. Au clavier, chaque ⇧flèche
  // relance le délai tant que la barre n'est pas là ; une fois là, elle suit.
  const timer = useRef<number | undefined>(undefined)
  const dragging = useRef(false)
  const settle = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShown(true), SETTLE_MS)
  }
  const range = sel ? `${sel.from}:${sel.to}` : null
  useEffect(() => {
    if (range === null) {
      window.clearTimeout(timer.current)
      setShown(false)
      setLinking(false)
      setMenu(null)
    } else if (!dragging.current && !shown) settle()
    // Seul un changement de sélection relance le délai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  // Souris, ⌘K, Échap — écoutés sur l'éditeur ; le relâcher, partout.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  keys.current = (e) => {
    if (e.key === 'Escape' && shown && !linking) {
      setShown(false)
      setMenu(null)
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && sel) {
      e.preventDefault()
      openLink()
    }
  }
  useEffect(() => {
    const dom = editor.view.dom
    const down = (e: MouseEvent) => {
      if (e.button !== 0) return
      dragging.current = true
      window.clearTimeout(timer.current)
      setShown(false)
      setMenu(null)
    }
    const up = () => {
      if (!dragging.current) return
      dragging.current = false
      if (!editor.state.selection.empty) settle()
    }
    const key = (e: KeyboardEvent) => keys.current(e)
    dom.addEventListener('mousedown', down)
    dom.addEventListener('keydown', key)
    window.addEventListener('mouseup', up)
    return () => {
      dom.removeEventListener('mousedown', down)
      dom.removeEventListener('keydown', key)
      window.removeEventListener('mouseup', up)
      window.clearTimeout(timer.current)
    }
  }, [editor])

  // La largeur et la hauteur de la barre, pour la centrer et choisir son côté
  // — relues quand son contenu change (type du bloc, saisie du lien).
  const bar = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 36 })
  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const width = el.offsetWidth
    const height = el.offsetHeight
    setSize((s) =>
      s.width === width && s.height === height ? s : { width, height },
    )
  }, [shown, range, linking, sel?.type])

  function openLink() {
    setMenu(null)
    setLinking(true)
    setShown(true)
  }

  const visible = sel && shown && (sel.focused || linking || menu !== null)
  if (!sel || !visible || !area.current) return null
  const box = area.current.getBoundingClientRect()
  const start = editor.view.coordsAtPos(sel.from)
  const end = editor.view.coordsAtPos(sel.to, -1)
  const oneLine = Math.abs(start.top - end.top) < 4
  const anchor = oneLine
    ? (start.left + end.left) / 2 - size.width / 2
    : start.left - 6
  const left = Math.min(
    Math.max(0, anchor - box.left),
    Math.max(0, box.width - size.width),
  )
  const above = start.top - size.height - GAP >= GAP
  const top = above
    ? start.top - box.top - size.height - GAP
    : end.bottom - box.top + GAP

  // Le lien posé, la sélection reste et la barre revient (Notion).
  const applyLink = (text: string) => {
    const chain = editor.chain().focus().extendMarkRange('link')
    if (text.trim()) chain.setLink({ href: normalizeHref(text) })
    else chain.unsetLink()
    chain.run()
    setLinking(false)
  }
  const toggle = (which: 'type' | 'color') =>
    setMenu((m) => (m === which ? null : which))
  const typeLabel =
    sel.type === null
      ? 'Plusieurs types'
      : (TURN_INTO_ITEMS.find((i) => i.id === sel.type)?.label ?? 'Texte')

  if (linking) {
    // Sous la sélection, centré sur elle, dans la colonne.
    const center = (start.left + end.left) / 2
    const width = 330
    return (
      <LinkMenu
        initial={
          (editor.getAttributes('link').href as string | undefined) ?? ''
        }
        style={{
          top: end.bottom - box.top + GAP,
          left: Math.min(
            Math.max(0, (oneLine ? center : start.left) - box.left - width / 2),
            Math.max(0, box.width - width),
          ),
        }}
        onApply={applyLink}
        onCancel={() => {
          setLinking(false)
          editor.commands.focus()
        }}
      />
    )
  }

  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label="Mise en forme"
      // Le clic ne vole pas la sélection à l'éditeur.
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault()
      }}
      className={cn(
        'notes-palette absolute z-30 flex items-center gap-px rounded-[10px] border bg-popover p-1 text-[13px] whitespace-nowrap text-popover-foreground',
        'shadow-[0_14px_28px_-6px_oklch(0.21_0.008_285/0.2),0_2px_4px_-1px_oklch(0.21_0.008_285/0.12)]',
        // Fondu de 0,1 s après 30 ms, avec un léger glissé vers sa place.
        'animate-in fill-mode-both fade-in animation-duration-100 delay-[30ms]',
        above ? 'slide-in-from-bottom-1' : 'slide-in-from-top-1',
      )}
      style={{ top, left }}
    >
      <>
        <div className="relative">
          <Tool
            label="Transformer en"
            on={menu === 'type'}
            onClick={() => toggle('type')}
            className="w-auto gap-1 px-2 font-medium"
          >
            {typeLabel}
            <ChevronDown className="size-3 text-muted-foreground" />
          </Tool>
          {menu === 'type' && (
            <Panel label="Transformer en">
              <Heading>Transformer en</Heading>
              {TURN_INTO_ITEMS.map((item) => (
                <Row
                  key={item.id}
                  onClick={() => {
                    setMenu(null)
                    if (item.id === sel.type) return
                    if (item.action.kind === 'transform')
                      item.action.apply(editor.chain().focus()).run()
                  }}
                >
                  <item.icon className="size-4 text-muted-foreground" />
                  <span className="flex-1">{item.label}</span>
                  {item.id === sel.type && <Check className="size-3.5" />}
                </Row>
              ))}
            </Panel>
          )}
        </div>
        <Divider />
        <Tool
          label="Gras ⌘B"
          on={sel.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </Tool>
        <Tool
          label="Italique ⌘I"
          on={sel.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </Tool>
        <Tool
          label="Souligné ⌘U"
          on={sel.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline className="size-4" />
        </Tool>
        <Tool
          label="Barré ⌘⇧S"
          on={sel.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="size-4" />
        </Tool>
        <Tool
          label="Code ⌘E"
          on={sel.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="size-4" />
        </Tool>
        {sel.illustrable && (
          <>
            <Divider />
            <button
              type="button"
              onClick={() =>
                startAnnotationDraft(editor.view, {
                  from: sel.from,
                  to: sel.to,
                })
              }
              className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] px-2 font-medium transition-[background-color] duration-[20ms] ease-in hover:bg-accent"
            >
              <Lightbulb aria-hidden className="size-3.5" />
              Exemple
            </button>
            {asks && (
              <button
                type="button"
                onClick={() =>
                  startAnnotationDraft(
                    editor.view,
                    { from: sel.from, to: sel.to },
                    'question',
                  )
                }
                className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] px-2 font-medium transition-[background-color] duration-[20ms] ease-in hover:bg-accent"
              >
                <CircleHelp aria-hidden className="size-3.5" />
                Question
              </button>
            )}
          </>
        )}
        <Divider />
        <Tool
          label={sel.link ? 'Retirer le lien' : 'Lien ⌘K'}
          on={sel.link}
          onClick={() =>
            sel.link
              ? editor.chain().focus().extendMarkRange('link').unsetLink().run()
              : openLink()
          }
        >
          {sel.link ? (
            <Link2Off className="size-4" />
          ) : (
            <Link2 className="size-4" />
          )}
        </Tool>
        <Divider />
        <div className="relative">
          <Tool
            label="Couleur"
            on={menu === 'color'}
            onClick={() => toggle('color')}
            className="w-auto gap-0.5 px-1.5"
          >
            <Swatch text={sel.text} background={sel.background} />
            <ChevronDown className="size-3 text-muted-foreground" />
          </Tool>
          {menu === 'color' && (
            <ColorPanel
              text={sel.text}
              background={sel.background}
              onPick={(kind, color) => {
                setMenu(null)
                applyColor(editor, kind, color)
              }}
            />
          )}
        </div>
      </>
    </div>
  )
}

/**
 * Le type de « Transformer en » des blocs de `from` à `to` : l'id de son
 * entrée, ou null s'ils diffèrent (« Plusieurs types »).
 */
function typeOfRange(doc: PMNode, from: number, to: number) {
  const types = new Set<string | null>()
  doc.nodesBetween(from, to, (node, _pos, parent) => {
    if (!parent || !BODY_CONTAINERS.has(parent.type.name)) return true
    const type = typeOf(node)
    // Un bloc sans entrée qui en contient d'autres (les colonnes) : on y entre.
    if (type === null && !node.isTextblock && !node.isAtom) return true
    types.add(type)
    return false
  })
  return types.size === 1 ? [...types][0] : null
}

/**
 * L'entrée de « Transformer en » d'un bloc, d'après le registre : celle de
 * son type ; pour un type à plusieurs entrées (les titres), celle de son
 * niveau.
 */
function typeOf(node: PMNode) {
  const items = (blockOfNode(node.type.name)?.items ?? []).filter(
    (i) => i.action.kind === 'transform',
  )
  if (items.length <= 1) return items[0]?.id ?? null
  const level = node.attrs.level as number | undefined
  return items.find((i) => i.id.endsWith(`-${level}`))?.id ?? null
}

function Tool({
  label,
  on,
  onClick,
  className,
  children,
}: {
  label: string
  on: boolean
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-[6px] text-foreground/80 transition-[background-color] duration-[20ms] ease-in hover:bg-accent',
        on && 'bg-accent text-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
}

/** Un menu déroulant sous un bouton de la barre. */
function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="menu"
      aria-label={label}
      className={cn(
        'absolute top-full left-0 z-10 mt-1.5 flex max-h-[min(380px,60vh)] w-[220px] flex-col overflow-y-auto rounded-[10px] border bg-popover p-1 text-[13px] text-popover-foreground',
        'shadow-[0_14px_28px_-6px_oklch(0.21_0.008_285/0.2),0_2px_4px_-1px_oklch(0.21_0.008_285/0.12)]',
        'animate-in fill-mode-both fade-in zoom-in-[0.96] animation-duration-200',
      )}
    >
      {children}
    </div>
  )
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  )
}

function Row({
  onClick,
  children,
}: {
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded-[6px] px-2 text-left transition-[background-color] duration-[20ms] ease-in hover:bg-accent"
    >
      {children}
    </button>
  )
}

/** La pastille « A » : la couleur du texte sur celle du fond. */
function Swatch({
  text,
  background,
}: {
  text: NoteColor
  background: NoteColor
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-5 place-items-center rounded-[4px] text-[13px] leading-none font-semibold',
        background === 'default' && text === 'default' && 'border',
      )}
      style={{
        color: colorValue('text', text) ?? undefined,
        background: colorValue('background', background) ?? undefined,
      }}
    >
      A
    </span>
  )
}

/**
 * « Couleur › » : les dernières couleurs posées, puis les 10 du texte et les
 * 10 du fond (Notion), la courante cochée.
 */
function ColorPanel({
  text,
  background,
  onPick,
}: {
  text: NoteColor
  background: NoteColor
  onPick: (kind: ColorKind, color: NoteColor) => void
}) {
  const recent = recentColors()
  // Le fond que ⌘⇧H reposera : le plus récent.
  const shortcut = recent.find((r) => r.kind === 'background')
  const current = { text, background }
  const row = (kind: ColorKind, color: NoteColor, key = '') => (
    <Row key={`${key}${kind}-${color}`} onClick={() => onPick(kind, color)}>
      <Swatch
        text={kind === 'text' ? color : 'default'}
        background={kind === 'background' ? color : 'default'}
      />
      <span className="flex-1">{colorLabel(kind, color)}</span>
      {key && kind === 'background' && color === shortcut?.color && (
        <span className="text-xs text-muted-foreground">⌘⇧H</span>
      )}
      {current[kind] === color && <Check className="size-3.5" />}
    </Row>
  )
  return (
    <Panel label="Couleur">
      {recent.length > 0 && (
        <>
          <Heading>Utilisé dernièrement</Heading>
          {recent.map((r) => row(r.kind, r.color, 'recent-'))}
        </>
      )}
      <Heading>Couleur du texte</Heading>
      {NOTE_COLORS.map((c) => row('text', c.id))}
      <Heading>Couleur d'arrière-plan</Heading>
      {NOTE_COLORS.map((c) => row('background', c.id))}
    </Panel>
  )
}
