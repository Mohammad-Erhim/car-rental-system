import { Checkbox } from '@carrental/ui';

/**
 * A checkbox group for choosing a subset of codes (category / location scope, supported
 * categories, …). Empty selection is shown via `allLabel` — callers that treat "none = all"
 * and callers that treat "none = nothing" both use it, the copy just differs.
 */
export function ScopeGroup({
  label,
  options,
  selected,
  onToggle,
  allLabel,
  someLabel,
  disabled,
  testid,
}: {
  label: string;
  options: Array<{ code: string; name: string }>;
  selected: string[];
  onToggle: (code: string) => void;
  /** shown when nothing is selected */
  allLabel: string;
  /** shown when ≥1 is selected, given the count */
  someLabel: (n: number) => string;
  disabled?: boolean;
  testid: string;
}) {
  return (
    <fieldset className="sm:col-span-2">
      <legend className="text-sm font-medium">{label}</legend>
      <p className="mb-2 text-xs text-muted-foreground">
        {selected.length === 0 ? allLabel : someLabel(selected.length)}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1" data-testid={testid}>
        {options.map((o) => (
          <label key={o.code} className="flex items-center gap-1.5 text-sm">
            <Checkbox
              checked={selected.includes(o.code)}
              onChange={() => onToggle(o.code)}
              disabled={disabled}
            />
            {o.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
