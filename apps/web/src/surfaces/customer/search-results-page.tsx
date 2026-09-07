import { AppStateView, Badge, Button, Card, CardContent } from '@carrental/ui';
import { Luggage, Users } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { SearchForm } from '../../components/search-form.js';
import { formatMinor, useAvailabilitySearch } from '../../lib/discovery-hooks.js';

/**
 * SCREEN-CUS-002 — Search results (FLOW-CUS-001). Category cards with a real bookable count and
 * a price for the exact window; fresh / no-results states; the search control stays editable so
 * changing dates re-runs availability.
 */
export function SearchResultsPage() {
  const [params] = useSearchParams();
  const pickup = params.get('pickup');
  const pickupAt = params.get('pickupAt');
  const returnAt = params.get('returnAt');

  const args =
    pickup && pickupAt && returnAt ? { pickupLocationCode: pickup, pickupAt, returnAt } : null;
  const search = useAvailabilitySearch(args);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Choose your car</h1>
        <p className="text-sm text-muted-foreground">
          Prices and availability are for the exact pickup and return you entered.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <SearchForm compact />
        </CardContent>
      </Card>

      {!args ? (
        <AppStateView kind="empty" inline title="Enter a location and dates to see cars" />
      ) : search.isLoading ? (
        <AppStateView kind="loading" inline title="Checking live availability…" />
      ) : search.isError ? (
        <AppStateView
          kind="failure"
          inline
          title="We couldn't load availability"
          primaryAction={{ label: 'Retry', onClick: () => search.refetch() }}
        />
      ) : (
        <ResultsBody
          data={search.data!}
          pickup={pickup!}
          pickupAt={pickupAt!}
          returnAt={returnAt!}
        />
      )}
    </div>
  );
}

function ResultsBody({
  data,
  pickup,
  pickupAt,
  returnAt,
}: {
  data: NonNullable<ReturnType<typeof useAvailabilitySearch>['data']>;
  pickup: string;
  pickupAt: string;
  returnAt: string;
}) {
  const days = Math.round(data.durationHours / 24);
  const bookable = data.options.filter((o) => o.bookableCount > 0 && o.fromTotalMinor != null);

  if (data.notices.length > 0 && bookable.length === 0) {
    return (
      <AppStateView
        kind="no-results"
        title="Those dates don't work for this location"
        description={data.notices.map((n) => n.message).join(' ')}
      />
    );
  }
  if (bookable.length === 0) {
    return (
      <AppStateView
        kind="no-results"
        title="No cars available for those dates"
        description="Try a different pickup time or a nearby location."
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="results-list">
      <p className="text-sm text-muted-foreground">
        {bookable.length} option{bookable.length === 1 ? '' : 's'} · {data.durationHours} hours
        {days ? ` (~${days} day${days === 1 ? '' : 's'})` : ''}
      </p>
      {data.options
        .filter((o) => o.fromTotalMinor != null)
        .map((o) => {
          const soldOut = o.bookableCount < 1;
          const detailHref = `/vehicle/${o.categoryCode}?pickup=${pickup}&pickupAt=${encodeURIComponent(
            pickupAt,
          )}&returnAt=${encodeURIComponent(returnAt)}`;
          return (
            <Card
              key={o.categoryCode}
              data-testid={`result-${o.categoryCode}`}
              data-soldout={soldOut}
            >
              <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{o.categoryName}</span>
                    <Badge variant="neutral">{o.class}</Badge>
                    {soldOut ? (
                      <Badge variant="warning">Not available for these dates</Badge>
                    ) : (
                      <Badge variant="success" data-testid={`result-${o.categoryCode}-count`}>
                        {o.bookableCount} available
                      </Badge>
                    )}
                  </div>
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" aria-hidden="true" /> {o.passengers}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Luggage className="size-3.5" aria-hidden="true" /> {o.luggage}
                    </span>
                    <span className="capitalize">{o.transmission}</span>
                    {o.features.slice(0, 3).map((f) => (
                      <span key={f.code}>{f.label}</span>
                    ))}
                  </p>
                </div>
                <div className="text-end">
                  <p
                    className="text-lg font-semibold"
                    data-testid={`result-${o.categoryCode}-price`}
                  >
                    {formatMinor(o.fromTotalMinor!, o.currency ?? 'USD')}
                  </p>
                  <p className="text-xs text-muted-foreground">total for the trip</p>
                  <Button asChild size="sm" className="mt-2" disabled={soldOut}>
                    <Link to={detailHref}>View &amp; reserve</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}
