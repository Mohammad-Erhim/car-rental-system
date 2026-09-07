import { useI18n } from '@carrental/i18n/react';
import { Button, Field } from '@carrental/ui';
import { CalendarRange, MapPin, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useLocations } from '../lib/discovery-hooks.js';

/** Local datetime-local value (`YYYY-MM-DDTHH:MM`) → ISO instant. */
function toIso(local: string): string {
  return new Date(local).toISOString();
}
/** ISO instant → datetime-local value for the input. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultWindow() {
  const start = new Date();
  start.setDate(start.getDate() + 3);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 3);
  return { start: toLocalInput(start.toISOString()), end: toLocalInput(end.toISOString()) };
}

export function SearchForm({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const locations = useLocations();

  const dw = useMemo(defaultWindow, []);
  const [pickup, setPickup] = useState(params.get('pickup') ?? '');
  const [pickupAt, setPickupAt] = useState(
    params.get('pickupAt') ? toLocalInput(params.get('pickupAt')!) : dw.start,
  );
  const [returnAt, setReturnAt] = useState(
    params.get('returnAt') ? toLocalInput(params.get('returnAt')!) : dw.end,
  );
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pickup) return setError(t('search.errNoLocation'));
    if (!(new Date(pickupAt) < new Date(returnAt))) return setError(t('search.errOrder'));
    const q = new URLSearchParams({
      pickup,
      pickupAt: toIso(pickupAt),
      returnAt: toIso(returnAt),
    });
    navigate(`/search?${q.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className={
        compact
          ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end'
          : 'grid gap-4 sm:grid-cols-2'
      }
      data-testid="search-form"
      noValidate
    >
      <Field label={t('search.location')} htmlFor="search-location">
        {({ id }) => (
          <div className="flex items-center gap-2 rounded-md border border-input bg-background ps-3">
            <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <select
              id={id}
              className="h-11 w-full bg-transparent pe-3 text-sm focus-visible:outline-none"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              data-testid="search-location"
            >
              <option value="">{t('search.locationPlaceholder')}</option>
              {(locations.data ?? []).map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          </div>
        )}
      </Field>

      <Field label={t('search.pickupAt')} htmlFor="search-pickup-at">
        {({ id }) => (
          <div className="flex items-center gap-2 rounded-md border border-input bg-background ps-3">
            <CalendarRange className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              id={id}
              type="datetime-local"
              className="h-11 w-full bg-transparent pe-3 text-sm focus-visible:outline-none"
              value={pickupAt}
              onChange={(e) => setPickupAt(e.target.value)}
              data-testid="search-pickup-at"
            />
          </div>
        )}
      </Field>

      <Field label={t('search.returnAt')} htmlFor="search-return-at">
        {({ id }) => (
          <div className="flex items-center gap-2 rounded-md border border-input bg-background ps-3">
            <CalendarRange className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              id={id}
              type="datetime-local"
              className="h-11 w-full bg-transparent pe-3 text-sm focus-visible:outline-none"
              value={returnAt}
              onChange={(e) => setReturnAt(e.target.value)}
              data-testid="search-return-at"
            />
          </div>
        )}
      </Field>

      <div className={compact ? '' : 'sm:col-span-2'}>
        <Button type="submit" size="lg" className="w-full sm:w-auto" data-testid="search-submit">
          <Search className="size-4" aria-hidden="true" />
          {t('action.search')}
        </Button>
        {error ? (
          <p className="mt-2 text-sm text-destructive" data-testid="search-error">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
