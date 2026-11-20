import type { Editor } from '@tiptap/core'
import { Check, Copy, Globe, Trash2 } from 'lucide-react'
import { type RefObject, useEffect, useRef, useState } from 'react'

import { cn } from '@/shared/lib/utils'

import { linkRangeAt, MENU_SHADOW, normalizeHref } from '../lib/link'

/** Le temps de survol avant la bulle, et celui qui la laisse rejoindre. */
const OPEN_MS = 400
const CLOSE_MS = 150
/** L'écart entre le lien et la bulle (Notion : 6 px). */
const GAP = 6

/**
 * Le survol d'un lien des notes (relevé Notion, 13/10) : une bulle sous son
 * début — 🌐 l'adresse en gris (coupée à 250 px), copier, « Modifier » ; on
 * passe du lien à la bulle sans qu'elle se ferme. « Modifier » ouvre à sa
 * place le panneau du lien : son adresse, son texte, « Supprimer le lien ».
 * Le panneau enregistre en se fermant (Entrée, Échap, clic ailleurs) ; une
 * adresse vidée retire le lien. Le clic sur le lien, lui, l'ouvre dans un
 * nouvel onglet (`openOnClick`).
 */
export function LinkHover({
  editor,
  area,
}: {
  editor: Editor
  area: RefObject<HTMLElement | null>
}) {
  const [link, setLink] = useState<HTMLAnchorElement | null>(null)
  const [editing, setEditing] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const later = (fn: () => void, ms: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(fn, ms)
  }
  const keep = () => window.clearTimeout(timer.current)
  const leave = () => {
    if (!editing) later(() => setLink(null), CLOSE_MS)
  }

  useEffect(() => {
    const dom = editor.view.dom
    const over = (e: MouseEvent) => {
      if (editing || e.buttons) return
      // Une mention n'est pas un lien du texte : rien à modifier.
      const a = (e.target as HTMLElement).closest('a:not([data-mention])')
      if (a instanceof HTMLAnchorElement && dom.contains(a))
        later(() => setLink(a), link ? 0 : OPEN_MS)
    }
    const out = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a')
      if (a && !a.contains(e.relatedTarget as Node | null)) leave()
    }
    // La frappe range la bulle (pas le panneau : il a le focus).
    const key = () => {
      if (!editing) setLink(null)
    }
    dom.addEventListener('mouseover', over)
    dom.addEventListener('mouseout', out)
    dom.addEventListener('keydown', key)
    return () => {
      dom.removeEventListener('mouseover', over)
      dom.removeEventListener('mouseout', out)
      dom.removeEventListener('keydown', key)
    }
  })
  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (!link || !area.current || !link.isConnected) return null
  const box = area.current.getBoundingClientRect()
  const first = link.getClientRects()[0] ?? link.getBoundingClientRect()
  const style = {
    top: first.bottom - box.top + GAP,
    left: Math.min(first.left - box.left, Math.max(0, box.width - 330)),
  }
  const close = () => {
    setEditing(false)
    setLink(null)
  }

  if (editing)
    return (
      <LinkEditor
        editor={editor}
        link={link}
        style={style}
        onClose={() => {
          close()
          editor.commands.focus()
        }}
      />
    )
  const href = link.getAttribute('href') ?? ''
  return (
    <div
      onMouseEnter={keep}
      onMouseLeave={leave}
      className={cn(
        'absolute z-30 flex h-8 max-w-[330px] items-center gap-0.5 rounded-[10px] border bg-popover py-1 pr-1 pl-1.5 text-xs text-popover-foreground',
        'shadow-[0_4px_12px_-2px_oklch(0.21_0.008_285/0.08)]',
        'animate-in fill-mode-both fade-in animation-duration-100',
      )}
      style={style}
    >
      <Globe className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="ml-1 max-w-[250px] truncate text-muted-foreground">
        {href}
      </span>
      <CopyButton text={href} />
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="h-6 shrink-0 rounded-[6px] px-1.5 hover:bg-accent"
      >
        Modifier
      </button>
    </div>
  )
}

/** Copier l'adresse ; une coche le dit une seconde. */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      aria-label="Copier le lien"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true)
          window.setTimeout(() => setDone(false), 1000)
        })
      }}
      className="ml-1 grid size-6 shrink-0 place-items-center rounded-[6px] text-muted-foreground hover:bg-accent"
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  )
}

/**
 * Le panneau d'un lien (Notion : « Page ou URL », « Titre du lien »,
 * « Supprimer le lien ») — le focus sur son texte.
 */
function LinkEditor({
  editor,
  link,
  style,
  onClose,
}: {
  editor: Editor
  link: HTMLAnchorElement
  style: React.CSSProperties
  onClose: () => void
}) {
  const [range] = useState(() => linkRangeAt(editor, link))
  const [href, setHref] = useState(range?.href ?? '')
  const [text, setText] = useState(range?.text ?? '')
  const panel = useRef<HTMLDivElement>(null)

  const save = () => {
    if (!range) return onClose()
    const type = editor.schema.marks.link
    const { from, to } = range
    const { tr, doc } = editor.state
    const url = href.trim()
    if (!url) tr.removeMark(from, to, type)
    else {
      const mark = type.create({ href: normalizeHref(url) })
      const label = text.trim() ? text : url
      if (label !== range.text) {
        // Le texte reprend la mise en forme de son début.
        const marks = doc
          .resolve(from + 1)
          .marks()
          .filter((m) => m.type !== type)
        tr.replaceWith(from, to, editor.schema.text(label, [...marks, mark]))
      } else tr.removeMark(from, to, type).addMark(from, to, mark)
    }
    if (tr.docChanged) editor.view.dispatch(tr)
    onClose()
  }
  const remove = () => {
    if (range)
      editor.view.dispatch(
        editor.state.tr.removeMark(
          range.from,
          range.to,
          editor.schema.marks.link,
        ),
      )
    onClose()
  }

  // Un clic ailleurs enregistre.
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node)) saveRef.current()
    }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [])

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault()
      save()
    }
  }
  const field =
    'h-7 w-full rounded-[6px] border bg-muted/40 px-1.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring'
  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Modifier le lien"
      className={cn(
        'absolute z-30 flex w-[330px] flex-col gap-1.5 rounded-[10px] border bg-popover px-3 pt-2.5 pb-1.5 text-popover-foreground',
        MENU_SHADOW,
        'animate-in fill-mode-both fade-in animation-duration-100',
      )}
      style={style}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Lien</span>
        <input
          aria-label="Adresse du lien"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={keys}
          className={field}
        />
      </label>
      <label className="mt-1 flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Titre du lien</span>
        <input
          autoFocus
          aria-label="Texte du lien"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={keys}
          className={field}
        />
      </label>
      <button
        type="button"
        onClick={remove}
        className="-mx-2 mt-1 flex h-7 items-center gap-2 rounded-[6px] px-2 text-left text-sm hover:bg-accent"
      >
        <Trash2 className="size-4 text-muted-foreground" />
        Supprimer le lien
      </button>
    </div>
  )
}
