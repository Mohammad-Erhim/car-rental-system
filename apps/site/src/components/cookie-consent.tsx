'use client';

import { pickText, type ConsentCategory, type ConsentChoices } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@carrental/ui';
import { Cookie } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { useConsent } from '../lib/consent';

function Switch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'bg-brand' : 'bg-hairline'
      }`}
    >
      <span
        className={`inline-block size-5 rounded-full bg-surface shadow transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export function CookieConsent({ locale }: { locale: string }) {
  const { t } = useI18n();
  const {
    bannerOpen,
    prefsOpen,
    choices,
    config,
    openPreferences,
    closePreferences,
    acceptAll,
    rejectAll,
    savePreferences,
  } = useConsent();

  const [mounted, setMounted] = useState(false);

  const categories = useMemo(
    () => config.categories.filter((c) => c.id === 'necessary' || c.shown),
    [config.categories],
  );
  const seedDraft = (): ConsentChoices => {
    const next: ConsentChoices = { ...choices, necessary: true };
    if (!choices.functional && !choices.analytics && !choices.marketing) {
      for (const c of config.categories) {
        if (c.id !== 'necessary') next[c.id] = c.defaultOn;
      }
    }
    return next;
  };
  const [draft, setDraft] = useState<ConsentChoices>(seedDraft);

  const isPreview =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('preview');

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (prefsOpen) setDraft(seedDraft());
  }, [prefsOpen]);

  if (!mounted || isPreview || (!bannerOpen && !prefsOpen)) return null;

  const policyLinks = (
    <>
      <Link
        href={`/${locale}/legal/cookies`}
        className="underline underline-offset-2 hover:text-brand"
      >
        {t('site.cookie.cookiePolicy')}
      </Link>
      <span aria-hidden> · </span>
      <Link
        href={`/${locale}/legal/privacy`}
        className="underline underline-offset-2 hover:text-brand"
      >
        {t('site.cookie.privacyPolicy')}
      </Link>
    </>
  );

  const isCard = config.layout.position === 'card';

  return (
    <>
      {bannerOpen ? (
        <div
          role="dialog"
          aria-label={pickText(config.text.bannerTitle, locale) || t('site.cookie.title')}
          className={
            isCard
              ? 'fixed bottom-4 right-4 left-4 z-[60] max-w-md rounded-2xl border border-hairline bg-surface/95 p-4 shadow-card backdrop-blur sm:left-auto'
              : 'fixed inset-x-0 bottom-0 z-[60] border-t border-hairline bg-surface/95 shadow-card backdrop-blur'
          }
        >
          <div
            className={
              isCard
                ? 'flex flex-col gap-3'
                : 'mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:gap-6 lg:px-8'
            }
          >
            <div className="flex items-start gap-3">
              <Cookie className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
              <p className="text-sm text-ink-muted">
                {pickText(config.text.bannerBody, locale)} {policyLinks}
              </p>
            </div>
            <div className={`flex flex-wrap gap-2 ${isCard ? '' : 'lg:ms-auto lg:shrink-0'}`}>
              <Button variant="outline" size="sm" onClick={() => openPreferences()}>
                {t('site.cookie.managePreferences')}
              </Button>
              {config.layout.showRejectAll ? (
                <Button variant="outline" size="sm" onClick={rejectAll}>
                  {t('site.cookie.rejectAll')}
                </Button>
              ) : null}
              <Button size="sm" onClick={acceptAll}>
                {t('site.cookie.acceptAll')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Every other modal in both apps uses @carrental/ui's Radix-based Dialog, which traps
          focus automatically (Tab can't walk out into the page behind the overlay) — this used
          to be a hand-built <div role="dialog"> with a manual Escape handler and no focus trap. */}
      <Dialog open={prefsOpen} onOpenChange={(open) => !open && closePreferences()}>
        <DialogContent
          data-testid="cookie-prefs-dialog"
          className={
            'start-0 end-0 top-auto bottom-0 max-h-[92vh] w-full max-w-none translate-x-0 ' +
            'translate-y-0 gap-4 overflow-y-auto rounded-b-none rounded-t-2xl p-5 ' +
            'sm:start-1/2 sm:end-auto sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-x-1/2 ' +
            'sm:-translate-y-1/2 sm:rounded-2xl sm:p-6'
          }
        >
          <DialogHeader>
            <DialogTitle>{t('site.cookie.prefsTitle')}</DialogTitle>
            <DialogDescription>
              {pickText(config.text.prefsIntro, locale)} {policyLinks}
            </DialogDescription>
          </DialogHeader>

          <div className="divide-y divide-hairline border-y border-hairline">
            {categories.map((c: { id: ConsentCategory }) => {
              const full = config.categories.find((x) => x.id === c.id)!;
              const locked = c.id === 'necessary';
              return (
                <div key={c.id} className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {pickText(full.name, locale)}
                      {locked ? (
                        <span className="ms-2 text-xs font-normal text-ink-muted">
                          {t('site.cookie.alwaysOn')}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {pickText(full.description, locale)}
                    </p>
                  </div>
                  <Switch
                    label={pickText(full.name, locale)}
                    checked={locked ? true : !!draft[c.id]}
                    disabled={locked}
                    onChange={(v) => setDraft((d) => ({ ...d, [c.id]: v }))}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={rejectAll}>
              {t('site.cookie.rejectAll')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => savePreferences(draft)}>
              {t('site.cookie.savePreferences')}
            </Button>
            <Button size="sm" onClick={acceptAll}>
              {t('site.cookie.acceptAll')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
