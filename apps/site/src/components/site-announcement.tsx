'use client';

import { pickText, zAnnouncement, type Announcement } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { isAllowedPreviewOrigin } from '../lib/preview-origin';

const DISMISS_KEY = 'carrental.announcement.dismissed';

const VARIANT_CLASS: Record<Announcement['variant'], string> = {
  info: 'bg-primary text-primary-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  critical: 'bg-destructive text-destructive-foreground',
};

function isPreview() {
  return (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('preview')
  );
}

/**
 * Site-wide announcement bar, rendered above the header on every public page. Content comes
 * from the published `pages` config (`announcement`). In the ops builder's live preview it also
 * listens for the draft over `postMessage` and ignores per-visitor dismissal.
 */
export function SiteAnnouncement({
  initial,
  locale,
}: {
  initial: Announcement | null;
  locale: string;
}) {
  const { t } = useI18n();
  const [ann, setAnn] = useState<Announcement | null>(initial);
  const [dismissed, setDismissed] = useState(false);
  const preview = isPreview();

  useEffect(() => {
    if (!preview) return;
    function onMessage(e: MessageEvent) {
      if (!isAllowedPreviewOrigin(e.origin, window.location.origin)) return;
      const data = e.data as { type?: string; payload?: { announcement?: unknown } };
      if (data?.type !== 'carrental:preview:update' || !data.payload) return;
      if (!('announcement' in data.payload)) return;
      const parsed = zAnnouncement.safeParse(data.payload.announcement);
      setAnn(parsed.success ? parsed.data : null);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [preview]);

  useEffect(() => {
    if (preview || !ann) return;
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === ann.id);
    } catch {
      setDismissed(false);
    }
  }, [ann, preview]);

  if (!ann || !ann.enabled || dismissed) return null;
  const text = pickText(ann.message, locale);
  if (!text) return null;

  function dismiss() {
    if (!ann) return;
    try {
      window.localStorage.setItem(DISMISS_KEY, ann.id);
    } catch {
      /* private mode — bar reappears next load, acceptable */
    }
    setDismissed(true);
  }

  return (
    <div className={VARIANT_CLASS[ann.variant]} role="region" aria-label={text}>
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2 text-sm sm:px-6 lg:px-8">
        <p className="min-w-0 flex-1 text-center sm:text-start">
          {text}
          {ann.cta && ann.cta.href ? (
            <Link
              href={ann.cta.href}
              className="ms-2 inline-block font-semibold underline underline-offset-2"
            >
              {pickText(ann.cta.label, locale)}
            </Link>
          ) : null}
        </p>
        {ann.dismissible ? (
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('action.dismiss')}
            className="-me-1 shrink-0 rounded p-1 opacity-80 hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
