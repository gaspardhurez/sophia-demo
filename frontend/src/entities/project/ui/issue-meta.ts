import { Ban, Check, type LucideIcon, X } from 'lucide-react'

import type { ProjectIssue } from '../model/status'

/** Libellé, icône et teinte de chaque sortie (design #32). */
export const ISSUE_META: Record<
  ProjectIssue,
  { label: string; icon: LucideIcon; text: string; border: string }
> = {
  achieved: {
    label: 'Réussi',
    icon: Check,
    text: 'text-emerald-600',
    border: 'border-emerald-600',
  },
  failed: {
    label: 'Raté',
    icon: X,
    text: 'text-rose-600',
    border: 'border-rose-600',
  },
  abandoned: {
    label: 'Abandonné',
    icon: Ban,
    text: 'text-rose-600',
    border: 'border-rose-600',
  },
}
