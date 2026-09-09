'use client';

import { useI18n } from '@carrental/i18n/react';
import { CalendarClock, MapPin, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { writeTrip, type TripWindow } from '../lib/trip';

/** `datetime-local` wants `YYYY-MM-DDTHH:mm`; accept either that or a full ISO string. */
function toLocalInput(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 16);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/**
 * Availability search form — pushes to `/[locale]/search` with query params. Used on the home
 * page (empty) and on the search page itself (pre-filled from the current query so a visitor
 * can refine without going back home).
 */
export interface LocationOption {
  code: string;
  name: string;
}

export function HomeSearch({
  locale,
  locations,
  initialPickup = '',
  initialPickupAt,
  initialReturnAt,
  onSubmit,
  submitLabel,
  testid = 'search',
}: {
  locale: string;
  /** when provided the location field is a `<select>` of real codes instead of free text */
  locations?: LocationOption[];
  initialPickup?: string;
  initialPickupAt?: string;
  initialReturnAt?: string;
  /** when set, called with the chosen window instead of navigating to `/search` (in-place use) */
  onSubmit?: (trip: TripWindow) => void;
  submitLabel?: string;
  /** prefix for the form's `data-testid`s — override when a page renders more than one */
  testid?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();

  const [pickup, setPickup] = useState(initialPickup);
  const [pickupAt, setPickupAt] = useState(toLocalInput(initialPickupAt));
  const [returnAt, setReturnAt] = useState(toLocalInput(initialReturnAt));
  const [err, setErr] = useState<string | null>(null);

  // When no dates were supplied, default to a sensible window — computed after mount so SSR and
  // the first client render match (no hydration mismatch). `toLocalInput` keeps wall-clock time
  // (a `datetime-local` value is naive — converting to UTC here would shift it by the offset).
  useEffect(() => {
    if (initialPickupAt || initialReturnAt) return;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 12);
    const end = new Date(start.getTime() + 3 * 864e5);
    setPickupAt((v) => v || toLocalInput(start.toISOString()));
    setReturnAt((v) => v || toLocalInput(end.toISOString()));
  }, [initialPickupAt, initialReturnAt]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pickup.trim()) return setErr(t('search.errNoLocation'));
    if (!pickupAt || !returnAt || !(new Date(pickupAt) < new Date(returnAt))) {
      return setErr(t('search.errOrder'));
    }
    setErr(null);
    const trip: TripWindow = {
      pickup: pickup.trim().toUpperCase(),
      pickupAt: new Date(pickupAt).toISOString(),
      returnAt: new Date(returnAt).toISOString(),
    };
    writeTrip(trip);
    if (onSubmit) {
      onSubmit(trip);
      return;
    }
    const q = new URLSearchParams({
      pickup: trip.pickup,
      pickupAt: trip.pickupAt,
      returnAt: trip.returnAt,
    });
    router.push(`/${locale}/search?${q.toString()}`);
  }

  const field =
    'h-12 w-full rounded-xl border border-hairline bg-surface px-3.5 text-sm text-ink shadow-sm outline-none transition-colors placeholder:text-ink-muted focus:border-brand focus:ring-4 focus:ring-brand/15';
  const labelText =
    'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted';

  return (
    <form
      onSubmit={submit}
      data-testid={`${testid}-form`}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_auto] lg:items-end"
    >
      <label className="space-y-1.5 text-sm">
        <span className={labelText}>
          <MapPin className="size-3.5" aria-hidden="true" />
          {t('search.location')}
        </span>
        {locations && locations.length ? (
          <select
            className={field}
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            aria-label={t('search.location')}
            data-testid={`${testid}-location`}
          >
            <option value="" className="bg-surface text-ink">
              {t('search.locationPlaceholder')}
            </option>
            {locations.map((l) => (
              <option key={l.code} value={l.code} className="bg-surface text-ink">
                {l.name} ({l.code})
              </option>
            ))}
          </select>
        ) : (
          <input
            className={field}
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            placeholder="JFK"
            aria-label={t('search.location')}
            data-testid="search-location"
          />
        )}
      </label>
      <label className="space-y-1.5 text-sm">
        <span className={labelText}>
          <CalendarClock className="size-3.5" aria-hidden="true" />
          {t('search.pickupAt')}
        </span>
        <input
          type="datetime-local"
          className={field}
          value={pickupAt}
          onChange={(e) => setPickupAt(e.target.value)}
          data-testid={`${testid}-pickup-at`}
        />
      </label>
      <label className="space-y-1.5 text-sm">
        <span className={labelText}>
          <CalendarClock className="size-3.5" aria-hidden="true" />
          {t('search.returnAt')}
        </span>
        <input
          type="datetime-local"
          className={field}
          value={returnAt}
          onChange={(e) => setReturnAt(e.target.value)}
          data-testid={`${testid}-return-at`}
        />
      </label>
      <div>
        <button
          type="submit"
          data-testid={`${testid}-submit`}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Search className="size-4" aria-hidden="true" />
          {submitLabel ?? t('action.search')}
        </button>
      </div>
      {err ? (
        <p
          role="alert"
          className="text-sm font-medium text-destructive sm:col-span-2 lg:col-span-4"
        >
          {err}
        </p>
      ) : null}
    </form>
  );
}
