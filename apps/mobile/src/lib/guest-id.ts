import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'carrental.guestId';

export async function guestId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return `mobile-${Date.now()}`;
  }
}
