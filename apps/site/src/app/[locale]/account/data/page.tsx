'use client';

import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  Field,
  RadioCardOption,
  RadioGroup,
  Textarea,
} from '@carrental/ui';
import { AlertTriangle } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import {
  useCancelDataRequest,
  useCreateDataRequest,
  useDataRequests,
} from '../../../../lib/customer-hooks';

type Kind = 'access' | 'correction' | 'closure';

const STATUS_VARIANT: Record<string, 'neutral' | 'success' | 'warning' | 'destructive'> = {
  received: 'neutral',
  in_review: 'warning',
  completed: 'success',
  rejected: 'destructive',
  cancelled: 'neutral',
  blocked: 'warning',
};

/** SCREEN-CUS-024 — data requests & closure (FR-IAM-008); closure surfaces its blockers. */
export default function DataRequestsPage() {
  const { t } = useI18n();
  const { actor } = useAuth();
  const list = useDataRequests(!!actor);
  const create = useCreateDataRequest();
  const cancel = useCancelDataRequest();

  const [kind, setKind] = useState<Kind>('access');
  const [detail, setDetail] = useState('');

  const kinds: Array<{ value: Kind; label: string; hint: string }> = [
    { value: 'access', label: t('privacy.kind.access'), hint: t('privacy.kind.accessHint') },
    {
      value: 'correction',
      label: t('privacy.kind.correction'),
      hint: t('privacy.kind.correctionHint'),
    },
    { value: 'closure', label: t('privacy.kind.closure'), hint: t('privacy.kind.closureHint') },
  ];

  async function submit(e: FormEvent) {
    e.preventDefault();
    await create.mutateAsync({ kind, detail: detail || undefined });
    setDetail('');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t('privacy.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('privacy.intro')}</p>
      </div>

      <section className="surface-card rounded-2xl p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">{t('privacy.open')}</h2>
        <form onSubmit={submit} className="space-y-4">
          <RadioGroup
            value={kind}
            onValueChange={(v) => setKind(v as Kind)}
            aria-label={t('privacy.requestType')}
          >
            {kinds.map((k) => (
              <RadioCardOption
                key={k.value}
                id={`data-kind-${k.value}`}
                value={k.value}
                title={k.label}
                description={k.hint}
              />
            ))}
          </RadioGroup>
          <Field label={t('privacy.detailLabel')} htmlFor="field-dr-detail">
            {({ id }) => (
              <Textarea
                id={id}
                rows={3}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder={t('privacy.detailPlaceholder')}
              />
            )}
          </Field>
          <Button type="submit" loading={create.isPending} data-testid="data-request-submit">
            {t('privacy.submit')}
          </Button>
        </form>
      </section>

      <section className="surface-card rounded-2xl p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">{t('privacy.yourRequests')}</h2>
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
          <AppStateView kind="empty" inline title={t('privacy.none')} />
        ) : (
          <ul className="divide-y divide-hairline" data-testid="data-request-list">
            {list.data.map((r) => (
              <li key={r.id} className="space-y-2 py-3" data-testid={`data-request-${r.kind}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-ink">{t(`privacy.kindShort.${r.kind}`)}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[r.status] ?? 'neutral'}>
                      {t(`privacy.status.${r.status}`)}
                    </Badge>
                    {['received', 'in_review', 'blocked'].includes(r.status) ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancel.mutate(r.id)}
                        data-testid={`data-request-cancel-${r.kind}`}
                      >
                        {t('action.cancel')}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {r.blockers?.length ? (
                  <div
                    className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs"
                    data-testid="data-request-blockers"
                  >
                    <p className="flex items-center gap-1.5 font-medium text-warning">
                      <AlertTriangle className="size-3.5" aria-hidden="true" />
                      {t('privacy.blockedForNow')}
                    </p>
                    <ul className="mt-1 list-disc ps-5 text-ink-muted">
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
      </section>
    </div>
  );
}
