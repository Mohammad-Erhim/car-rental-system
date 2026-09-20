import { useI18n } from '@carrental/i18n/react';

import { cellText, columnLabel, isNumericColumn, type ReportRow } from './report-columns';

/**
 * One result row on a phone: the first text column is the heading (the state, the category, the
 * check), the rest are label/value pairs — nothing hides off to the side of a wide table.
 */
export function ReportRowCard({
  row,
  columns,
  rows,
}: {
  row: ReportRow;
  columns: string[];
  rows: ReportRow[];
}) {
  const i18n = useI18n();
  const head = columns.find((c) => !isNumericColumn(c, rows) && c !== 'currency') ?? columns[0]!;
  const rest = columns.filter((c) => c !== head);
  return (
    <div className="space-y-2 p-4" data-testid="report-card">
      <p className="font-medium">{cellText(i18n, head, row)}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {rest.map((c) => (
          <div key={c} className={c === 'sample' || c === 'error' ? 'col-span-2' : undefined}>
            <dt className="text-xs uppercase text-muted-foreground">{columnLabel(i18n, c)}</dt>
            <dd className={isNumericColumn(c, rows) ? 'tabular-nums' : undefined}>
              {cellText(i18n, c, row)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
