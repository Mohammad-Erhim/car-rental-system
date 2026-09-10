import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Input,
  PageHeader,
} from '@carrental/ui';
import { Check, Globe, Star } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  useAdminLocales,
  useLocaleAction,
  useTranslationCompleteness,
  useUpsertLocale,
} from '../../lib/api-hooks.js';

/**
 * SCREEN-OPS — Languages (SRS-I18N-001, FR-GBL-002, DEC-024). Add / activate / order a locale;
 * set the default; jump to the translation catalogue to fill it in. Adding a language and
 * publishing its strings needs no code change.
 */
export function LanguagesPage() {
  const { t } = useI18n();
  const canManage = useAuth().hasPermission('config.publish');

  const locales = useAdminLocales();
  const completeness = useTranslationCompleteness();
  const upsert = useUpsertLocale();
  const act = useLocaleAction();
  const [confirm, setConfirm] = useState<null | { code: string; action: 'deactivate' | 'default' }>(
    null,
  );

  const doAct = (code: string, action: 'activate' | 'deactivate' | 'default') =>
    act.mutate({ code, action }, { onSettled: () => setConfirm(null) });

  const [form, setForm] = useState({
    code: '',
    nativeName: '',
    englishName: '',
    direction: 'ltr' as 'ltr' | 'rtl',
  });

  const coverage = (code: string) => {
    const rows = (completeness.data?.rows ?? []).filter((r) => r.locale === code);
    if (!rows.length) return null;
    const total = rows.reduce((a, b) => a + b.total, 0);
    const published = rows.reduce((a, b) => a + b.published, 0);
    return total ? Math.round((published / total) * 100) : 100;
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.languages.title')} description={t('ops.languages.subtitle')} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.languages.active')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {locales.isLoading ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : (
            (locales.data ?? []).map((l) => {
              const pct = coverage(l.code);
              return (
                <div
                  key={l.code}
                  className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm"
                >
                  <Globe className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span className="font-medium">
                    {l.nativeName}
                    <span className="ms-2 text-xs text-muted-foreground">{l.englishName}</span>
                  </span>
                  <code className="bidi-isolate rounded bg-muted px-1.5 py-0.5 text-xs">
                    {l.code}
                  </code>
                  <Badge variant="neutral">{l.direction.toUpperCase()}</Badge>
                  {l.isDefault ? (
                    <Badge variant="success">
                      <Star className="me-1 size-3" aria-hidden="true" />
                      {t('ops.languages.default')}
                    </Badge>
                  ) : null}
                  {l.isActive ? (
                    <Badge variant="success">{t('ops.languages.on')}</Badge>
                  ) : (
                    <Badge variant="neutral">{t('ops.languages.off')}</Badge>
                  )}
                  {pct != null ? (
                    <span
                      className={`text-xs ${pct === 100 ? 'text-success' : 'text-muted-foreground'}`}
                    >
                      {t('ops.languages.coverage', { pct })}
                    </span>
                  ) : null}

                  <span className="ms-auto flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={`/config/translations?locale=${l.code}`}>
                        {t('ops.languages.edit')}
                      </Link>
                    </Button>
                    {canManage && !l.isDefault ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={act.isPending}
                          onClick={() =>
                            l.isActive
                              ? setConfirm({ code: l.code, action: 'deactivate' })
                              : doAct(l.code, 'activate')
                          }
                        >
                          {l.isActive ? t('ops.languages.deactivate') : t('ops.languages.activate')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={act.isPending}
                          onClick={() => setConfirm({ code: l.code, action: 'default' })}
                        >
                          {t('ops.languages.makeDefault')}
                        </Button>
                      </>
                    ) : null}
                  </span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('ops.languages.add')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                upsert.mutate(form, {
                  onSuccess: () =>
                    setForm({ code: '', nativeName: '', englishName: '', direction: 'ltr' }),
                });
              }}
            >
              <label className="space-y-1 text-sm">
                <span className="font-medium text-muted-foreground">{t('ops.languages.code')}</span>
                <Input
                  required
                  placeholder="de"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-muted-foreground">
                  {t('ops.languages.nativeName')}
                </span>
                <Input
                  required
                  placeholder="Deutsch"
                  value={form.nativeName}
                  onChange={(e) => setForm({ ...form, nativeName: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-muted-foreground">
                  {t('ops.languages.englishName')}
                </span>
                <Input
                  required
                  placeholder="German"
                  value={form.englishName}
                  onChange={(e) => setForm({ ...form, englishName: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-muted-foreground">
                  {t('ops.languages.direction')}
                </span>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.direction}
                  onChange={(e) => setForm({ ...form, direction: e.target.value as 'ltr' | 'rtl' })}
                >
                  <option value="ltr">ltr</option>
                  <option value="rtl">rtl</option>
                </select>
              </label>
              <div className="sm:col-span-4">
                <Button type="submit" loading={upsert.isPending}>
                  <Check className="size-4" aria-hidden="true" />
                  {t('ops.languages.addAction')}
                </Button>
                <span className="ms-3 text-xs text-muted-foreground">
                  {t('ops.languages.addHint')}
                </span>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        destructive={confirm?.action === 'deactivate'}
        title={
          confirm?.action === 'default'
            ? t('ops.languages.defaultTitle', { code: confirm?.code ?? '' })
            : t('ops.languages.deactivateTitle', { code: confirm?.code ?? '' })
        }
        description={
          confirm?.action === 'default'
            ? t('ops.languages.defaultBody')
            : t('ops.languages.deactivateBody')
        }
        confirmLabel={
          confirm?.action === 'default'
            ? t('ops.languages.makeDefault')
            : t('ops.languages.deactivate')
        }
        onConfirm={() => (confirm ? doAct(confirm.code, confirm.action) : undefined)}
      />
    </div>
  );
}
