import type { ActorSelector } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ChoiceTabs } from '@/components/choice-tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { WorkflowOptions } from '@/lib/workflow-hooks';

type Kind = 'role' | 'user' | 'group' | 'dynamic';

const same = (a: ActorSelector, b: ActorSelector) => JSON.stringify(a) === JSON.stringify(b);

/** A name for any selector — used for the chips here and the step cards. */
export function useSelectorNames(options: WorkflowOptions | undefined) {
  const { t } = useI18n();
  return useMemo(
    () => ({
      role: (code: string) => options?.roles.find((r) => r.code === code)?.name ?? code,
      user: (id: string) =>
        options?.people.find((p) => p.staffProfileId === id)?.name ?? t('ops.wfb.unknownPerson'),
      group: (id: string) =>
        options?.groups.find((g) => g.id === id)?.name ?? t('ops.wfb.unknownTeam'),
      dynamic: (s: string) => t(`ops.wfb.dynamic.${s}`),
    }),
    [options, t],
  );
}

/**
 * Who is asked: any mix of roles, named people, teams, and "the requester" / "whoever created the
 * record". Chosen from tabs and toggle lists — never a dropdown — with a filter for long lists.
 * A role or team is resolved live, so someone who gains the role later is asked too.
 */
export function ActorsEditor({
  value,
  onChange,
  options,
  label,
  allowDynamic = true,
}: {
  value: ActorSelector[];
  onChange: (next: ActorSelector[]) => void;
  options: WorkflowOptions | undefined;
  label: string;
  allowDynamic?: boolean;
}) {
  const { t } = useI18n();
  const names = useSelectorNames(options);
  const [kind, setKind] = useState<Kind>('role');
  const [q, setQ] = useState('');
  const has = (s: ActorSelector) => value.some((v) => same(v, s));
  const toggle = (s: ActorSelector) =>
    onChange(has(s) ? value.filter((v) => !same(v, s)) : [...value, s]);
  const nameOf = (s: ActorSelector) =>
    s.kind === 'role'
      ? names.role(s.roleCode)
      : s.kind === 'user'
        ? names.user(s.staffProfileId)
        : s.kind === 'group'
          ? names.group(s.groupId)
          : names.dynamic(s.source);

  const kinds: Kind[] = allowDynamic
    ? ['role', 'user', 'group', 'dynamic']
    : ['role', 'user', 'group'];
  const needle = q.trim().toLowerCase();
  const rows: Array<{ sel: ActorSelector; text: string; hint?: string }> =
    kind === 'role'
      ? (options?.roles ?? []).map((r) => ({
          sel: { kind: 'role', roleCode: r.code },
          text: r.name,
          hint: r.code,
        }))
      : kind === 'user'
        ? (options?.people ?? []).map((p) => ({
            sel: { kind: 'user', staffProfileId: p.staffProfileId },
            text: p.name,
            hint: p.email,
          }))
        : kind === 'group'
          ? (options?.groups ?? []).map((g) => ({
              sel: { kind: 'group', groupId: g.id },
              text: g.name,
              hint: g.code,
            }))
          : (['initiator', 'subject_owner'] as const).map((s) => ({
              sel: { kind: 'dynamic', source: s } as ActorSelector,
              text: t(`ops.wfb.dynamic.${s}`),
              hint: t(`ops.wfb.dynamic.${s}Hint`),
            }));
  const shown = needle
    ? rows.filter((r) => `${r.text} ${r.hint ?? ''}`.toLowerCase().includes(needle))
    : rows;

  return (
    <fieldset className="space-y-3" data-testid="actors-editor">
      <legend className="text-sm font-medium">{label}</legend>
      <ul className="flex min-h-8 flex-wrap gap-1.5" aria-label={t('ops.wfb.chosen')}>
        {value.length ? (
          value.map((s, i) => (
            <li key={`${i}-${JSON.stringify(s)}`}>
              <Badge variant="secondary" className="gap-1 ps-2.5 pe-1">
                <span className="text-[10px] uppercase text-muted-foreground">
                  {t(`ops.wfb.kind.${s.kind}`)}
                </span>
                {nameOf(s)}
                <button
                  type="button"
                  className="grid size-5 place-items-center rounded-full hover:bg-background"
                  aria-label={t('ops.wfb.remove', { name: nameOf(s) })}
                  onClick={() => toggle(s)}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))
        ) : (
          <li className="text-sm text-destructive">{t('ops.wfb.nobody')}</li>
        )}
      </ul>
      <ChoiceTabs
        value={kind}
        onChange={(v) => {
          setKind(v as Kind);
          setQ('');
        }}
        label={t('ops.wfb.addFrom')}
        testIdPrefix="actors-kind"
        options={kinds.map((k) => ({ value: k, label: t(`ops.wfb.kindTab.${k}`) }))}
      />
      {kind === 'user' || kind === 'group' || rows.length > 8 ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('ops.wfb.filter')}
            aria-label={t('ops.wfb.filter')}
            className="ps-9"
          />
        </div>
      ) : null}
      <ul
        className="grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2"
        aria-label={t(`ops.wfb.kindTab.${kind}`)}
      >
        {shown.map((r) => {
          const on = has(r.sel);
          return (
            <li key={JSON.stringify(r.sel)}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(r.sel)}
                data-testid={`actor-${r.sel.kind}-${r.sel.kind === 'role' ? r.sel.roleCode : r.hint}`}
                className={cn(
                  'w-full rounded-lg border p-2.5 text-start text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on && 'border-primary bg-primary/5 ring-1 ring-primary',
                )}
              >
                <span className="block font-medium">{r.text}</span>
                {r.hint ? (
                  <span className="block truncate text-xs text-muted-foreground">{r.hint}</span>
                ) : null}
              </button>
            </li>
          );
        })}
        {!shown.length ? (
          <li className="text-sm text-muted-foreground">{t('ops.wfb.noMatches')}</li>
        ) : null}
      </ul>
    </fieldset>
  );
}
