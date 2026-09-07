import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  RadioCardOption,
  RadioGroup,
  Textarea,
} from '@carrental/ui';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';

import {
  useCancelDataRequest,
  useCreateDataRequest,
  useDataRequests,
} from '../../lib/api-hooks.js';
import { useAuth } from '../../lib/auth.js';

/**
 * SCREEN-CUS-024 — Account data requests & closure (FR-IAM-008). Access / correction / closure;
 * closure surfaces its blockers (active rental, unpaid balance, dispute, retention) rather than
 * silently failing.
 */
const KINDS = [
  {
    value: 'access',
    label: 'Get a copy of my data',
    hint: 'Export of the information on your account.',
  },
  { value: 'correction', label: 'Correct my data', hint: 'Ask us to fix something that is wrong.' },
  {
    value: 'closure',
    label: 'Close my account',
    hint: 'Subject to legal retention and open activity.',
  },
] as const;

const STATUS_VARIANT: Record<string, 'neutral' | 'success' | 'warning' | 'destructive'> = {
  received: 'neutral',
  in_review: 'warning',
  completed: 'success',
  rejected: 'destructive',
  cancelled: 'neutral',
  blocked: 'warning',
};

export function DataRequestsPage() {
  const { t } = useI18n();
  const { actor } = useAuth();
  const list = useDataRequests(!!actor);
  const create = useCreateDataRequest();
  const cancel = useCancelDataRequest();

  const [kind, setKind] = useState<'access' | 'correction' | 'closure'>('access');
  const [detail, setDetail] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await create.mutateAsync({ kind, detail: detail || undefined });
    setDetail('');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Data requests &amp; account closure</h1>
        <p className="text-sm text-muted-foreground">
          Ask for a copy of your data, a correction, or account closure. We confirm each request and
          tell you if anything blocks it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open a request</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <RadioGroup
              value={kind}
              onValueChange={(v) => setKind(v as typeof kind)}
              aria-label="Request type"
            >
              {KINDS.map((k) => (
                <RadioCardOption
                  key={k.value}
                  id={`data-kind-${k.value}`}
                  value={k.value}
                  title={k.label}
                  description={k.hint}
                />
              ))}
            </RadioGroup>
            <Field label="Anything we should know?" htmlFor="field-dr-detail">
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="Optional context for our team"
                />
              )}
            </Field>
            <Button type="submit" loading={create.isPending} data-testid="data-request-submit">
              Submit request
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your requests</CardTitle>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <AppStateView kind="loading" title={t('state.loading.title')} inline />
          ) : list.isError ? (
            <AppStateView
              kind="failure"
              inline
              title={t('state.failure.title')}
              primaryAction={{ label: t('action.retry'), onClick: () => list.refetch() }}
            />
          ) : !list.data?.length ? (
            <AppStateView kind="empty" inline title="No requests yet" />
          ) : (
            <ul className="divide-y" data-testid="data-request-list">
              {list.data.map((r) => (
                <li key={r.id} className="space-y-2 py-3" data-testid={`data-request-${r.kind}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium capitalize">{r.kind}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANT[r.status] ?? 'neutral'}>
                        {r.status.replace('_', ' ')}
                      </Badge>
                      {['received', 'in_review', 'blocked'].includes(r.status) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => cancel.mutate(r.id)}
                          data-testid={`data-request-cancel-${r.kind}`}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {r.blockers?.length ? (
                    <div
                      className="rounded-md bg-warning/10 p-3 text-xs"
                      data-testid="data-request-blockers"
                    >
                      <p className="flex items-center gap-1.5 font-medium text-warning">
                        <AlertTriangle className="size-3.5" aria-hidden="true" /> Blocked for now
                      </p>
                      <ul className="mt-1 list-disc ps-5 text-muted-foreground">
                        {r.blockers.map((b) => (
                          <li key={b.code}>{b.detail}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
