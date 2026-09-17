import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const KEY = 'carrental.push.userPreference';

/**
 * The user's in-app "I want push notifications" choice, distinct from the OS permission grant.
 * Neither Android nor iOS lets an app revoke a permission it already has — turning the Settings
 * switch off can only ever be an app-level preference the app then respects (skips registering/
 * acting on push) even though the OS permission stays granted. Mirrors `useAppLock`'s persistence
 * shape (`null` = "never explicitly set", so Settings falls back to the live OS permission state
 * on first read instead of defaulting to off).
 */
interface PushPreferenceState {
  enabled: boolean | null;
  hydrated: boolean;
  setEnabled: (v: boolean) => void;
}

export const usePushPreference = create<PushPreferenceState>((set) => {
  AsyncStorage.getItem(KEY).then((v) =>
    set({ enabled: v === null ? null : v === '1', hydrated: true }),
  );
  return {
    enabled: null,
    hydrated: false,
    setEnabled: (v) => {
      set({ enabled: v });
      void AsyncStorage.setItem(KEY, v ? '1' : '0');
    },
  };
});
