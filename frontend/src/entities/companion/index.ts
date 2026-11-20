export {
  type LiveDictation,
  type LiveDictationError,
  openLiveDictation,
} from './api/live-dictation'
export {
  companionKeys,
  useCentralIdeas,
  useCleanDictation,
  useCompanionStatus,
} from './api/queries'
export {
  type DictationRetry,
  dictationFailure,
  liveDictationFailure,
  recorderFailure,
} from './model/dictation-error'
export { type IdeasFailure, ideasFailure } from './model/ideas-error'
export type {
  ActionStatus,
  CentralIdea,
  CompanionStatus,
  Dictation,
} from './model/types'
