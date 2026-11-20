import { cn } from '@/shared/lib/utils'
import { PanelSection, Rule } from '@/shared/ui'
import { StickyNote } from 'lucide-react'
import { useState } from 'react'

/**
 * **Notes** : ce qu'on a à dire de CETTE fois-là. Toujours affichée depuis le
 * 19/11/2026 (à l'essai, une exception aux sections à la demande de #46) :
 * vide, une invite « Ajouter une note… » ; remplie, la note se lit. Un clic
 * ouvre le champ. Elle s'enregistre à la sortie du champ (`onSave`) : un clic
 * ailleurs, ou Échap, que le panneau gère — et au démontage du panneau, côté
 * appelant.
 */
export function NotesSection({
  notes,
  onChange,
  onSave,
}: {
  notes: string
  onChange: (next: string) => void
  onSave: () => void
}) {
  const [editing, setEditing] = useState(false)
  const filled = notes.trim().length > 0

  return (
    <>
      <Rule />
      <PanelSection icon={StickyNote} title="Notes">
        {editing ? (
          <textarea
            autoFocus
            value={notes}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => {
              setEditing(false)
              onSave()
            }}
            rows={3}
            placeholder="Sensations, charges, ce qui a coincé…"
            className="mt-0.5 mr-2 mb-1 ml-[34px] min-h-[52px] resize-y rounded-md border border-foreground/45 bg-transparent px-2 py-1.5 text-sm leading-[1.45] outline-none [field-sizing:content]"
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setEditing(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setEditing(true)
            }}
            className={cn(
              'mt-0.5 mr-2 mb-1 ml-[34px] cursor-text rounded-md border border-transparent px-2 py-1.5 text-sm leading-[1.45] whitespace-pre-wrap hover:border-border',
              !filled && 'text-muted-foreground',
            )}
          >
            {filled ? notes.trim() : 'Ajouter une note…'}
          </div>
        )}
      </PanelSection>
    </>
  )
}
