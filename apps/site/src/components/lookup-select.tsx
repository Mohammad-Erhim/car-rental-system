'use client';

import { useLookupOptions } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { LookupSelect as UiLookupSelect } from '@carrental/ui';

/**
 * A `<select>` fed by a reference-data type (e.g. `cancel_reason`) — options come from the API,
 * so the ops team's Reference data screen controls what customers see with no redeploy.
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
      placeholder={t('field.selectPlaceholder')}
      loadingLabel={t('state.loading.title')}
      errorLabel={t('field.optionsFailed')}
      retryLabel={t('action.retry')}
    />
  );
}
