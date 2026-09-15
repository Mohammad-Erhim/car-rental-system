import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiFetch } from '../api/api-fetch';

/** Foreground behavior: still show a banner + play a sound while the app is open, matching the
 *  platform default a backgrounded/killed app gets. Call once at the app root. */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export type PushPermissionResult = 'granted' | 'denied' | 'unsupported';

/** Requests OS notification permission and returns the Expo push token, or null if denied/on a
 *  simulator. Does NOT prime the OS prompt itself — pair with the `mobile.push.*` priming screen
 *  so the native "Allow Notifications?" dialog only appears after the user has opted in once,
 *  which meaningfully improves opt-in rates versus asking on first launch. */
export async function registerForPushNotificationsAsync(): Promise<{
  token: string | null;
  result: PushPermissionResult;
}> {
  if (!Device.isDevice) return { token: null, result: 'unsupported' };

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return { token: null, result: 'denied' };

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );

  await submitPushToken(token);
  return { token, result: 'granted' };
}

/**
 * Registers this device's push token with the API so server-side events (booking confirmed, car
 * ready, plans changed) can actually reach it. `apps/api`'s notify module (see
 * `docs/ai-delivery` — the `notify`/`notification-rules` sweep) currently drives email/SMS only;
 * a `POST /notifications/push-tokens` endpoint + APNs/FCM dispatch is the natural extension but
 * doesn't exist yet, so this call is written against the endpoint that integration should land
 * on and no-ops (silently) until the backend adds it — the client side of this feature is
 * complete and ready to light up the moment that endpoint ships.
 */
async function submitPushToken(token: string): Promise<void> {
  try {
    await apiFetch('/notifications/push-tokens', {
      method: 'POST',
      body: { token, platform: Platform.OS },
    });
  } catch {
    // Endpoint not deployed yet, or the actor is anonymous — never block the UI on this.
  }
}

/** Wires a tap on a delivered/background notification to in-app navigation. Returns an
 *  unsubscribe function; call from the root layout's `useEffect`. */
export function onNotificationTapped(
  handler: (data: Record<string, unknown>) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    handler(response.notification.request.content.data ?? {});
  });
  return () => sub.remove();
}
