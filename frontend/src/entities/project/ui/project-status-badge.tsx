import { Chip } from '@/shared/ui'

import { PROJECT_STATUS_META } from '../model/status'
import type { ProjectStatus } from '../model/types'

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { label, badgeClassName } = PROJECT_STATUS_META[status]
  return <Chip className={badgeClassName}>{label}</Chip>
}
