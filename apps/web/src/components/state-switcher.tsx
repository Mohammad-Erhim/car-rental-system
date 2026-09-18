import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface SwitcherOption {
  value: string;
  label: string;
}

/**
 * One choice out of a handful (a lifecycle state, a kind …). Tabs from `sm` up; on a phone a row
 * of tabs either clips or scrolls sideways, so it collapses into a select showing the current
 * choice. `variant="underline"` is the flat style used inside a card header.
 */
export function StateSwitcher({
  value,
  onChange,
  options,
  label,
  testIdPrefix,
  variant = 'pills',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SwitcherOption[];
  /** accessible name for the group */
  label: string;
  testIdPrefix?: string;
  variant?: 'pills' | 'underline';
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label={label}
          className="h-11 sm:hidden"
          data-testid={testIdPrefix ? `${testIdPrefix}-select` : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Tabs value={value} onValueChange={onChange} className="hidden sm:block">
        <TabsList
          aria-label={label}
          className={cn(
            'h-auto max-w-full justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            variant === 'underline' && 'w-full gap-1 bg-transparent p-0',
          )}
        >
          {options.map((o) => (
            <TabsTrigger
              key={o.value}
              value={o.value}
              data-testid={testIdPrefix ? `${testIdPrefix}-${o.value}` : undefined}
              className={cn(
                variant === 'underline' &&
                  'rounded-none border-b-2 border-transparent px-3 py-3 text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none',
              )}
            >
              {o.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
