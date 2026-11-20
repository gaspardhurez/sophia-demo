import type { components } from '@/shared/api'

/** Une indisponibilité du calendrier (#105), créneaux bloqués compris. */
export type Unavailability = components['schemas']['UnavailabilityRead']
export type UnavailabilityCreate = components['schemas']['UnavailabilityCreate']
export type UnavailabilityUpdate = components['schemas']['UnavailabilityUpdate']
/** Un créneau bloqué : un temps pris pour de bon, dans l'indisponibilité. */
export type UnavailabilitySlot = components['schemas']['UnavailabilitySlotRead']
export type UnavailabilitySlotCreate =
  components['schemas']['UnavailabilitySlotCreate']
export type UnavailabilitySlotUpdate =
  components['schemas']['UnavailabilitySlotUpdate']
