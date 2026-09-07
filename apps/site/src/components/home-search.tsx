'use client';

import { useI18n } from '@carrental/i18n/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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
}: {
  locale: string;
  /** when provided the location field is a `<select>` of real codes instead of free text */
  locations?: LocationOption[];
  initialPickup?: string;
  initialPickupAt?: string;
  initialReturnAt?: string;
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
    const q = new URLSearchParams({
      pickup: pickup.trim().toUpperCase(),
      pickupAt: new Date(pickupAt).toISOString(),
      returnAt: new Date(returnAt).toISOString(),
    });
    router.push(`/${locale}/search?${q.toString()}`);
  }

  const field = 'h-11 w-full rounded-md border border-input bg-background px-3 text-sm';

  return (
    <form
      onSubmit={submit}
      data-testid="search-form"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
    >
      <label className="space-y-1 text-sm lg:col-span-1">
        <span className="font-medium text-muted-foreground">{t('search.location')}</span>
        {locations && locations.length ? (
          <select
            className={field}
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            aria-label={t('search.location')}
            data-testid="search-location"
          >
            <option value="">{t('search.locationPlaceholder')}</option>
            {locations.map((l) => (
              <option key={l.code} value={l.code}>
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
      <label className="space-y-1 text-sm">
        <span className="font-medium text-muted-foreground">{t('search.pickupAt')}</span>
        <input
          type="datetime-local"
          className={field}
          value={pickupAt}
          onChange={(e) => setPickupAt(e.target.value)}
          data-testid="search-pickup-at"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-muted-foreground">{t('search.returnAt')}</span>
        <input
          type="datetime-local"
          className={field}
          value={returnAt}
          onChange={(e) => setReturnAt(e.target.value)}
          data-testid="search-return-at"
        />
      </label>
      <div>
        <button
          type="submit"
          data-testid="search-submit"
          className="h-11 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t('action.search')}
        </button>
      </div>
      {err ? <p className="text-sm text-destructive sm:col-span-2 lg:col-span-4">{err}</p> : null}
    </form>
  );
}
