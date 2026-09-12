import { useAuth, useFormErrors } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  Alert,
  AlertDescription,
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  ErrorSummary,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from '@carrental/ui';
import { useEffect, useRef, useState } from 'react';

import { ScopeGroup } from '../../components/scope-group.js';
import {
  useAddHoursException,
  useLocationStatus,
  useOpsLocation,
  useOpsLocationImpact,
  useOpsLocations,
  useRemoveHoursException,
  useUpsertLocation,
  type HoursSlot,
} from '../../lib/admin-hooks.js';
import { ApiError } from '../../lib/api.js';
import { useOpsCategories } from '../../lib/ops-discovery-hooks.js';

/** IANA zones the browser knows; falls back to a small list on older engines. */
const TIME_ZONES: string[] = (() => {
  try {
    const sv = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.('timeZone');
    if (sv?.length) return sv;
  } catch {
    /* ignore */
  }
  return [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Asia/Dubai',
  ];
})();

/**
 * SCREEN-OPS-028 / FR-ADM-007 — location & operating-hours administration. Edit the fields
 * discovery consumes (weekly hours, after-hours, instructions, supported categories, turnaround),
 * add holiday/closure exceptions, and archive (never delete) a location — with a
 * future-reservation impact check. One-way-route pricing and localized public content are
 * documented follow-ups.
 */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const emptyHours = (): HoursSlot[] =>
  Array.from({ length: 7 }, (_, day) => ({ day, closed: true }) as HoursSlot);

const emptyForm = () => ({
  name: '',
  timezone: 'America/New_York',
  afterHoursReturn: false,
  turnaroundMinutes: '60',
  pickupInstructions: '',
  returnInstructions: '',
  supportedCategoryCodes: [] as string[],
  addressLine1: '',
  city: '',
  region: '',
  postalCode: '',
  country: '',
  phone: '',
  email: '',
  latitude: '',
  longitude: '',
  regularHours: emptyHours(),
});

export function LocationsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');

  const list = useOpsLocations();
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    if (!sel && list.data && list.data.length > 0) setSel(list.data[0]!.code);
  }, [list.data, sel]);

  const detail = useOpsLocation(sel);
  const impact = useOpsLocationImpact(sel);
  const upsert = useUpsertLocation();
  const status = useLocationStatus();
  const addEx = useAddHoursException();
  const removeEx = useRemoveHoursException();
  const cats = useOpsCategories();

  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState<{ code: string } | null>(null);
  const [ex, setEx] = useState({
    date: '',
    reason: '',
    closed: true,
    open: '09:00',
    close: '13:00',
  });
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const syncedFor = useRef<string | null>(null);
  const errs = useFormErrors({
    name: t('ops.loc.name'),
    timezone: t('ops.loc.timezone'),
    turnaroundMinutes: t('ops.loc.turnaround'),
    supportedCategoryCodes: t('ops.loc.categories'),
    latitude: t('ops.loc.latitude'),
    longitude: t('ops.loc.longitude'),
  });
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const d = detail.data;
    if (d && syncedFor.current !== d.code) {
      syncedFor.current = d.code;
      const addr = (d.address ?? {}) as Record<string, string | undefined>;
      const con = (d.contact ?? {}) as Record<string, string | undefined>;
      setForm({
        name: d.name,
        timezone: d.timezone,
        afterHoursReturn: d.afterHoursReturn,
        turnaroundMinutes: String(d.turnaroundMinutes),
        pickupInstructions: d.pickupInstructions ?? '',
        returnInstructions: d.returnInstructions ?? '',
        supportedCategoryCodes: [...d.supportedCategoryCodes],
        addressLine1: addr.line1 ?? '',
        city: addr.city ?? '',
        region: addr.region ?? '',
        postalCode: addr.postalCode ?? '',
        country: addr.country ?? '',
        phone: con.phone ?? '',
        email: con.email ?? '',
        latitude: d.latitude ?? '',
        longitude: d.longitude ?? '',
        regularHours: mergeHours(d.regularHours),
      });
      setSaveError(null);
      errs.clear();
    }
  }, [detail.data]);

  const archived = detail.data?.status === 'archived';
  const readOnly = !canPublish || (archived && !creating);
  const impactTotal = (impact.data?.futureReservations ?? 0) + (impact.data?.openRentals ?? 0);

  function setSlot(day: number, patch: Partial<HoursSlot>) {
    setForm((f) => ({
      ...f,
      regularHours: f.regularHours.map((s) => (s.day === day ? { ...s, ...patch } : s)),
    }));
  }

  function validate(): boolean {
    const local: Array<{ path: string; code: string }> = [];
    if (!form.name.trim()) local.push({ path: 'name', code: 'required' });
    if (!form.timezone.trim()) local.push({ path: 'timezone', code: 'required' });
    const ta = form.turnaroundMinutes.trim();
    const taN = Number(ta);
    if (ta === '' || !Number.isInteger(taN) || taN < 0 || taN > 1440) {
      local.push({ path: 'turnaroundMinutes', code: 'out_of_range' });
    }
    for (const [coord, limit] of [
      ['latitude', 90],
      ['longitude', 180],
    ] as const) {
      const v = form[coord].trim();
      if (v && (!Number.isFinite(Number(v)) || Math.abs(Number(v)) > limit)) {
        local.push({ path: coord, code: 'out_of_range' });
      }
    }
    if (local.length) {
      errs.setLocal(local);
      return false;
    }
    return true;
  }

  async function save() {
    if (!sel && !creating) return;
    setSaveError(null);
    errs.clear();
    if (!validate()) return;
    const code = creating?.code ?? sel!;
    const address = clean({
      line1: form.addressLine1,
      city: form.city,
      region: form.region,
      postalCode: form.postalCode,
      country: form.country,
    });
    const contact = clean({ phone: form.phone, email: form.email });
    try {
      await upsert.mutateAsync({
        code,
        name: form.name.trim(),
        timezone: form.timezone.trim(),
        afterHoursReturn: form.afterHoursReturn,
        turnaroundMinutes: Number(form.turnaroundMinutes.trim()),
        pickupInstructions: form.pickupInstructions.trim() || null,
        returnInstructions: form.returnInstructions.trim() || null,
        supportedCategoryCodes: form.supportedCategoryCodes,
        address,
        contact,
        latitude: form.latitude.trim() || null,
        longitude: form.longitude.trim() || null,
        regularHours: form.regularHours.map((s) =>
          s.closed ? { day: s.day, closed: true } : { day: s.day, open: s.open, close: s.close },
        ),
      });
      toast({
        title: creating ? t('ops.loc.savedNew') : t('ops.loc.saved'),
        variant: 'success',
      });
      if (creating) {
        setSel(creating.code);
        setCreating(null);
      }
    } catch (e) {
      if (e instanceof ApiError) {
        errs.fromError(e);
        if (!e.fieldErrors.length) setSaveError(e.message);
      } else {
        setSaveError(e instanceof Error ? e.message : t('ops.loc.saveFail'));
      }
    }
  }

  const statusFeedback = {
    onSuccess: (_d: unknown, v: { action: 'archive' | 'restore' }) =>
      toast({
        title:
          v.action === 'archive'
            ? t('ops.loc.archived', { name: detail.data?.name ?? '' })
            : t('ops.loc.restored', { name: detail.data?.name ?? '' }),
        variant: 'success',
      }),
    onError: (e: unknown) =>
      toast({ title: e instanceof Error ? e.message : t('ops.loc.statusFail') }),
  };

  if (list.isLoading) return <AppStateView kind="loading" title={t('state.loading.title')} />;
  if (list.isError || !list.data)
    return (
      <AppStateView
        kind="failure"
        title={t('state.failure.title')}
        description={t('ops.loc.loadFail')}
        primaryAction={{ label: t('action.retry'), onClick: () => list.refetch() }}
      />
    );

  const d = detail.data;

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.loc.title')} description={t('ops.loc.subtitle')} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,16rem)_1fr]">
        <Card className="h-max">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('ops.loc.list')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {list.data.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => {
                  setCreating(null);
                  setSel(l.code);
                }}
                data-testid={`loc-item-${l.code}`}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-sm ${
                  sel === l.code && !creating ? 'bg-primary/10 text-primary' : 'hover:bg-accent'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{l.name}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{l.code}</span>
                </span>
                <Badge variant={l.status === 'active' ? 'success' : 'neutral'}>
                  {t(`ops.loc.status.${l.status}`)}
                </Badge>
              </button>
            ))}
            {canPublish ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => {
                  setCreating({ code: '' });
                  setSel(null);
                  syncedFor.current = null;
                  setForm(emptyForm());
                  errs.clear();
                  setSaveError(null);
                }}
                data-testid="loc-new"
              >
                {t('ops.loc.new')}
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {creating ? t('ops.loc.newTitle') : (d?.name ?? t('ops.loc.pick'))}
            </CardTitle>
            {d && !creating ? (
              <p className="text-xs text-muted-foreground">
                {t('ops.loc.futureImpact', {
                  n: (impact.data?.futureReservations ?? 0) + (impact.data?.openRentals ?? 0),
                })}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-5">
            {!creating && (detail.isLoading || !d) ? (
              <AppStateView kind="loading" title={t('state.loading.title')} inline />
            ) : (
              <>
                {archived && !creating ? (
                  <Alert variant="warning">
                    <AlertDescription>{t('ops.loc.archivedBanner')}</AlertDescription>
                  </Alert>
                ) : null}
                <ErrorSummary title={t('ops.loc.checkFields')} errors={errs.summary} />
                <div className="grid gap-4 sm:grid-cols-2">
                  {creating ? (
                    <Field
                      label={t('ops.loc.code')}
                      required
                      hint={t('ops.loc.codeHint')}
                      error={
                        creating.code && !/^[A-Z0-9]{2,20}$/.test(creating.code)
                          ? t('ops.loc.codeInvalid')
                          : undefined
                      }
                    >
                      {({ id }) => (
                        <Input
                          id={id}
                          value={creating.code}
                          onChange={(e) =>
                            setCreating({ code: e.target.value.toUpperCase().replace(/\s/g, '') })
                          }
                          maxLength={20}
                          data-testid="loc-new-code"
                        />
                      )}
                    </Field>
                  ) : null}
                  <Field label={t('ops.loc.name')} required error={errs.fieldError('name')}>
                    {({ id, invalid }) => (
                      <Input
                        id={id}
                        invalid={invalid}
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        disabled={readOnly}
                        data-testid="loc-name"
                      />
                    )}
                  </Field>
                  <Field
                    label={t('ops.loc.timezone')}
                    hint={t('ops.loc.timezoneHint')}
                    required
                    error={errs.fieldError('timezone')}
                  >
                    {({ id, invalid }) => (
                      <Select
                        id={id}
                        invalid={invalid}
                        value={form.timezone}
                        onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                        disabled={readOnly}
                        data-testid="loc-timezone"
                      >
                        {!TIME_ZONES.includes(form.timezone) && form.timezone ? (
                          <option value={form.timezone}>{form.timezone}</option>
                        ) : null}
                        {TIME_ZONES.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field
                    label={t('ops.loc.turnaround')}
                    hint={t('ops.loc.turnaroundHint')}
                    error={errs.fieldError('turnaroundMinutes')}
                  >
                    {({ id, invalid }) => (
                      <Input
                        id={id}
                        invalid={invalid}
                        inputMode="numeric"
                        value={form.turnaroundMinutes}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, turnaroundMinutes: e.target.value }))
                        }
                        disabled={readOnly}
                      />
                    )}
                  </Field>
                  <label className="flex items-center gap-2 self-end text-sm">
                    <Checkbox
                      checked={form.afterHoursReturn}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, afterHoursReturn: e.target.checked }))
                      }
                      disabled={readOnly}
                      data-testid="loc-afterhours"
                    />
                    {t('ops.loc.afterHours')}
                  </label>
                </div>

                <ScopeGroup
                  label={t('ops.loc.categories')}
                  options={(cats.data ?? []).map((c) => ({ code: c.code, name: c.displayName }))}
                  selected={form.supportedCategoryCodes}
                  onToggle={(code) =>
                    setForm((f) => ({
                      ...f,
                      supportedCategoryCodes: f.supportedCategoryCodes.includes(code)
                        ? f.supportedCategoryCodes.filter((x) => x !== code)
                        : [...f.supportedCategoryCodes, code],
                    }))
                  }
                  allLabel={t('ops.loc.categoriesNone')}
                  someLabel={(n) => t('ops.loc.categoriesSome', { n })}
                  disabled={readOnly}
                  testid="loc-categories"
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('ops.loc.addressLine1')}>
                    {({ id }) => (
                      <Input
                        id={id}
                        value={form.addressLine1}
                        onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
                        disabled={readOnly}
                      />
                    )}
                  </Field>
                  <Field label={t('ops.loc.city')}>
                    {({ id }) => (
                      <Input
                        id={id}
                        value={form.city}
                        onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                        disabled={readOnly}
                      />
                    )}
                  </Field>
                  <Field label={t('ops.loc.region')}>
                    {({ id }) => (
                      <Input
                        id={id}
                        value={form.region}
                        onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                        disabled={readOnly}
                      />
                    )}
                  </Field>
                  <Field label={t('ops.loc.postalCode')}>
                    {({ id }) => (
                      <Input
                        id={id}
                        value={form.postalCode}
                        onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                        disabled={readOnly}
                      />
                    )}
                  </Field>
                  <Field label={t('ops.loc.country')}>
                    {({ id }) => (
                      <Input
                        id={id}
                        value={form.country}
                        onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                        disabled={readOnly}
                      />
                    )}
                  </Field>
                  <Field label={t('ops.loc.phone')}>
                    {({ id }) => (
                      <Input
                        id={id}
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        disabled={readOnly}
                      />
                    )}
                  </Field>
                  <Field label={t('ops.loc.email')}>
                    {({ id }) => (
                      <Input
                        id={id}
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        disabled={readOnly}
                      />
                    )}
                  </Field>
                  <Field
                    label={t('ops.loc.latitude')}
                    hint={t('ops.loc.coordsHint')}
                    error={errs.fieldError('latitude')}
                  >
                    {({ id, invalid }) => (
                      <Input
                        id={id}
                        invalid={invalid}
                        inputMode="decimal"
                        value={form.latitude}
                        onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                        disabled={readOnly}
                      />
                    )}
                  </Field>
                  <Field label={t('ops.loc.longitude')} error={errs.fieldError('longitude')}>
                    {({ id, invalid }) => (
                      <Input
                        id={id}
                        invalid={invalid}
                        inputMode="decimal"
                        value={form.longitude}
                        onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                        disabled={readOnly}
                      />
                    )}
                  </Field>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">{t('ops.loc.weeklyHours')}</p>
                  <div className="space-y-1" data-testid="loc-hours">
                    {form.regularHours.map((s) => (
                      <div key={s.day} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="w-10 text-muted-foreground">{DAYS[s.day]}</span>
                        <label className="flex items-center gap-1">
                          <Checkbox
                            checked={!s.closed}
                            onChange={(e) =>
                              setSlot(s.day, {
                                closed: !e.target.checked,
                                open: s.open ?? '09:00',
                                close: s.close ?? '17:00',
                              })
                            }
                            disabled={readOnly}
                          />
                          {t('ops.loc.open')}
                        </label>
                        <Input
                          className="h-8 w-28"
                          type="time"
                          value={s.open ?? ''}
                          onChange={(e) => setSlot(s.day, { open: e.target.value })}
                          disabled={readOnly || s.closed}
                          aria-label={`${DAYS[s.day]} ${t('ops.loc.open')}`}
                        />
                        <span>–</span>
                        <Input
                          className="h-8 w-28"
                          type="time"
                          value={s.close ?? ''}
                          onChange={(e) => setSlot(s.day, { close: e.target.value })}
                          disabled={readOnly || s.closed}
                          aria-label={`${DAYS[s.day]} ${t('ops.loc.close')}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('ops.loc.pickupInstructions')}>
                    {({ id }) => (
                      <Textarea
                        id={id}
                        rows={3}
                        value={form.pickupInstructions}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, pickupInstructions: e.target.value }))
                        }
                        disabled={readOnly}
                      />
                    )}
                  </Field>
                  <Field label={t('ops.loc.returnInstructions')}>
                    {({ id }) => (
                      <Textarea
                        id={id}
                        rows={3}
                        value={form.returnInstructions}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, returnInstructions: e.target.value }))
                        }
                        disabled={readOnly}
                      />
                    )}
                  </Field>
                </div>

                {saveError ? (
                  <p className="text-sm text-destructive" data-testid="loc-save-error">
                    {saveError}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={save}
                    loading={upsert.isPending}
                    disabled={
                      readOnly ||
                      upsert.isPending ||
                      (!!creating && !/^[A-Z0-9]{2,20}$/.test(creating.code)) ||
                      (!!creating && !form.name.trim())
                    }
                    data-testid="loc-save"
                  >
                    {creating ? t('ops.loc.create') : t('ops.loc.save')}
                  </Button>
                  {d && !creating && d.status !== 'archived' ? (
                    <Button
                      variant="outline"
                      disabled={!canPublish}
                      onClick={() => setArchiveOpen(true)}
                      data-testid="loc-archive"
                    >
                      {t('ops.loc.archive')}
                    </Button>
                  ) : null}
                  {d && !creating && d.status === 'archived' ? (
                    <Button
                      variant="outline"
                      disabled={!canPublish || status.isPending}
                      onClick={() =>
                        status.mutate({ code: d.code, action: 'restore' }, statusFeedback)
                      }
                    >
                      {t('ops.loc.restore')}
                    </Button>
                  ) : null}
                </div>

                {d && !creating ? (
                  <div className="border-t pt-4">
                    <p className="mb-2 text-sm font-medium">{t('ops.loc.exceptions')}</p>
                    <ul className="mb-3 space-y-1 text-sm" data-testid="loc-exceptions">
                      {d.hoursExceptions.length === 0 ? (
                        <li className="text-muted-foreground">{t('ops.loc.noExceptions')}</li>
                      ) : (
                        d.hoursExceptions.map((x) => (
                          <li key={x.id} className="flex items-center gap-2">
                            <span className="font-mono text-xs">{x.date}</span>
                            <span>
                              {x.closed ? t('ops.loc.closed') : `${x.open ?? ''}–${x.close ?? ''}`}
                            </span>
                            {x.reason ? (
                              <span className="text-muted-foreground">· {x.reason}</span>
                            ) : null}
                            {canPublish ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  removeEx.mutate(
                                    { code: d.code, id: x.id },
                                    {
                                      onError: (e) =>
                                        toast({
                                          title:
                                            e instanceof Error
                                              ? e.message
                                              : t('ops.loc.exSaveFail'),
                                        }),
                                    },
                                  )
                                }
                              >
                                {t('action.remove')}
                              </Button>
                            ) : null}
                          </li>
                        ))
                      )}
                    </ul>
                    {canPublish ? (
                      <form
                        className="flex flex-wrap items-end gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!ex.date) {
                            toast({ title: t('ops.loc.exDateRequired') });
                            return;
                          }
                          if (!ex.closed && ex.open >= ex.close) {
                            toast({ title: t('ops.loc.exInverted') });
                            return;
                          }
                          addEx.mutate(
                            {
                              code: d.code,
                              date: ex.date,
                              closed: ex.closed,
                              open: ex.closed ? null : ex.open,
                              close: ex.closed ? null : ex.close,
                              reason: ex.reason || undefined,
                            },
                            {
                              onSuccess: () =>
                                setEx({
                                  date: '',
                                  reason: '',
                                  closed: true,
                                  open: '09:00',
                                  close: '13:00',
                                }),
                              onError: (err) =>
                                toast({
                                  title:
                                    err instanceof ApiError
                                      ? err.message
                                      : err instanceof Error
                                        ? err.message
                                        : t('ops.loc.exSaveFail'),
                                }),
                            },
                          );
                        }}
                      >
                        <Field label={t('ops.loc.exceptionDate')} required>
                          {({ id }) => (
                            <Input
                              id={id}
                              type="date"
                              min={today}
                              value={ex.date}
                              onChange={(e) => setEx((s) => ({ ...s, date: e.target.value }))}
                              data-testid="loc-ex-date"
                            />
                          )}
                        </Field>
                        <Field label={t('ops.loc.exceptionKind')}>
                          {({ id }) => (
                            <Select
                              id={id}
                              value={ex.closed ? 'closed' : 'open'}
                              onChange={(e) =>
                                setEx((s) => ({ ...s, closed: e.target.value === 'closed' }))
                              }
                              data-testid="loc-ex-kind"
                            >
                              <option value="closed">{t('ops.loc.exClosed')}</option>
                              <option value="open">{t('ops.loc.exReduced')}</option>
                            </Select>
                          )}
                        </Field>
                        {!ex.closed ? (
                          <>
                            <Field label={t('ops.loc.open')}>
                              {({ id }) => (
                                <Input
                                  id={id}
                                  type="time"
                                  className="w-28"
                                  value={ex.open}
                                  onChange={(e) => setEx((s) => ({ ...s, open: e.target.value }))}
                                />
                              )}
                            </Field>
                            <Field label={t('ops.loc.close')}>
                              {({ id }) => (
                                <Input
                                  id={id}
                                  type="time"
                                  className="w-28"
                                  value={ex.close}
                                  onChange={(e) => setEx((s) => ({ ...s, close: e.target.value }))}
                                />
                              )}
                            </Field>
                          </>
                        ) : null}
                        <Field label={t('ops.loc.exceptionReason')}>
                          {({ id }) => (
                            <Input
                              id={id}
                              value={ex.reason}
                              onChange={(e) => setEx((s) => ({ ...s, reason: e.target.value }))}
                            />
                          )}
                        </Field>
                        <Button
                          type="submit"
                          size="sm"
                          loading={addEx.isPending}
                          data-testid="loc-ex-add"
                        >
                          {t('ops.loc.addException')}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={t('ops.loc.archiveQ')}
        description={
          impactTotal > 0
            ? t('ops.loc.archiveImpact', { n: impactTotal })
            : t('ops.loc.archiveBody')
        }
        confirmLabel={t('ops.loc.archive')}
        destructive
        onConfirm={() => {
          if (d)
            status.mutate(
              { code: d.code, action: 'archive', force: impactTotal > 0 },
              statusFeedback,
            );
        }}
      />
    </div>
  );
}

/** Drop blank values so an untouched address/contact isn't persisted as a bag of empty strings. */
function clean(o: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(o)
      .map(([k, v]) => [k, v.trim()])
      .filter(([, v]) => v !== ''),
  );
}

function mergeHours(saved: HoursSlot[]): HoursSlot[] {
  return Array.from({ length: 7 }, (_, day) => {
    const s = saved.find((x) => x.day === day);
    return s
      ? { day, open: s.open, close: s.close, closed: s.closed ?? false }
      : { day, closed: true };
  });
}
