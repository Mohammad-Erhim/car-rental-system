// Discovery / booking hooks (`Location`, `useLocations`, `useCategory`, checkout/booking hooks,
// `formatMinor`) are shared with `apps/site` — they live in `@carrental/client/react`.
// Re-exported here so existing ops imports (`useLocations`/`formatMinor`, mainly) keep working.
export {
  useLocations,
  useCategory,
  useAvailabilitySearch,
  useCreateQuote,
  useQuoteByRef,
  useConfirmBooking,
  useMyReservations,
  formatMinor,
  type Location,
  type SearchArgs,
  type ReservationResult,
} from '@carrental/client/react';
