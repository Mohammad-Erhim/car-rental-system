import { useI18n } from '@carrental/i18n/react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CircleSlash, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { metaApi } from '@/lib/api';

/**
 * FR-GBL-005 — visible status. A compact health dot in the header that links to the full
 * component breakdown on the dashboard. Unavailable/stale is labelled, never shown as healthy.
 * The dot is always paired with an icon + accessible text, never colour alone.
 */
export function SystemStatus() {
  const { t } = useI18n();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['meta', 'health-summary'],
    queryFn: ({ signal }) => metaApi.healthSummary(signal),
    refetchInterval: 60_000,
  });

  if (isLoading) return null;

  interface View {
    variant: BadgeProps['variant'];
    Icon: LucideIcon;
    label: string;
    status: string;
  }
  const known = {
    ok: { variant: 'success', Icon: CheckCircle2, label: t('meta.health.ok') },
    degraded: { variant: 'warning', Icon: AlertTriangle, label: t('meta.health.degraded') },
    down: { variant: 'destructive', Icon: AlertTriangle, label: t('meta.health.down') },
  } as const;
  const view: View =
    isError || !data
      ? {
          variant: 'secondary',
          Icon: CircleSlash,
          label: t('state.offline.title'),
          status: 'unknown',
        }
      : // an unrecognised status from the API degrades gracefully rather than throwing
        { ...(known[data.status] ?? known.degraded), status: data.status };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/#ops-dash-health"
          aria-label={`${view.label}. ${t('meta.health.viewDetail')}`}
          className="hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring md:block"
        >
          <Badge variant={view.variant} data-testid="system-status" data-status={view.status}>
            <view.Icon aria-hidden="true" />
            <span className="hidden max-w-[9rem] truncate xl:inline">{view.label}</span>
          </Badge>
        </Link>
      </TooltipTrigger>
      <TooltipContent>{view.label}</TooltipContent>
    </Tooltip>
  );
}
