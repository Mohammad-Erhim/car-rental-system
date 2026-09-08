import { useI18n } from '@carrental/i18n/react';
import { Badge } from '@carrental/ui';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CircleSlash } from 'lucide-react';

import { metaApi } from '../lib/api.js';

/**
 * FR-GBL-005 — visible status. Coarse health chip. Unavailable/stale is labelled, never
 * rendered as "0" or hidden.
 */
export function SystemStatus() {
  const { t } = useI18n();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['meta', 'health-summary'],
    queryFn: ({ signal }) => metaApi.healthSummary(signal),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <span className="text-xs text-muted-foreground" data-testid="system-status-loading">
        …
      </span>
    );
  }

  if (isError || !data) {
    return (
      <Badge variant="neutral" data-testid="system-status" data-status="unknown">
        <CircleSlash className="size-3" aria-hidden="true" />
        {t('state.offline.title')}
      </Badge>
    );
  }

  const map = {
    ok: { variant: 'success' as const, Icon: CheckCircle2, label: t('meta.health.ok') },
    degraded: {
      variant: 'warning' as const,
      Icon: AlertTriangle,
      label: t('meta.health.degraded'),
    },
    down: { variant: 'destructive' as const, Icon: AlertTriangle, label: t('meta.health.down') },
  };
  const { variant, Icon, label } = map[data.status];

  return (
    <Badge
      variant={variant}
      data-testid="system-status"
      data-status={data.status}
      title={label}
      className="max-w-[9rem] truncate"
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Badge>
  );
}
