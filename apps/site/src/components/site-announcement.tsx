'use client';

import { pickText, zAnnouncement, type Announcement } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

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
  const barRef = useRef<HTMLDivElement | null>(null);

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

  // The header is independently sticky at `top-0`; when this bar is also sticky, publish its
  // rendered height as a CSS var so the header offsets below it instead of overlapping. Cleared
  // whenever the bar isn't actually stuck to the top, so the header falls back to its own top-0.
  useEffect(() => {
    const stuck = !!(ann && ann.enabled && !dismissed && ann.sticky && pickText(ann.message, locale));
    if (!stuck || !barRef.current) {
      document.documentElement.style.setProperty('--announcement-h', '0px');
      return;
    }
    const el = barRef.current;
    const update = () => document.documentElement.style.setProperty('--announcement-h', `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty('--announcement-h', '0px');
    };
  }, [ann, dismissed, locale]);

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
    <div
      ref={barRef}
      className={`${ann.sticky ? 'sticky top-0 z-50' : ''} ${VARIANT_CLASS[ann.variant]}`}
      role="region"
      aria-label={text}
    >
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
