'use client';

import { useEffect } from 'react';

const STYLE_ID = 'carrental-preview-guard';

/**
 * The ops page builder shows the site in a frame to look at, not to use. In preview mode
 * (`?preview=1`, inside a frame) this makes the page view-and-scroll only: clicks on links and
 * buttons do nothing, forms cannot submit, drags and context-menu navigation are suppressed, and
 * the pointer stays an arrow. Scrolling, hover styles and text selection are untouched. The
 * listeners run in the capture phase so they beat the site's own handlers. Nothing here runs on
 * the public site.
 */
export function PreviewGuard() {
  useEffect(() => {
    const active =
      new URLSearchParams(window.location.search).has('preview') && window.self !== window.top;
    if (!active) return;

    const block = (e: Event) => {
      const target = e.target as Element | null;
      // a click on plain content (text, images) is harmless; only stop things that act
      if (
        e.type === 'submit' ||
        target?.closest(
          'a[href], button, [role="button"], [role="link"], summary, label, select, input[type="checkbox"], input[type="radio"], input[type="submit"]',
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };
    const events = ['click', 'auxclick', 'submit', 'dblclick', 'dragstart'] as const;
    events.forEach((n) => document.addEventListener(n, block, true));

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      'a, button, [role="button"], [role="link"], label, select, summary { cursor: default !important; }';
    document.head.appendChild(style);

    return () => {
      events.forEach((n) => document.removeEventListener(n, block, true));
      style.remove();
    };
  }, []);

  return null;
}
