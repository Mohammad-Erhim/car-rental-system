/**
 * Operating-hours validation (FR-CAT-004 / SRS-AVL-004). Pure: given a location's weekly hours,
 * date-specific exceptions, timezone, and the after-hours-return flag, decide whether a pickup or
 * return instant is allowed. The caller resolves the instant → local wall-clock parts via `Intl`
 * (see `localParts`) and passes them in, so this stays timezone-library-free and testable.
 */

export interface WeeklyHours {
  day: number; // 0 = Sunday … 6 = Saturday
  open?: string; // 'HH:MM'
  close?: string; // 'HH:MM'
  closed?: boolean;
}

export interface HoursException {
  date: string; // 'YYYY-MM-DD' in the location's zone
  closed: boolean;
  open?: string | null;
  close?: string | null;
}

export interface LocalParts {
  /** 'YYYY-MM-DD' in the location's zone */
  date: string;
  /** 0-6, Sunday=0, in the location's zone */
  weekday: number;
  /** minutes since local midnight */
  minutes: number;
}

/** Resolve an epoch-ms instant to local date/weekday/minutes for an IANA zone using Intl. */
export function localParts(epochMs: number, timeZone: string): LocalParts {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(dtf.formatToParts(epochMs).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  const minutes = hour * 60 + Number(parts.minute);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    parts.weekday as string,
  );
  return { date, weekday, minutes };
}

function toMinutes(hhmm?: string | null): number | null {
  if (!hhmm) return null;
  const [hRaw, mRaw] = hhmm.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw ?? '0');
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export interface HoursCheck {
  ok: boolean;
  reason?: 'closed_that_day' | 'before_open' | 'after_close';
  openMinutes?: number;
  closeMinutes?: number;
}

/**
 * Is `local` within the location's open window for that day?
 * `allowAfterClose` (return + after-hours-return enabled) permits an instant after `close`.
 */
export function checkWithinHours(
  local: LocalParts,
  weekly: WeeklyHours[],
  exceptions: HoursException[],
  opts: { allowAfterClose?: boolean } = {},
): HoursCheck {
  const exc = exceptions.find((e) => e.date === local.date);
  let open: number | null;
  let close: number | null;

  if (exc) {
    if (exc.closed) return { ok: false, reason: 'closed_that_day' };
    open = toMinutes(exc.open);
    close = toMinutes(exc.close);
  } else {
    const wk = weekly.find((w) => w.day === local.weekday);
    if (!wk || wk.closed) return { ok: false, reason: 'closed_that_day' };
    open = toMinutes(wk.open);
    close = toMinutes(wk.close);
  }

  // A day marked open but with no explicit window is treated as open all day.
  if (open === null && close === null) return { ok: true };
  const o = open ?? 0;
  const c = close ?? 24 * 60;

  if (local.minutes < o)
    return { ok: false, reason: 'before_open', openMinutes: o, closeMinutes: c };
  if (local.minutes > c && !opts.allowAfterClose) {
    return { ok: false, reason: 'after_close', openMinutes: o, closeMinutes: c };
  }
  return { ok: true, openMinutes: o, closeMinutes: c };
}
