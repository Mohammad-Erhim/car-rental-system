import { useLookupOptions } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { LookupSelect as UiLookupSelect } from '@carrental/ui';

/**
 * A `<select>` bound to a reference-data type — options, labels and order come from
 * `/ops/config/reference-data`, so deactivating or renaming a value there takes effect here
 * with no redeploy. A value marked as the default is pre-selected once.
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
  const f = useLookupOptions(typeCode, value, onChange);
  return (
    <UiLookupSelect
      {...f}
      value={value}
      onChange={onChange}
      id={id}
      describedBy={describedBy}
      invalid={invalid}
      disabled={disabled}
      className={className}
      placeholder={t('ops.ref.chooseOption')}
      loadingLabel={t('ops.st.loading')}
      errorLabel={t('ops.ref.optionsFailed')}
      retryLabel={t('ops.st.retry')}
    />
  );
}
