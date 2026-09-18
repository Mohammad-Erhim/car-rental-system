import type { HoursSlot, OpsLocation } from '@/lib/admin-hooks';

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export const LOCATION_CODE = /^[A-Z0-9]{2,20}$/;

/** IANA zones the browser knows; a short list on engines that can't enumerate them. */
export const TIME_ZONES: string[] = (() => {
  try {
    const all = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.('timeZone');
    if (all?.length) return all;
  } catch {
    /* fall through */
  }
  return [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Asia/Dubai',
  ];
})();

export interface HoursValues {
  day: number;
  closed: boolean;
  open: string;
  close: string;
}

export interface LocationValues {
  code: string;
  name: string;
  timezone: string;
  afterHoursReturn: boolean;
  turnaroundMinutes: string;
  pickupInstructions: string;
  returnInstructions: string;
  supportedCategoryCodes: string[];
  line1: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  latitude: string;
  longitude: string;
  regularHours: HoursValues[];
}

/** Seven days, Sunday first; a day the API has no slot for is closed. */
export function mergeHours(saved: HoursSlot[]): HoursValues[] {
  return Array.from({ length: 7 }, (_, day) => {
    const s = saved.find((x) => x.day === day);
    return {
      day,
      closed: s ? (s.closed ?? false) : true,
      open: s?.open ?? '09:00',
      close: s?.close ?? '17:00',
    };
  });
}

export const emptyLocation = (): LocationValues => ({
  code: '',
  name: '',
  timezone: 'UTC',
  afterHoursReturn: false,
  turnaroundMinutes: '60',
  pickupInstructions: '',
  returnInstructions: '',
  supportedCategoryCodes: [],
  line1: '',
  city: '',
  region: '',
  postalCode: '',
  country: '',
  phone: '',
  email: '',
  latitude: '',
  longitude: '',
  regularHours: mergeHours([]),
});

export const locationValues = (l: OpsLocation): LocationValues => ({
  code: l.code,
  name: l.name,
  timezone: l.timezone,
  afterHoursReturn: l.afterHoursReturn,
  turnaroundMinutes: String(l.turnaroundMinutes),
  pickupInstructions: l.pickupInstructions ?? '',
  returnInstructions: l.returnInstructions ?? '',
  supportedCategoryCodes: [...l.supportedCategoryCodes],
  line1: l.address?.line1 ?? '',
  city: l.address?.city ?? '',
  region: l.address?.region ?? '',
  postalCode: l.address?.postalCode ?? '',
  country: l.address?.country ?? '',
  phone: l.contact?.phone ?? '',
  email: l.contact?.email ?? '',
  latitude: l.latitude ?? '',
  longitude: l.longitude ?? '',
  regularHours: mergeHours(l.regularHours),
});

/** Drop blank values so an untouched address/contact isn't stored as a bag of empty strings. */
export function clean(o: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(o)
      .map(([k, v]) => [k, v.trim()])
      .filter(([, v]) => v !== ''),
  );
}

/** the API shape for the week: a closed day carries no times */
export const toSlots = (hours: HoursValues[]): HoursSlot[] =>
  hours.map((s) =>
    s.closed ? { day: s.day, closed: true } : { day: s.day, open: s.open, close: s.close },
  );

/** `HH:MM` strings compare correctly as text */
export const opensBeforeCloses = (open: string, close: string) => !!open && !!close && open < close;

export const inCoordinateRange = (v: string, limit: number) =>
  v.trim() === '' || (Number.isFinite(Number(v)) && Math.abs(Number(v)) <= limit);

export const validTurnaround = (v: string) =>
  /^\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 1440;
