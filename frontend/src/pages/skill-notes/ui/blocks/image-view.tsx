import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react'
import { ImageIcon, ImageOff, Loader2 } from 'lucide-react'
import {
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { mediaSrc } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui'

import { IMAGE_TYPES, uploadInto, uploadPreview } from '../../lib/image-upload'

/** En deçà, une image n'est plus lisible. */
const MIN_WIDTH = 80

/**
 * Une image des notes (cf. `lib/image-node`) : centrée, au plus la largeur de
 * la colonne, coins légèrement arrondis. Au survol, deux poignées latérales
 * (Notion) en règlent la largeur — symétrique, l'image restant centrée —,
 * enregistrée au relâcher. Pendant l'envoi : l'aperçu local estompé et un
 * indicateur. Sans image : le bloc « Ajouter une image » et son bouton
 * Téléverser. Sous l'image, sa **légende** si elle en a une : un texte gris,
 * édité en place ; vidée, elle disparaît. Sans légende, « Écrire une
 * légende… » apparaît au survol (ou « Légende » dans le menu ⋮⋮).
 */
export function ImageView({
  editor,
  node,
  getPos,
  selected,
  updateAttributes,
}: NodeViewProps) {
  const { src, alt, width, uploadId, caption } = node.attrs as {
    src: string | null
    alt: string | null
    width: number | string | null
    uploadId: string | null
    caption: string | null
  }
  const preview = uploadPreview(uploadId)
  const shown = preview ?? (src ? mediaSrc(src) : null)

  const frame = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<number | null>(null)
  const [broken, setBroken] = useState<string | null>(null)

  if (!shown) {
    const pos = getPos()
    return (
      <EmptyImage
        selected={selected}
        onFile={(file) => {
          if (typeof pos === 'number') uploadInto(editor, pos, file)
        }}
      />
    )
  }

  const stored = width === null ? null : Number(width) || null
  const current = draft ?? stored

  const resize = (side: 1 | -1) => (e: PointerEvent) => {
    const box = frame.current
    const column = box?.parentElement
    if (!box || !column) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = box.getBoundingClientRect().width
    const max = column.clientWidth
    let last = startWidth
    const move = (ev: globalThis.PointerEvent) => {
      // L'image reste centrée : chaque bord bouge de la moitié.
      last = Math.round(
        Math.min(
          max,
          Math.max(MIN_WIDTH, startWidth + side * 2 * (ev.clientX - startX)),
        ),
      )
      setDraft(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      setDraft(null)
      if (Math.round(startWidth) !== last)
        updateAttributes({ width: last >= max ? null : last })
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  if (broken === shown) {
    return (
      <NodeViewWrapper contentEditable={false} className="py-1">
        <div
          className={cn(
            'flex items-center gap-2 rounded-md bg-muted px-3 py-2.5 text-sm text-muted-foreground',
            selected && 'ring-2 ring-ring/50',
          )}
        >
          <ImageOff className="size-4 shrink-0" />
          Image introuvable
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper
      contentEditable={false}
      className="flex justify-center py-1"
    >
      <div
        ref={frame}
        className="group/image relative max-w-full"
        style={current ? { width: current } : undefined}
      >
        <img
          src={shown}
          alt={alt ?? ''}
          draggable={false}
          onError={() => setBroken(shown)}
          className={cn(
            'block h-auto max-w-full rounded-md',
            current && 'w-full',
            preview && 'opacity-50',
            selected && 'ring-2 ring-ring/50',
          )}
        />
        {preview ? (
          <span
            role="status"
            className="absolute top-2 right-2 flex items-center gap-1.5 rounded-full bg-popover/90 px-2 py-0.5 text-xs text-popover-foreground shadow-sm"
          >
            <Loader2 className="size-3 animate-spin" />
            Envoi…
          </span>
        ) : (
          editor.isEditable &&
          ([-1, 1] as const).map((side) => (
            <span
              key={side}
              aria-hidden
              onPointerDown={resize(side)}
              className={cn(
                'absolute inset-y-0 flex w-4 cursor-col-resize items-center justify-center opacity-0 transition-opacity duration-150 group-hover/image:opacity-100',
                draft !== null && 'opacity-100',
                side < 0 ? 'left-1' : 'right-1',
              )}
            >
              <span className="h-12 max-h-[50%] w-1.5 rounded-full border border-background/90 bg-foreground/60 shadow-sm" />
            </span>
          ))
        )}
        {caption !== null ? (
          <Caption
            value={caption}
            editable={editor.isEditable}
            onChange={(next) => updateAttributes({ caption: next })}
          />
        ) : (
          editor.isEditable &&
          !preview && (
            // Sans légende : au survol de l'image, l'invite pour en écrire une
            // (sous l'image, sans pousser la suite) ; un clic l'ouvre.
            <button
              type="button"
              onClick={() => updateAttributes({ caption: '' })}
              className="absolute top-full left-0 mt-1.5 text-[13px] leading-snug text-muted-foreground/60 opacity-0 transition-opacity duration-150 group-hover/image:opacity-100 hover:text-muted-foreground focus-visible:opacity-100"
            >
              Écrire une légende…
            </button>
          )
        )}
      </div>
    </NodeViewWrapper>
  )
}

/** La hauteur du champ ajustée à son texte, tel qu'il se coupe. */
function fit(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = '0'
  el.style.height = `${el.scrollHeight}px`
}

/**
 * La légende d'une image : gris, 13 px, sous l'image et à sa largeur. Elle
 * s'écrit en place (un champ sans cadre qui s'allonge) ; ajoutée vide depuis
 * le menu, elle prend le focus ; quittée vide, elle disparaît.
 */
function Caption({
  value,
  editable,
  onChange,
}: {
  value: string
  editable: boolean
  onChange: (next: string | null) => void
}) {
  const field = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => fit(field.current), [value])
  // La hauteur suit aussi la largeur — celle de l'image, connue une fois
  // chargée ou redimensionnée : sinon le texte recoupé restait sur une ligne,
  // défilé, son début caché.
  useEffect(() => {
    const el = field.current
    if (!el) return
    let width = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      fit(el)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  // Ajoutée à l'instant (vide) : on l'écrit tout de suite — après que le menu
  // qui l'a ajoutée s'est refermé (il rend le focus à l'éditeur).
  useEffect(() => {
    if (value !== '') return
    const frame = requestAnimationFrame(() => field.current?.focus())
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!editable)
    return value ? (
      <p className="mt-1.5 text-[13px] leading-snug break-words text-muted-foreground">
        {value}
      </p>
    ) : null
  return (
    <textarea
      ref={field}
      rows={1}
      value={value}
      placeholder="Écrire une légende…"
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.value.trim()) onChange(null)
      }}
      // L'invite ne se montre qu'au survol de l'image, ou le champ ouvert.
      className="mt-1.5 block w-full resize-none overflow-hidden bg-transparent p-0 text-[13px] leading-snug break-words whitespace-pre-wrap text-muted-foreground outline-none placeholder:text-transparent group-hover/image:placeholder:text-muted-foreground/60 focus:placeholder:text-muted-foreground/60"
    />
  )
}

/** Le bloc vide (`/Image`) : un cadre discret, et Téléverser. */
function EmptyImage({
  selected,
  onFile,
}: {
  selected: boolean
  onFile: (file: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <NodeViewWrapper contentEditable={false} className="py-1">
      <div
        className={cn(
          'flex cursor-pointer items-center gap-2.5 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/70',
          selected && 'ring-2 ring-ring/50',
        )}
        onClick={() => input.current?.click()}
      >
        <ImageIcon className="size-4 shrink-0" />
        <span className="flex-1">Ajouter une image</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation()
            input.current?.click()
          }}
        >
          Téléverser
        </Button>
        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onFile(file)
          }}
        />
      </div>
    </NodeViewWrapper>
  )
}
