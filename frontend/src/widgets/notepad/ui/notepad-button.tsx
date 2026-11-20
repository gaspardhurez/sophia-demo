import { NotebookPen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useNotepad, useSaveNotepad } from '@/entities/notepad'
import { cn } from '@/shared/lib/utils'
import { Popover, PopoverContent, PopoverTrigger, Textarea } from '@/shared/ui'

/** Le temps de frappe qu'on laisse passer avant d'enregistrer. */
const REPOS_MS = 700

/**
 * Le pense-bête — un texte libre, joignable depuis n'importe quelle page.
 *
 * **Ce n'est pas une destination**, d'où le popover : on note ce qu'on vient de
 * voir *sans quitter l'écran où on l'a vu. Naviguer vers une page dédiée ferait
 * perdre le contexte au moment précis où il compte, et le plus souvent l'envie
 * de noter avec.
 *
 * **Un seul champ, pas une liste d'items.** Découper en objets distincts
 * demanderait de décider, pour chaque remarque, où elle commence et où elle
 * finit — un travail de rangement au pire moment. Le texte libre porte en plus
 * ce qu'une liste perdrait : les ratures, les regroupements, l'ordre qu'on se
 * donne soi-même.
 *
 * **L'éditeur ne vit que pendant que le panneau est ouvert.** C'est ce qui
 * dispense de synchroniser un état local avec le cache : à l'ouverture on part
 * du serveur, à la fermeture on a fini d'écrire, et rien ne peut revenir
 * écraser la frappe en cours.
 */
export function NotepadButton() {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Pense-bête"
        title="Pense-bête"
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <NotebookPen className="size-[18px]" />
      </PopoverTrigger>
      {/* Radix pose le focus sur le panneau à l'ouverture, ce qui écrasait
          l'`autoFocus` du champ : la frappe partait dans la page, et les
          espaces la faisaient défiler. On lui laisse la main et c'est
          l'éditeur qui se focalise, curseur en fin de texte. */}
      <PopoverContent
        align="end"
        className="w-[26rem] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Monté à l'ouverture seulement — voir le commentaire du composant. */}
        {open && <NotepadEditor />}
      </PopoverContent>
    </Popover>
  )
}

function NotepadEditor() {
  const { data, isPending } = useNotepad()
  const save = useSaveNotepad()

  const champ = useRef<HTMLTextAreaElement>(null)
  const [texte, setTexte] = useState<string | null>(null)
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ce qu'on a en attente d'enregistrement, lu au démontage — un état ne serait
  // pas à jour dans la fonction de nettoyage, qui capture le rendu où elle naît.
  const enAttente = useRef<string | null>(null)

  // La valeur du serveur, une fois : ensuite c'est la frappe qui commande.
  // Le curseur se pose **à la fin** — on vient ajouter une remarque, pas
  // reprendre le texte par le début.
  useEffect(() => {
    if (texte === null && data) {
      setTexte(data.content)
      requestAnimationFrame(() => {
        const el = champ.current
        if (!el) return
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      })
    }
  }, [data, texte])

  // À la fermeture, on enregistre ce qui n'a pas encore été envoyé. Sans ça,
  // fermer moins d'une seconde après avoir tapé perdrait la dernière phrase —
  // exactement le geste qu'on fait quand on a fini de noter.
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    return () => {
      if (minuteur.current) clearTimeout(minuteur.current)
      if (enAttente.current !== null) saveRef.current.mutate(enAttente.current)
    }
  }, [])

  function onChange(valeur: string) {
    setTexte(valeur)
    enAttente.current = valeur
    if (minuteur.current) clearTimeout(minuteur.current)
    minuteur.current = setTimeout(() => {
      enAttente.current = null
      save.mutate(valeur)
    }, REPOS_MS)
  }

  const enCours = save.isPending || enAttente.current !== null

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between px-3.5 pb-2 pt-3">
        <span className="font-heading text-[13px] font-semibold">
          Pense-bête
        </span>
        <span
          className={cn(
            'text-[11px] tabular-nums transition-colors',
            enCours ? 'text-muted-foreground' : 'text-muted-foreground/0',
          )}
        >
          {save.isError ? 'Non enregistré' : 'Enregistrement…'}
        </span>
      </div>
      <Textarea
        ref={champ}
        value={texte ?? ''}
        disabled={isPending && texte === null}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ce que tu vois à améliorer, au fil de l'eau…"
        className="min-h-[19rem] resize-y rounded-none border-x-0 border-b-0 text-[13px] leading-relaxed focus-visible:ring-0"
      />
    </div>
  )
}
