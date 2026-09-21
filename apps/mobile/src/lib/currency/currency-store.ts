import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const KEY = 'carrental.currency';

/**
 * The customer's chosen currency (DEC-036) — a preference, not a promise: the API prices in it
 * where a price list exists and falls back to the business default where it does not, so a stale
 * value (a currency since disabled) is harmless. `null` = never chosen. Same persistence shape as
 * `usePushPreference`.
 */
interface CurrencyState {
  code: string | null;
  hydrated: boolean;
  setCode: (code: string) => void;
}

export const useCurrencyPreference = create<CurrencyState>((set) => {
  AsyncStorage.getItem(KEY)
    .then((v) => set({ code: v && /^[A-Z]{3}$/.test(v) ? v : null, hydrated: true }))
    .catch(() => set({ hydrated: true }));
  return {
    code: null,
    hydrated: false,
    setCode: (code) => {
      set({ code });
      void AsyncStorage.setItem(KEY, code).catch(() => undefined);
    },
  };
});
