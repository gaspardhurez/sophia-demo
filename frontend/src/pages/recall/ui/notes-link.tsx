import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Un lien vers les notes du savoir, sur la question, dans un nouvel onglet :
 * la passation reste où elle en est. La page défile jusqu'à la question et la
 * montre.
 */
export function NotesLink({
  skillId,
  questionId,
  className,
  children,
}: {
  skillId: string
  questionId: string
  className?: string
  children: ReactNode
}) {
  return (
    <a
      href={`/skills/${skillId}/notes?question=${questionId}`}
      target="_blank"
      rel="noreferrer"
      className={className}
    >
      {children}
      <ArrowUpRight className="size-3 shrink-0" aria-hidden />
    </a>
  )
}
