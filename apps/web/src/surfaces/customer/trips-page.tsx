import { AppStateView, Badge, Button, Card, CardContent } from '@carrental/ui';

import { useAuth } from '../../lib/auth.js';
import { formatMinor, useMyReservations } from '../../lib/discovery-hooks.js';

/**
 * SCREEN-CUS-014 (list slice) — the signed-in customer's reservations. Detail / modify / cancel
 * land in STAGE-004; this shows the confirmed bookings from STAGE-003.
 */
export function TripsPage() {
  const { status } = useAuth();
  const authed = status === 'authenticated';
  const trips = useMyReservations(authed);

  if (!authed) {
    return (
      <AppStateView
        kind="empty"
        title="Sign in to see your trips"
        primaryAction={{ label: 'Sign in', onClick: () => (window.location.href = '/sign-in') }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Your trips</h1>

      {trips.isLoading ? (
        <AppStateView kind="loading" inline title="Loading…" />
      ) : trips.isError ? (
        <AppStateView
          kind="failure"
          inline
          title="Couldn't load your trips"
          primaryAction={{ label: 'Retry', onClick: () => trips.refetch() }}
        />
      ) : !trips.data?.length ? (
        <AppStateView
          kind="empty"
          title="No trips yet"
          description="Search for a car on the home page to make your first booking."
          primaryAction={{ label: 'Find a car', onClick: () => (window.location.href = '/') }}
        />
      ) : (
        <ul className="space-y-3" data-testid="trips-list">
          {trips.data.map((r) => (
            <li key={r.reference}>
              <Card data-testid={`trip-${r.reference}`}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bidi-isolate font-mono font-semibold">{r.reference}</span>
                      <Badge variant={r.state === 'confirmed' ? 'success' : 'neutral'}>
                        {r.state}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {r.categoryCode} · {r.pickupLocationCode} ·{' '}
                      {new Date(r.pickupAt).toLocaleDateString()} –{' '}
                      {new Date(r.returnAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-semibold">{formatMinor(r.totalMinor, r.currency)}</p>
                    <Button size="sm" variant="outline" className="mt-2" disabled>
                      Manage (soon)
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
