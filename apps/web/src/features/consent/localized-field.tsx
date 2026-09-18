import type { Localized } from '@carrental/contracts';

import { localizedGet, localizedSet } from './consent-model';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * One text in one chosen language. The other languages are untouched; an emptied non-English
 * language falls back to English on the site, so its box shows the English text as a placeholder.
 */
export function LocalizedField({
  id,
  label,
  value,
  locale,
  onChange,
  multiline,
  max,
  disabled,
}: {
  id: string;
  label: string;
  value: Localized | undefined;
  locale: string;
  onChange: (next: Localized) => void;
  multiline?: boolean;
  max?: number;
  disabled?: boolean;
}) {
  const shared = {
    id,
    value: localizedGet(value, locale),
    maxLength: max,
    disabled,
    dir: 'auto' as const,
    placeholder: locale !== 'en' ? localizedGet(value, 'en') : '',
  };
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          {...shared}
          rows={3}
          onChange={(e) => onChange(localizedSet(value, locale, e.target.value))}
        />
      ) : (
        <Input
          {...shared}
          onChange={(e) => onChange(localizedSet(value, locale, e.target.value))}
        />
      )}
    </div>
  );
}
