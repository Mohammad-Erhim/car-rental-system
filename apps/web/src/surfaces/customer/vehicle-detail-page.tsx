import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@carrental/ui';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ApiError } from '../../lib/api.js';
import {
  formatMinor,
  useAvailabilitySearch,
  useCategory,
  useCreateQuote,
} from '../../lib/discovery-hooks.js';

/**
 * SCREEN-CUS-003 — Vehicle detail + reserve. Shows the class, its features, and the itemised
 * price for the requested window; "Reserve" creates a quote and places a short checkout hold,
 * then routes to review. Checkout itself is delivered in the next stage.
 */
export function VehicleDetailPage() {
  const { categoryCode = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const pickup = params.get('pickup') ?? '';
  const pickupAt = params.get('pickupAt') ?? '';
  const returnAt = params.get('returnAt') ?? '';

  const category = useCategory(categoryCode);
  const search = useAvailabilitySearch(
    pickup && pickupAt && returnAt
      ? { pickupLocationCode: pickup, pickupAt, returnAt, categoryCode }
      : null,
  );
  const createQuote = useCreateQuote();
  const [error, setError] = useState<string | null>(null);

  const option = search.data?.options.find((o) => o.categoryCode === categoryCode) ?? null;

  async function reserve() {
    setError(null);
    try {
      const q = await createQuote.mutateAsync({
        pickupLocationCode: pickup,
        pickupAt,
        returnAt,
        categoryCode,
        hold: true,
        holderKey: `web-${Date.now()}`,
      });
      navigate(`/checkout?quote=${q.reference}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reserve — please try again.');
    }
  }

  if (!pickup || !pickupAt || !returnAt) {
    return (
      <AppStateView
        kind="empty"
        title="Start a search first"
        primaryAction={{ label: 'Go to search', onClick: () => navigate('/') }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="text-sm text-primary underline underline-offset-4"
      >
        ← Back to results
      </button>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {category.data?.displayName ?? categoryCode}
            {category.data ? <Badge variant="neutral">{category.data.class}</Badge> : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {category.isLoading ? (
            <AppStateView kind="loading" inline title="Loading…" />
          ) : category.isError || !category.data ? (
            <AppStateView kind="failure" inline title="Couldn't load this vehicle class" />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{category.data.description}</p>
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Passengers</dt>
                  <dd className="font-medium">{category.data.passengers}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Luggage</dt>
                  <dd className="font-medium">{category.data.luggage}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Doors</dt>
                  <dd className="font-medium">{category.data.doors}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Transmission</dt>
                  <dd className="font-medium capitalize">{category.data.transmission}</dd>
                </div>
              </dl>
              {category.data.features.length ? (
                <ul className="flex flex-wrap gap-2" data-testid="vehicle-features">
                  {category.data.features.map((f) => (
                    <li key={f.code}>
                      <Badge variant="neutral">{f.label}</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Price for your trip</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {search.isLoading ? (
            <AppStateView kind="loading" inline title="Pricing…" />
          ) : !option || option.fromTotalMinor == null ? (
            <AppStateView
              kind="no-results"
              inline
              title="No price for this class and window"
              description="Try different dates or another class."
            />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {search.data!.durationHours} hours
                </span>
                <span className="text-xl font-semibold" data-testid="detail-total">
                  {formatMinor(option.fromTotalMinor, option.currency ?? 'USD')}
                </span>
              </div>
              {option.bookableCount > 0 ? (
                <Badge variant="success" data-testid="detail-availability">
                  {option.bookableCount} available for these dates
                </Badge>
              ) : (
                <Badge variant="warning" data-testid="detail-availability">
                  Not available for these dates
                </Badge>
              )}
              {error ? (
                <p className="text-sm text-destructive" data-testid="reserve-error">
                  {error}
                </p>
              ) : null}
              <Button
                onClick={reserve}
                loading={createQuote.isPending}
                disabled={option.bookableCount < 1}
                data-testid="reserve-button"
              >
                Reserve &amp; continue
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
