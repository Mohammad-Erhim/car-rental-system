import { useI18n } from '@carrental/i18n/react';
import { UserRoundCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ChoiceTabs } from '@/components/choice-tabs';
import { SectionCard } from '@/components/section-card';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDelegate,
  useDelegationPeople,
  useDelegations,
  useRevokeDelegation,
} from '@/lib/workflow-hooks';

/**
 * Out of office: hand my approvals to a colleague for a while. They see my tasks (marked "covering
 * for me") and can decide them; the history always says who decided for whom. It ends by itself, can
 * be ended earlier by either of us, and cannot be passed on.
 */
export function OutOfOffice() {
  const { t, fmt } = useI18n();
  const list = useDelegations();
  const people = useDelegationPeople();
  const create = useDelegate();
  const revoke = useRevokeDelegation();
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (list.isLoading || people.isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (list.isError || !list.data) {
    return (
      <StateView
        kind="error"
        title={t('ops.wf.loadFail')}
        actionLabel={t('ops.st.retry')}
        onAction={() => void list.refetch()}
      />
    );
  }
  const needle = q.trim().toLowerCase();
  const choices = (people.data ?? []).filter(
    (p) => !needle || `${p.name} ${p.email}`.toLowerCase().includes(needle),
  );
  const outgoing = list.data.filter((d) => d.direction === 'outgoing');
  const incoming = list.data.filter((d) => d.direction === 'incoming');

  const start = async () => {
    setError(null);
    try {
      await create.mutateAsync({
        delegateStaffProfileId: to,
        validUntil: new Date(until).toISOString(),
        reason: reason.trim() || undefined,
      });
      toast.success(t('ops.wfo.started'));
      setTo('');
      setUntil('');
      setReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ops.wf.saveFail'));
    }
  };

  return (
    <div className="space-y-4" data-testid="out-of-office">
      <SectionCard title={t('ops.wfo.title')} description={t('ops.wfo.body')} icon={UserRoundCheck}>
        {error ? (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('ops.wfo.who')}</p>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('ops.wfb.filter')}
              aria-label={t('ops.wfb.filter')}
            />
            <div className="max-h-56 overflow-y-auto">
              <ChoiceTabs
                layout="list"
                value={to}
                onChange={setTo}
                label={t('ops.wfo.who')}
                testIdPrefix="ooo-person"
                options={choices.map((p) => ({
                  value: p.staffProfileId,
                  label: p.name,
                  description: p.email,
                }))}
              />
              {!choices.length ? (
                <p className="text-sm text-muted-foreground">{t('ops.wfb.noMatches')}</p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ooo-until">{t('ops.wfo.until')}</Label>
              <Input
                id="ooo-until"
                type="datetime-local"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                data-testid="ooo-until"
              />
              <p className="text-xs text-muted-foreground">{t('ops.wfo.untilHint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ooo-reason">{t('ops.wfo.reason')}</Label>
              <Input
                id="ooo-reason"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            onClick={() => void start()}
            disabled={!to || !until}
            loading={create.isPending}
            data-testid="ooo-start"
          >
            {t('ops.wfo.start')}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title={t('ops.wfo.coveringMe')}>
        {outgoing.length ? (
          <ul className="space-y-2" data-testid="ooo-outgoing">
            {outgoing.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{d.delegate.name}</p>
                  <p className="text-muted-foreground">
                    {t('ops.wfo.until')}: {fmt.dateTime(d.validUntil)}
                    {d.reason ? ` · ${d.reason}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!d.active ? (
                    <Badge variant="outline">{t('ops.wfo.scheduled')}</Badge>
                  ) : (
                    <Badge variant="success">{t('ops.wfo.active')}</Badge>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void revoke.mutateAsync(d.id)}
                  >
                    {t('ops.wfo.end')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('ops.wfo.noneOut')}</p>
        )}
      </SectionCard>

      <SectionCard title={t('ops.wfo.iCover')}>
        {incoming.length ? (
          <ul className="space-y-2" data-testid="ooo-incoming">
            {incoming.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{d.delegator.name}</p>
                  <p className="text-muted-foreground">
                    {t('ops.wfo.until')}: {fmt.dateTime(d.validUntil)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void revoke.mutateAsync(d.id)}
                >
                  {t('ops.wfo.decline')}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('ops.wfo.noneIn')}</p>
        )}
      </SectionCard>
    </div>
  );
}
