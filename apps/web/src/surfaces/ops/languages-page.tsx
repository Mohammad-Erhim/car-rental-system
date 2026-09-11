import { useAuth, useFormErrors } from '@carrental/client/react';
import { SUPPORTED_LOCALE_CODES } from '@carrental/i18n';
import { useI18n } from '@carrental/i18n/react';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  ErrorSummary,
  Field,
  Input,
  PageHeader,
  Select,
  useToast,
} from '@carrental/ui';
import { Check, Globe, Star } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  useAdminLocales,
  useDeleteLocale,
  useLocaleAction,
  useTranslationCompleteness,
  useUpsertLocale,
} from '../../lib/api-hooks.js';
import { ApiError } from '../../lib/api.js';

/** Languages that are conventionally right-to-left — a mismatched direction is a footgun. */
const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'dv', 'yi', 'ckb', 'ug']);

/**
 * SCREEN-OPS — Languages (SRS-I18N-001, FR-GBL-002, DEC-024). Add / edit / order / activate a
 * locale and set the default; jump to the translation catalogue to fill it in. Adding a language
 * and publishing its strings needs no code change — the switcher and the runtime locale list are
 * driven by `GET /meta/locales`.
 */
const BCP47 = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

const emptyForm = () => ({
  code: '',
  nativeName: '',
  englishName: '',
  direction: 'ltr' as 'ltr' | 'rtl',
  sortOrder: '',
});

export function LanguagesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const canManage = useAuth().hasPermission('config.publish');

  const locales = useAdminLocales();
  const completeness = useTranslationCompleteness();
  const upsert = useUpsertLocale();
  const act = useLocaleAction();
  const del = useDeleteLocale();
  const errs = useFormErrors({
    code: t('ops.languages.code'),
    nativeName: t('ops.languages.nativeName'),
    englishName: t('ops.languages.englishName'),
    direction: t('ops.languages.direction'),
    sortOrder: t('ops.languages.order'),
  });

  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { code: string; action: 'deactivate' | 'default' }>(
    null,
  );
  const [deleting, setDeleting] = useState<string | null>(null);

  const editingDefault = !!editing && !!locales.data?.find((l) => l.code === editing)?.isDefault;
  const dirMismatch =
    RTL_LANGS.has(form.code.trim().toLowerCase().split('-')[0] ?? '') && form.direction === 'ltr';

  const coverage = (code: string): number | null => {
    const rows = (completeness.data?.rows ?? []).filter((r) => r.locale === code);
    if (!rows.length) return null;
    const total = rows.reduce((a, b) => a + b.total, 0);
    const published = rows.reduce((a, b) => a + b.published, 0);
    return total ? Math.round((published / total) * 100) : 100;
  };

  function resetForm() {
    setForm(emptyForm());
    setEditing(null);
    errs.clear();
  }

  function edit(l: NonNullable<typeof locales.data>[number]) {
    setEditing(l.code);
    setForm({
      code: l.code,
      nativeName: l.nativeName,
      englishName: l.englishName,
      direction: l.direction,
      sortOrder: String(l.sortOrder),
    });
    errs.clear();
  }

  function validate(): boolean {
    const local: Array<{ path: string; code: string }> = [];
    if (!form.code.trim()) local.push({ path: 'code', code: 'required' });
    else if (!BCP47.test(form.code.trim())) local.push({ path: 'code', code: 'invalid' });
    if (!form.nativeName.trim()) local.push({ path: 'nativeName', code: 'required' });
    if (!form.englishName.trim()) local.push({ path: 'englishName', code: 'required' });
    if (form.sortOrder.trim()) {
      const n = Number(form.sortOrder);
      if (!Number.isInteger(n) || n < 0 || n > 999) {
        local.push({ path: 'sortOrder', code: 'out_of_range' });
      }
    }
    if (local.length) {
      errs.setLocal(local);
      return false;
    }
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    errs.clear();
    if (!validate()) return;
    try {
      await upsert.mutateAsync({
        code: form.code.trim().toLowerCase(),
        nativeName: form.nativeName.trim(),
        englishName: form.englishName.trim(),
        direction: form.direction,
        sortOrder: form.sortOrder.trim() ? Number(form.sortOrder) : undefined,
      });
      toast({
        title: editing ? t('ops.languages.saved') : t('ops.languages.added', { code: form.code }),
        variant: 'success',
      });
      resetForm();
    } catch (err) {
      errs.fromError(err);
    }
  }

  async function doAct(code: string, action: 'activate' | 'deactivate' | 'default', force = false) {
    setPending(code);
    try {
      const res = await act.mutateAsync({ code, action, force });
      setConfirm(null);
      const key =
        action === 'activate'
          ? 'ops.languages.activated'
          : action === 'deactivate'
            ? 'ops.languages.deactivated'
            : 'ops.languages.defaulted';
      toast({
        title: t(key, {
          code,
          n: (res as { reassigned?: number }).reassigned ?? 0,
        }),
        variant: 'success',
      });
    } catch (err) {
      if (
        action === 'default' &&
        err instanceof ApiError &&
        err.problem.params?.reason === 'default_locale_untranslated'
      ) {
        // the confirm dialog already carries the warning — the user confirmed, retry with force
        return doAct(code, 'default', true);
      }
      toast({
        title: err instanceof ApiError ? err.message : t('ops.languages.actionFail'),
      });
      setConfirm(null);
    } finally {
      setPending(null);
    }
  }

  async function doDelete(code: string) {
    try {
      await del.mutateAsync(code);
      setDeleting(null);
      if (editing === code) resetForm();
      toast({ title: t('ops.languages.deleted', { code }), variant: 'success' });
    } catch (err) {
      toast({ title: err instanceof ApiError ? err.message : t('ops.languages.actionFail') });
      setDeleting(null);
    }
  }

  const confirmCoverage = confirm ? coverage(confirm.code) : null;

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.languages.title')} description={t('ops.languages.subtitle')} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.languages.active')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {locales.isLoading ? (
            <p className="text-sm text-muted-foreground">{t('ops.st.loading')}</p>
          ) : (
            (locales.data ?? []).map((l) => {
              const pct = coverage(l.code);
              return (
                <div
                  key={l.code}
                  className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm"
                  data-testid={`lang-row-${l.code}`}
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
                  ) : (
                    <span className="text-xs text-warning">{t('ops.languages.noStrings')}</span>
                  )}

                  <span className="ms-auto flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={`/config/translations?locale=${l.code}`}>
                        {t('ops.languages.edit')}
                      </Link>
                    </Button>
                    {canManage ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => edit(l)}>
                          {t('ops.languages.editDetails')}
                        </Button>
                        {!l.isDefault ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={pending === l.code}
                              disabled={!!pending}
                              onClick={() =>
                                l.isActive
                                  ? setConfirm({ code: l.code, action: 'deactivate' })
                                  : doAct(l.code, 'activate')
                              }
                            >
                              {l.isActive
                                ? t('ops.languages.deactivate')
                                : t('ops.languages.activate')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={pending === l.code}
                              disabled={!!pending}
                              onClick={() => setConfirm({ code: l.code, action: 'default' })}
                            >
                              {t('ops.languages.makeDefault')}
                            </Button>
                            {!l.isActive && !SUPPORTED_LOCALE_CODES.includes(l.code) ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                loading={del.isPending && deleting === l.code}
                                disabled={del.isPending}
                                onClick={() => setDeleting(l.code)}
                                data-testid={`lang-delete-${l.code}`}
                              >
                                {t('action.delete')}
                              </Button>
                            ) : null}
                          </>
                        ) : null}
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
            <CardTitle className="text-base">
              {editing ? t('ops.languages.editTitle', { code: editing }) : t('ops.languages.add')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ErrorSummary title={t('ops.languages.checkFields')} errors={errs.summary} />
            <form
              className="grid gap-x-4 gap-y-3 sm:grid-cols-5 sm:items-end"
              onSubmit={submit}
              noValidate
            >
              <Field
                label={t('ops.languages.code')}
                hint={t('ops.languages.codeHint')}
                required
                error={errs.fieldError('code')}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    placeholder="de"
                    value={form.code}
                    disabled={!!editing}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                )}
              </Field>
              <Field
                label={t('ops.languages.nativeName')}
                required
                error={errs.fieldError('nativeName')}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    placeholder="Deutsch"
                    value={form.nativeName}
                    onChange={(e) => setForm({ ...form, nativeName: e.target.value })}
                  />
                )}
              </Field>
              <Field
                label={t('ops.languages.englishName')}
                required
                error={errs.fieldError('englishName')}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    placeholder="German"
                    value={form.englishName}
                    onChange={(e) => setForm({ ...form, englishName: e.target.value })}
                  />
                )}
              </Field>
              <Field
                label={t('ops.languages.direction')}
                error={errs.fieldError('direction')}
                hint={
                  editingDefault
                    ? t('ops.languages.dirLocked')
                    : dirMismatch
                      ? t('ops.languages.dirMismatch')
                      : undefined
                }
              >
                {({ id }) => (
                  <Select
                    id={id}
                    value={form.direction}
                    disabled={editingDefault}
                    invalid={dirMismatch}
                    onChange={(e) =>
                      setForm({ ...form, direction: e.target.value as 'ltr' | 'rtl' })
                    }
                  >
                    <option value="ltr">{t('ops.languages.ltr')}</option>
                    <option value="rtl">{t('ops.languages.rtl')}</option>
                  </Select>
                )}
              </Field>
              <Field
                label={t('ops.languages.order')}
                hint={t('ops.languages.orderHint')}
                error={errs.fieldError('sortOrder')}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    invalid={invalid}
                    inputMode="numeric"
                    placeholder="99"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  />
                )}
              </Field>
              <div className="flex items-center gap-3 sm:col-span-5">
                <Button type="submit" loading={upsert.isPending}>
                  <Check className="size-4" aria-hidden="true" />
                  {editing ? t('ops.languages.save') : t('ops.languages.addAction')}
                </Button>
                {editing ? (
                  <Button type="button" variant="ghost" onClick={resetForm}>
                    {t('action.cancel')}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t('ops.languages.addHint')}
                  </span>
                )}
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
          <div className="space-y-2">
            <p>
              {confirm?.action === 'default'
                ? t('ops.languages.defaultBody')
                : t('ops.languages.deactivateBody')}
            </p>
            {confirm?.action === 'default' && (confirmCoverage == null || confirmCoverage < 100) ? (
              <Alert variant="warning">
                <AlertDescription>
                  {confirmCoverage == null
                    ? t('ops.languages.defaultUntranslated')
                    : t('ops.languages.defaultPartial', { pct: confirmCoverage })}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        }
        confirmLabel={
          confirm?.action === 'default'
            ? t('ops.languages.makeDefault')
            : t('ops.languages.deactivate')
        }
        confirmDisabled={!!pending}
        onConfirm={() =>
          confirm ? doAct(confirm.code, confirm.action, confirm.action === 'default') : undefined
        }
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        destructive
        title={t('ops.languages.deleteTitle', { code: deleting ?? '' })}
        description={t('ops.languages.deleteBody')}
        confirmLabel={t('action.delete')}
        confirmDisabled={del.isPending}
        onConfirm={() => (deleting ? doDelete(deleting) : undefined)}
      />
    </div>
  );
}
