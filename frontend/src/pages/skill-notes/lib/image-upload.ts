import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

import { api, toApiError } from '@/shared/api'
import { toast } from '@/shared/ui'

import { COLUMN } from './columns'

/**
 * Le téléversement des images des notes (`POST /media`) et sa trace dans le
 * document. Pendant l'envoi, le bloc image porte un `uploadId` : la vue montre
 * l'aperçu local (`uploadPreview`), estompé, avec un indicateur ; à l'arrivée,
 * le bloc reçoit l'`url` relative de l'API (`/media/<id>`) et perd son
 * `uploadId`. Ces deux pas ne vont pas dans l'historique : annuler retire le
 * collage entier, pas l'arrivée de l'image.
 *
 * Un `uploadId` que cette session ne connaît pas (page fermée pendant un
 * envoi) n'a pas d'aperçu : le bloc se montre vide, prêt à être rempli.
 */

export const IMAGE = 'image'

/** Ce que l'API accepte (cf. `technique.md`, Médias) — pas de SVG. */
export const IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]
const MAX_SIZE = 20 * 1024 * 1024

const TOO_BIG = 'Image trop lourde : 20 Mo au plus.'
const BAD_TYPE = 'Format non pris en charge : PNG, JPEG, GIF ou WebP.'

/** Les aperçus locaux des envois en cours, par `uploadId`. */
const previews = new Map<string, string>()

export const uploadPreview = (uploadId: string | null | undefined) =>
  uploadId ? previews.get(uploadId) : undefined

/** Les fichiers images d'une liste (presse-papiers, dépôt). */
export const imageFiles = (files: FileList | null | undefined): File[] =>
  Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))

/** Le refus, avant tout envoi, d'un fichier que l'API refuserait. */
function refusal(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return BAD_TYPE
  if (file.size > MAX_SIZE) return TOO_BIG
  return null
}

async function upload(file: File): Promise<string> {
  const { data, error, response } = await api.POST('/media', {
    // Le corps part en multipart : `bodySerializer` le construit.
    body: { file: file as unknown as string },
    bodySerializer: () => {
      const form = new FormData()
      form.append('file', file)
      return form
    },
  })
  if (error || !data) throw toApiError(error, response)
  return data.url
}

function failure(error: unknown): string {
  const status = (error as { status?: unknown } | null)?.status
  if (status === 413) return TOO_BIG
  if (status === 415) return BAD_TYPE
  if (typeof status === 'number')
    return `Échec de l'envoi de l'image (erreur ${status}).`
  return "Échec de l'envoi de l'image : le serveur ne répond pas."
}

/** La position du bloc image qui porte cet envoi, s'il est encore là. */
function uploadPos(doc: PMNode, uploadId: string): number | null {
  let found: number | null = null
  doc.descendants((node, pos) => {
    if (found !== null) return false
    if (node.type.name === IMAGE && node.attrs.uploadId === uploadId) {
      found = pos
      return false
    }
    return !node.isTextblock
  })
  return found
}

/**
 * Envoie `file` pour le bloc qui porte `uploadId`. Échec : un toast, et le
 * bloc disparaît (`remove`, un collage) ou redevient vide (`reset`, le bloc
 * « Ajouter une image »).
 */
async function send(
  editor: Editor,
  file: File,
  uploadId: string,
  onFail: 'remove' | 'reset',
) {
  let url: string | null = null
  let error: unknown = null
  try {
    url = await upload(file)
  } catch (e) {
    error = e
  }
  if (!editor.isDestroyed) {
    const { state } = editor
    const pos = uploadPos(state.doc, uploadId)
    if (pos !== null) {
      const node = state.doc.nodeAt(pos)
      const tr = state.tr.setMeta('addToHistory', false)
      if (url !== null || onFail === 'reset')
        tr.setNodeMarkup(pos, undefined, {
          ...node?.attrs,
          src: url ?? node?.attrs.src ?? null,
          uploadId: null,
        })
      else tr.delete(pos, pos + (node?.nodeSize ?? 1))
      editor.view.dispatch(tr)
    }
  }
  if (error !== null) toast.error(failure(error))
  const preview = previews.get(uploadId)
  previews.delete(uploadId)
  // L'aperçu sert encore le temps que l'image du serveur se charge.
  if (preview) setTimeout(() => URL.revokeObjectURL(preview), 10_000)
}

/** Un envoi qui commence : son id, et son aperçu local tout de suite. */
function begin(file: File): string {
  const uploadId = crypto.randomUUID()
  previews.set(uploadId, URL.createObjectURL(file))
  return uploadId
}

/**
 * Colle ou dépose des images en `pos` : un bloc image par fichier, posé à
 * la place d'un paragraphe vide du document ou d'une colonne, sinon après le
 * bloc de texte de `pos` (ou en `pos` même, entre deux blocs).
 */
export function insertImages(editor: Editor, files: File[], pos: number) {
  const accepted: File[] = []
  for (const file of files) {
    const refused = refusal(file)
    if (refused) toast.error(refused)
    else accepted.push(file)
  }
  if (!accepted.length) return
  const uploads = accepted.map((file) => ({ file, uploadId: begin(file) }))
  const { doc } = editor.state
  const $pos = doc.resolve(Math.min(pos, doc.content.size))
  let range: number | { from: number; to: number } = pos
  if ($pos.parent.isTextblock && $pos.depth > 0) {
    const holder = $pos.node($pos.depth - 1).type.name
    range =
      !$pos.parent.content.size && (holder === 'doc' || holder === COLUMN)
        ? { from: $pos.before(), to: $pos.after() }
        : $pos.after()
  }
  const inserted = editor
    .chain()
    .focus()
    .insertContentAt(
      range,
      uploads.map(({ uploadId }) => ({ type: IMAGE, attrs: { uploadId } })),
    )
    .run()
  if (!inserted) {
    for (const { uploadId } of uploads) {
      const preview = previews.get(uploadId)
      if (preview) URL.revokeObjectURL(preview)
      previews.delete(uploadId)
    }
    return
  }
  for (const { file, uploadId } of uploads)
    void send(editor, file, uploadId, 'remove')
}

/** Remplit le bloc image vide en `pos` avec `file` (bouton « Téléverser »). */
export function uploadInto(editor: Editor, pos: number, file: File) {
  const refused = refusal(file)
  if (refused) {
    toast.error(refused)
    return
  }
  const node = editor.state.doc.nodeAt(pos)
  if (node?.type.name !== IMAGE) return
  const uploadId = begin(file)
  editor.view.dispatch(
    editor.state.tr
      .setNodeMarkup(pos, undefined, { ...node.attrs, uploadId })
      .setMeta('addToHistory', false),
  )
  void send(editor, file, uploadId, 'reset')
}
