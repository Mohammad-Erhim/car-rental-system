import { useI18n } from '@carrental/i18n/react';
import { useEffect, useRef } from 'react';

import { useLookupValues } from '../lib/api-hooks.js';

/**
 * A `<select>` bound to a reference-data type — the option list, labels and order come from
 * `/ops/config/reference-data`, so deactivating or renaming a value there takes effect here
 * with no redeploy. If a value is marked as the default, it is pre-selected once.
 */
export function LookupSelect({
  typeCode,
  value,
  onChange,
  id,
  describedBy,
  invalid,
  disabled,
  placeholder,
  className,
}: {
  typeCode: string;
  value: string;
  onChange: (code: string) => void;
  id?: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** first option, shown while nothing is chosen (omit to force `required`-style empty state) */
  placeholder?: string;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const q = useLookupValues(typeCode, { locale });
  const options = q.data?.values ?? [];

  // apply the catalogue's default once, only if the caller hasn't already set a value
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || value || !options.length) return;
    const def = options.find((o) => o.isDefault);
    if (def) {
      applied.current = true;
      onChange(def.code);
    }
  }, [options, value, onChange]);

  const base =
    'flex h-11 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

  if (q.isError) {
    return (
      <div className="space-y-1">
        <p className="text-sm text-destructive">{t('ops.ref.optionsFailed')}</p>
        <button type="button" className="text-sm underline" onClick={() => void q.refetch()}>
          {t('ops.st.retry')}
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      disabled={disabled || q.isLoading}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${base} ${invalid ? 'border-destructive' : 'border-input'} ${className ?? ''}`}
    >
      <option value="">
        {q.isLoading ? t('ops.st.loading') : (placeholder ?? t('ops.ref.chooseOption'))}
      </option>
      {options.map((o) => (
        <option key={o.id} value={o.code}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
