import { useI18n } from '@carrental/i18n/react';
import { useEffect } from 'react';

import { TypesPanel } from './types-panel';
import { ValuesPanel } from './values-panel';

import { Page, PageHeader } from '@/components/page-header';
import { StateView } from '@/components/state-view';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLookupTypes } from '@/lib/api-hooks';
import { useListParams } from '@/lib/use-list-params';
import { useSearchBox } from '@/lib/use-search-box';

const PARAMS = ['type', 'q'] as const;

/**
 * SCREEN-OPS-030 / 031 — reference data: every business option list, its owner and
 * classification, and (where editable) its values — labels per locale, default, order,
 * deactivate / restore. System types are read-only with the reason shown (FR-GBL-004, FR-ADM-008,
 * SRS-LKP-*). The selected list and the search live in the URL. On a phone the catalogue is a
 * select above the values instead of a side list.
 */
export function ReferenceDataPage() {
  const { t } = useI18n();
  const { state, update } = useListParams(PARAMS);
  const search = useSearchBox(state.q, (q) => update({ q }));
  const types = useLookupTypes(state.q ? { search: state.q } : undefined);
  const list = types.data;

  // when nothing is selected (or the selection was filtered out), fall back to the first type
  const selected =
    state.type && list?.some((x) => x.code === state.type) ? state.type : (list?.[0]?.code ?? '');
  useEffect(() => {
    if (list && selected && selected !== state.type) update({ type: selected });
  }, [list, selected]);

  return (
    <Page>
      <PageHeader title={t('ops.ref.title')} description={t('ops.ref.subtitle')} />

      {/* phones: a select stands in for the side list */}
      <Card className="p-4 lg:hidden">
        <Select value={selected} onValueChange={(v) => update({ type: v })}>
          <SelectTrigger aria-label={t('ops.ref.catalogue')} className="h-11 font-mono">
            <SelectValue placeholder={t('ops.ref.pickType')} />
          </SelectTrigger>
          <SelectContent>
            {(list ?? []).map((x) => (
              <SelectItem key={x.code} value={x.code} className="font-mono">
                {x.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <TypesPanel
            types={list}
            loading={types.isLoading}
            error={types.isError}
            onRetry={() => void types.refetch()}
            selected={selected}
            onSelect={(code) => update({ type: code })}
            search={search.draft}
            onSearch={search.setDraft}
          />
        </div>

        {selected ? (
          <ValuesPanel key={selected} typeCode={selected} />
        ) : (
          <Card>
            <StateView title={t('ops.ref.pickType')} className="py-16" />
          </Card>
        )}
      </div>
    </Page>
  );
}
