import { useI18n } from '@carrental/i18n/react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@carrental/ui';
import { Search, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * STAGE-012 — operations command palette (design §4.2, "one keystroke to anywhere"). Opens on
 * ⌘K / Ctrl+K or the header button; lists the same permission-filtered nav destinations the
 * left rail shows, so it can never route a user somewhere they cannot open. Keyboard: ↑/↓ to
 * move, Enter to go, Esc to close (Radix Dialog owns Esc + the focus trap).
 */
export interface CommandItem {
  to: string;
  /** i18n key for the label */
  label: string;
  Icon: LucideIcon;
  /** i18n key for the group heading this item sits under, shown as a hint */
  groupKey?: string;
}

/** substring beats subsequence beats nothing; higher is better, `null` = no match */
function score(query: string, text: string): number | null {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx === 0) return 3;
  if (idx > 0) return 2;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i += 1) if (t[i] === q[qi]) qi += 1;
  return qi === q.length ? 1 : null;
}

export function CommandPalette({ items }: { items: CommandItem[] }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const scored = items
      .map((it) => ({ it, s: score(query, t(it.label)) }))
      .filter((r): r is { it: CommandItem; s: number } => r.s !== null);
    if (query.trim()) scored.sort((a, b) => b.s - a.s);
    return scored.map((r) => r.it);
  }, [items, query, t]);

  useEffect(() => {
    setActive((a) => (a > results.length - 1 ? 0 : a));
  }, [results.length]);

  function go(item: CommandItem | undefined) {
    if (!item) return;
    setOpen(false);
    navigate(item.to);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="cmdk-open"
        aria-keyshortcuts="Meta+K Control+K"
        className="hidden items-center gap-2 rounded-md border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground sm:inline-flex"
      >
        <Search className="size-3.5" aria-hidden="true" />
        <span>{t('ops.cmdk.open')}</span>
        <kbd className="rounded border bg-muted px-1 font-sans text-[10px]">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-testid="cmdk-dialog"
          className="max-w-lg gap-0 overflow-hidden p-0"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <DialogTitle className="sr-only">{t('ops.cmdk.open')}</DialogTitle>
          <DialogDescription className="sr-only">{t('ops.cmdk.hint')}</DialogDescription>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('ops.cmdk.placeholder')}
            aria-label={t('ops.cmdk.placeholder')}
            data-testid="cmdk-input"
            className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                go(results[active]);
              }
            }}
          />
          <ul className="max-h-72 overflow-y-auto p-2" data-testid="cmdk-results">
            {results.length === 0 ? (
              <li
                className="px-3 py-6 text-center text-sm text-muted-foreground"
                data-appstate="no-results"
              >
                {t('ops.cmdk.empty')}
              </li>
            ) : (
              results.map((it, i) => (
                <li key={it.to}>
                  <button
                    type="button"
                    onClick={() => go(it)}
                    onMouseMove={() => setActive(i)}
                    data-testid={`cmdk-item-${it.to}`}
                    data-active={i === active ? '' : undefined}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-start text-sm ${
                      i === active ? 'bg-primary/10 text-primary' : 'hover:bg-accent'
                    }`}
                  >
                    <it.Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1 truncate">{t(it.label)}</span>
                    {it.groupKey ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t(it.groupKey)}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
