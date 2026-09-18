import { useLookupOptions } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * A select bound to a reference-data type — options, labels and order come from
 * `/ops/config/reference-data`, so deactivating or renaming a value there takes effect here with
 * no redeploy. A value marked as the default is pre-selected once.
 */
export function LookupSelect({
  typeCode,
  value,
  onChange,
  id,
  describedBy,
  invalid,
  disabled,
  className,
}: {
  typeCode: string;
  value: string;
  onChange: (code: string) => void;
  id?: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const { options, loading, error, onRetry } = useLookupOptions(typeCode, value, onChange);

  if (error) {
    return (
      <div className="space-y-1 text-sm">
        <p className="text-destructive">{t('ops.ref.optionsFailed')}</p>
        <button type="button" className="underline" onClick={onRetry}>
          {t('ops.st.retry')}
        </button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || loading}>
      <SelectTrigger
        id={id}
        className={className}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
      >
        <SelectValue placeholder={loading ? t('ops.st.loading') : t('ops.ref.chooseOption')} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.code} value={o.code}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
