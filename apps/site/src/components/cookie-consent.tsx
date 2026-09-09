'use client';

import {
  CONSENT_CATEGORIES,
  type ConsentCategory,
  type ConsentChoices,
} from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { Button } from '@carrental/ui';
import { Cookie, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

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
    openPreferences,
    closePreferences,
    acceptAll,
    rejectAll,
    savePreferences,
  } = useConsent();

  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState<ConsentChoices>(choices);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const isPreview =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('preview');

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (prefsOpen) setDraft(choices);
  }, [prefsOpen, choices]);
  useEffect(() => {
    if (!prefsOpen) return;
    panelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closePreferences();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prefsOpen, closePreferences]);

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

  return (
    <>
      {bannerOpen ? (
        <div
          role="dialog"
          aria-label={t('site.cookie.title')}
          className="fixed inset-x-0 bottom-0 z-[60] border-t border-hairline bg-surface/95 shadow-card backdrop-blur"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:gap-6 lg:px-8">
            <div className="flex items-start gap-3">
              <Cookie className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
              <p className="text-sm text-ink-muted">
                {t('site.cookie.body')} {policyLinks}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:ms-auto lg:shrink-0">
              <Button variant="outline" size="sm" onClick={() => openPreferences()}>
                {t('site.cookie.managePreferences')}
              </Button>
              <Button variant="outline" size="sm" onClick={rejectAll}>
                {t('site.cookie.rejectAll')}
              </Button>
              <Button size="sm" onClick={acceptAll}>
                {t('site.cookie.acceptAll')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {prefsOpen ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-end sm:place-items-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePreferences();
          }}
        >
          <div className="absolute inset-0 bg-ink/40" aria-hidden />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-prefs-title"
            tabIndex={-1}
            className="relative m-0 max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl outline-none sm:m-4 sm:max-w-lg sm:rounded-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="cookie-prefs-title" className="text-lg font-semibold text-ink">
                {t('site.cookie.prefsTitle')}
              </h2>
              <button
                type="button"
                onClick={closePreferences}
                aria-label={t('site.cookie.close')}
                className="-m-1 rounded p-1 text-ink-muted hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {t('site.cookie.prefsIntro')} {policyLinks}
            </p>

            <div className="mt-4 divide-y divide-hairline border-y border-hairline">
              {CONSENT_CATEGORIES.map((cat: ConsentCategory) => {
                const locked = cat === 'necessary';
                return (
                  <div key={cat} className="flex items-start justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {t(`site.cookie.cat.${cat}`)}
                        {locked ? (
                          <span className="ms-2 text-xs font-normal text-ink-muted">
                            {t('site.cookie.alwaysOn')}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {t(`site.cookie.catDesc.${cat}`)}
                      </p>
                    </div>
                    <Switch
                      label={t(`site.cookie.cat.${cat}`)}
                      checked={locked ? true : !!draft[cat]}
                      disabled={locked}
                      onChange={(v) => setDraft((d) => ({ ...d, [cat]: v }))}
                    />
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
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
          </div>
        </div>
      ) : null}
    </>
  );
}
