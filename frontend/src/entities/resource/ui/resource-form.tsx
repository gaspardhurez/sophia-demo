import { Loader2 } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import {
  Button,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@/shared/ui'
import { cn } from '@/shared/lib/utils'

import { useLinkTitle } from '../api/queries'

/** Un lien dont le serveur peut lire la page. */
const WEB_LINK = /^https?:\/\/\S+\.\S+$/
/** Le temps de finir de taper un lien avant d'aller lire sa page. */
const LINK_DELAY = 400

/** Les champs saisis d'une ressource, nettoyés (vides → `null`). */
export interface ResourceFields {
  title: string
  author: string | null
  reference: string | null
  part: string | null
}

/**
 * Le formulaire d'une ressource (design #81 et #85, `prod/Savoir`), dans une
 * modale : Lien ou référence, Titre, Auteur, Partie — le lien d'abord, il
 * donne le titre ; l'auteur à part du titre (#173), écrit en second sous lui
 * dans la colonne des notes. « Nouvelle ressource » et « Modifier la ressource » le partagent ;
 * `footerStart` pose une action à gauche du pied (Supprimer).
 *
 * `suggestTitle` (nouvelle ressource) : un lien web collé (aussitôt, à
 * chaque collage) ou tapé, le titre se remplit de celui de la page, un
 * spinner dans le champ le temps de la lire — tant qu'il est vide ou qu'il
 * vient d'un lien, jamais par-dessus un titre tapé.
 */
export function ResourceForm({
  heading,
  submitLabel,
  defaultValues,
  isPending,
  onSubmit,
  onCancel,
  footerStart,
  suggestTitle = false,
}: {
  heading: string
  submitLabel: string
  defaultValues?: Partial<ResourceFields>
  isPending: boolean
  onSubmit: (fields: ResourceFields) => Promise<void>
  onCancel: () => void
  footerStart?: ReactNode
  suggestTitle?: boolean
}) {
  const [title, setTitle] = useState(defaultValues?.title ?? '')
  const [author, setAuthor] = useState(defaultValues?.author ?? '')
  const [reference, setReference] = useState(defaultValues?.reference ?? '')
  const [part, setPart] = useState(defaultValues?.part ?? '')

  // Le lien à lire : tapé, une fois qu'on a fini de le taper ; collé,
  // aussitôt et à neuf, même s'il est déjà lu (`paste` compte les collages).
  const [link, setLink] = useState<{ url: string; paste: number } | null>(null)
  const pastes = useRef(0)
  useEffect(() => {
    const url = reference.trim()
    const ok = suggestTitle && WEB_LINK.test(url)
    const wait = window.setTimeout(
      () => setLink(ok ? { url, paste: pastes.current } : null),
      ok ? LINK_DELAY : 0,
    )
    return () => window.clearTimeout(wait)
  }, [reference, suggestTitle])
  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const input = e.currentTarget
    // Après le collage, la valeur du champ est à jour.
    requestAnimationFrame(() => {
      const url = input.value.trim()
      if (!suggestTitle || !WEB_LINK.test(url)) return
      pastes.current += 1
      setLink({ url, paste: pastes.current })
    })
  }
  const found = useLinkTitle(link?.url ?? null, link?.paste ?? 0)

  // Le titre et l'auteur se remplissent tant qu'ils sont vides ou que c'est
  // nous qui les avons écrits — jamais par-dessus ce qu'on a tapé.
  const [auto, setAuto] = useState(false)
  const [autoAuthor, setAutoAuthor] = useState(false)
  const fillable = !title.trim() || auto
  const authorFillable = !author.trim() || autoAuthor
  const filledFor = useRef<string | null>(null)
  const linkKey = link && `${link.paste} ${link.url}`
  useEffect(() => {
    if (!found.data || filledFor.current === linkKey) return
    filledFor.current = linkKey
    if (found.data.title && fillable) {
      setTitle(found.data.title)
      setAuto(true)
    }
    if (found.data.author && authorFillable) {
      setAuthor(found.data.author)
      setAutoAuthor(true)
    }
  }, [found.data, fillable, authorFillable, linkKey])
  const searching = found.isFetching && fillable

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    void onSubmit({
      title: title.trim(),
      author: author.trim() || null,
      reference: reference.trim() || null,
      part: part.trim() || null,
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <DialogHeader>
        <DialogTitle className="text-base">{heading}</DialogTitle>
      </DialogHeader>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold">Lien ou référence</span>
        <Input
          autoFocus
          value={reference}
          onPaste={onPaste}
          onChange={(e) => setReference(e.target.value)}
          placeholder="https://…"
          className="text-[13px]"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold">Titre</span>
        <span className="relative">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setAuto(false)
            }}
            placeholder={
              searching
                ? 'Recherche du titre…'
                : 'Exemple : Le podcast du dev, épisode 12'
            }
            className={cn('text-[13px]', searching && 'pr-8')}
          />
          {searching && (
            <Loader2
              aria-label="Recherche du titre"
              className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          )}
        </span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold">Auteur</span>
        <Input
          value={author}
          onChange={(e) => {
            setAuthor(e.target.value)
            setAutoAuthor(false)
          }}
          placeholder="Exemple : Martin Breuss"
          className="text-[13px]"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold">Partie</span>
        <Input
          value={part}
          onChange={(e) => setPart(e.target.value)}
          placeholder="Exemple : chapitre 3, ou 4:10 → 9:30"
          className="text-[13px]"
        />
      </label>
      <DialogFooter className={footerStart ? 'sm:justify-start' : undefined}>
        {footerStart}
        {footerStart && <span className="flex-1" />}
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={!title.trim()} isPending={isPending}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
