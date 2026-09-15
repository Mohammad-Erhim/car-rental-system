import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const KEY = 'carrental.applock.enabled';

interface AppLockState {
  enabled: boolean;
  hydrated: boolean;
  setEnabled: (v: boolean) => void;
}

export const useAppLock = create<AppLockState>((set) => {
  AsyncStorage.getItem(KEY).then((v) => set({ enabled: v === '1', hydrated: true }));
  return {
    enabled: false,
    hydrated: false,
    setEnabled: (v) => {
      set({ enabled: v });
      void AsyncStorage.setItem(KEY, v ? '1' : '0');
    },
  };
});
