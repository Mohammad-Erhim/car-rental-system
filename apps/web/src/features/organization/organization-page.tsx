import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { Building2, MapPin, Pencil } from 'lucide-react';
import { useState } from 'react';

import { ADDRESS_FIELDS, LegalSheet } from './legal-sheet';

import { DetailList } from '@/components/detail-list';
import { Page, PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StateView } from '@/components/state-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLegalProfile } from '@/lib/invoice-hooks';

/**
 * SCREEN-OPS-042 — the organization's legal identity for invoicing (FR-PAY). The invoice service
 * refuses to issue an invoice until the legal name, tax ID and registered address are set, so
 * filling this in for the first time is what turns formal invoicing on. Editing happens in a side
 * sheet; the page itself shows what is on file.
 */
export function OrganizationPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('config.publish');
  const profile = useLegalProfile();
  const [editing, setEditing] = useState(false);

  const p = profile.data;
  const address = p?.registeredAddress ?? {};
  const complete = !!(p?.legalName?.trim() && p.taxId?.trim() && address.line1 && address.city);
  const dash = <span className="text-muted-foreground">—</span>;

  return (
    <Page>
      <PageHeader
        title={t('ops.org.title')}
        description={t('ops.org.subtitle')}
        badge={
          p ? (
            <Badge variant={complete ? 'success' : 'warning'}>
              {t(complete ? 'ops.org.complete' : 'ops.org.incomplete')}
            </Badge>
          ) : null
        }
        actions={
          canEdit && p ? (
            <Button onClick={() => setEditing(true)} data-testid="org-edit">
              <Pencil aria-hidden="true" />
              {t(complete ? 'ops.org.edit' : 'ops.org.complete_action')}
            </Button>
          ) : null
        }
      />

      {profile.isError ? (
        <StateView
          kind="error"
          title={t('ops.org.loadFail')}
          actionLabel={t('ops.st.retry')}
          onAction={() => void profile.refetch()}
        />
      ) : profile.isLoading || !p ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <>
          {!complete ? (
            <Alert variant="warning" data-testid="org-incomplete-banner">
              <AlertTitle>{t('ops.org.pausedTitle')}</AlertTitle>
              <AlertDescription>{t('ops.org.incompleteBanner')}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard
              icon={Building2}
              title={t('ops.org.legalSection')}
              description={t('ops.org.legalSectionHint')}
            >
              <DetailList
                className="sm:grid-cols-1 xl:grid-cols-1"
                items={[
                  { term: t('ops.org.legalName'), detail: p.legalName || dash },
                  {
                    term: t('ops.org.taxId'),
                    detail: p.taxId ? <span className="bidi-isolate">{p.taxId}</span> : dash,
                  },
                ]}
              />
            </SectionCard>
            <SectionCard icon={MapPin} title={t('ops.org.addressSection')}>
              <DetailList
                className="sm:grid-cols-2 xl:grid-cols-2"
                items={ADDRESS_FIELDS.map((f) => ({
                  term: t(`ops.org.address.${f}`),
                  detail: address[f] || dash,
                }))}
              />
            </SectionCard>
          </div>
        </>
      )}

      {editing ? <LegalSheet profile={p} open onOpenChange={setEditing} /> : null}
    </Page>
  );
}
