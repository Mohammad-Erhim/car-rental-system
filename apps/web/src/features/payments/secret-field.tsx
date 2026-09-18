import { useI18n } from '@carrental/i18n/react';
import { useState } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { PasswordInput } from '@/components/ui/password-input';

/**
 * A write-only credential. The API never returns a saved secret — only whether one exists and its
 * last four characters — so a configured secret shows as a locked value with "Replace" until the
 * operator chooses to type a new one. Untouched, the form value stays empty and nothing is sent.
 */
export function SecretField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  configured,
  last4,
  testId,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  configured: boolean;
  last4: string | null;
  testId: string;
}) {
  const { t } = useI18n();
  const [replacing, setReplacing] = useState(false);
  const locked = configured && !replacing;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          {locked ? (
            <div className="flex items-center gap-2">
              <span
                className="flex h-10 flex-1 items-center rounded-lg border bg-muted/40 px-3 font-mono text-sm text-muted-foreground"
                data-testid={`${testId}-configured`}
              >
                {last4 ? `••••${last4}` : t('ops.pay.configuredNoDetail')}
              </span>
              <Button type="button" variant="outline" onClick={() => setReplacing(true)}>
                {t('ops.pay.replaceKey')}
              </Button>
            </div>
          ) : (
            <FormControl>
              <PasswordInput
                {...field}
                value={field.value ?? ''}
                autoComplete="off"
                showLabel={t('auth.showPw')}
                hideLabel={t('auth.hidePw')}
                data-testid={testId}
              />
            </FormControl>
          )}
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
