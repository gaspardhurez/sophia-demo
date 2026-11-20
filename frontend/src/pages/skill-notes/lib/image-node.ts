import { Extension, type NodeViewRenderer } from '@tiptap/core'
import Image, { type ImageOptions } from '@tiptap/extension-image'
import { Plugin } from '@tiptap/pm/state'

import { toast } from '@/shared/ui'

import { imageFiles, insertImages } from './image-upload'

export { IMAGE } from './image-upload'

/**
 * L'image, un bloc (`@tiptap/extension-image`) : `src` est l'`url` relative
 * de l'API (`/media/<id>`, cf. `mediaSrc`), `width` la largeur choisie aux
 * poignées (en px, nulle : la taille naturelle, bornée par la colonne),
 * `uploadId` l'envoi en cours (cf. `image-upload`), `caption` sa légende
 * (nulle : pas de légende ; vide : la légende qu'on vient d'ajouter, à écrire).
 * Sans `src` ni envoi : le bloc vide « Ajouter une image ». La vue est React
 * (`ImageView`).
 */
export const ImageNode = Image.extend<
  ImageOptions & { view?: NodeViewRenderer }
>({
  // Le glisser passe par la poignée ⋮⋮ (`BlockHandle`), pas par le bloc.
  draggable: false,

  addOptions() {
    return { ...this.parent!(), view: undefined }
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-caption'),
        renderHTML: (attrs) =>
          attrs.caption ? { 'data-caption': attrs.caption } : {},
      },
      // Un envoi ne vit que dans cette session : jamais lu ni écrit en HTML.
      uploadId: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    }
  },

  addNodeView() {
    return this.options.view ?? null
  },
})

/**
 * Coller une image (presse-papiers) ou déposer un fichier image depuis le
 * Finder : elle est téléversée et posée à cet endroit. Un collage qui porte
 * du texte reste un collage de texte ; le glisser des blocs (⋮⋮) n'apporte
 * pas de fichier et passe son chemin.
 */
export const imageDrop = Extension.create({
  name: 'imageDrop',
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const data = event.clipboardData
            if (data?.getData('text/plain').trim()) return false
            const files = imageFiles(data?.files)
            if (!files.length) return false
            insertImages(editor, files, view.state.selection.from)
            return true
          },
          handleDrop: (view, event, _slice, moved) => {
            const dropped = event.dataTransfer?.files
            if (moved || !dropped?.length) return false
            event.preventDefault()
            const files = imageFiles(dropped)
            if (!files.length) {
              toast.error('Seules les images se déposent dans les notes.')
              return true
            }
            const at = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            })
            insertImages(editor, files, at?.pos ?? view.state.selection.from)
            return true
          },
        },
      }),
    ]
  },
})
