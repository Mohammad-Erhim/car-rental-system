import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * The in-progress trip search/selection — pickup/return location + dates, plus the class and
 * specific car the customer picked. Persisted across app restarts so re-opening the app resumes
 * where they left off, the same job `apps/site`'s `lib/trip.ts` localStorage draft does for the
 * "browse a car, then get sent to sign-in, then land back on the same trip" flow.
 */
export interface TripDraft {
  pickupLocationCode: string | null;
  returnLocationCode: string | null; // null = same as pickup
  pickupAt: string | null; // ISO instant
  returnAt: string | null; // ISO instant
  categoryCode: string | null;
  unitId: string | null;
}

interface TripDraftState extends TripDraft {
  setDraft: (patch: Partial<TripDraft>) => void;
  clear: () => void;
  hasSearch: () => boolean;
}

const EMPTY: TripDraft = {
  pickupLocationCode: null,
  returnLocationCode: null,
  pickupAt: null,
  returnAt: null,
  categoryCode: null,
  unitId: null,
};

export const useTripDraft = create<TripDraftState>()(
  persist(
    (set, get) => ({
      ...EMPTY,
      setDraft: (patch) => set(patch),
      clear: () => set(EMPTY),
      hasSearch: () => !!(get().pickupLocationCode && get().pickupAt && get().returnAt),
    }),
    {
      name: 'carrental.trip-draft.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ pickupLocationCode, returnLocationCode, pickupAt, returnAt, categoryCode, unitId }) => ({
        pickupLocationCode,
        returnLocationCode,
        pickupAt,
        returnAt,
        categoryCode,
        unitId,
      }),
    },
  ),
);
