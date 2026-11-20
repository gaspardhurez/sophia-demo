export {
  type LinkInfo,
  linkTitleQuery,
  resourceKeys,
  useCreateResource,
  useDeleteResource,
  useLinkTitle,
  useResourceNotes,
  useResources,
  useResourcesNotes,
  useSaveResourceNotes,
  useUpdateResource,
} from './api/queries'
export { resourceEmoji, resourceHref } from './model/emoji'
export type {
  Resource,
  ResourceCreate,
  ResourceNotes,
  ResourceUpdate,
} from './model/types'
export { ResourceForm, type ResourceFields } from './ui/resource-form'
export {
  type ExerciseReference,
  ResourcesSection,
} from './ui/resources-section'
