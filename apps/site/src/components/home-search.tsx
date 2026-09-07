'use client';

import { useI18n } from '@carrental/i18n/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Minimal availability search — pushes to `/[locale]/search` with query params. */
export function HomeSearch({ locale }: { locale: string }) {
  const { t } = useI18n();
  const router = useRouter();

  const [pickup, setPickup] = useState('');
  // Date defaults depend on "now" → compute after mount so SSR and first client render match.
  const [pickupAt, setPickupAt] = useState('');
  const [returnAt, setReturnAt] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 10);
    const end = new Date(start.getTime() + 3 * 864e5);
    const iso = (d: Date) => d.toISOString().slice(0, 16);
    setPickupAt((v) => v || iso(start));
    setReturnAt((v) => v || iso(end));
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pickup.trim()) return setErr(t('search.errNoLocation'));
    if (!pickupAt || !returnAt || !(new Date(pickupAt) < new Date(returnAt))) {
      return setErr(t('search.errOrder'));
    }
    const q = new URLSearchParams({
      pickup: pickup.trim().toUpperCase(),
      pickupAt: new Date(pickupAt).toISOString(),
      returnAt: new Date(returnAt).toISOString(),
    });
    router.push(`/${locale}/search?${q.toString()}`);
  }

  const field = 'h-11 w-full rounded-md border border-input bg-background px-3 text-sm';

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
      <label className="space-y-1 text-sm lg:col-span-1">
        <span className="font-medium text-muted-foreground">{t('search.location')}</span>
        <input
          className={field}
          value={pickup}
          onChange={(e) => setPickup(e.target.value)}
          placeholder="LAX"
          aria-label={t('search.location')}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-muted-foreground">{t('search.pickupAt')}</span>
        <input
          type="datetime-local"
          className={field}
          value={pickupAt}
          onChange={(e) => setPickupAt(e.target.value)}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-muted-foreground">{t('search.returnAt')}</span>
        <input
          type="datetime-local"
          className={field}
          value={returnAt}
          onChange={(e) => setReturnAt(e.target.value)}
        />
      </label>
      <div>
        <button
          type="submit"
          className="h-11 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t('action.search')}
        </button>
      </div>
      {err ? <p className="text-sm text-destructive sm:col-span-2 lg:col-span-4">{err}</p> : null}
    </form>
  );
}
