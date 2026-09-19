'use client';

import { zBlock, type Block } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { brandConfigSchema, brandConfigToCss } from '@carrental/theme';
import { useEffect, useState } from 'react';

import { isAllowedPreviewOrigin, previewParentOrigin } from '../../lib/preview-origin';

import { BlockRenderer } from './block-renderer';
import type { FleetCategory } from './fleet-showcase';
import type { LocationItem } from './locations-strip';

const zBlocks = zBlock.array();
const PREVIEW_BRAND_STYLE_ID = 'carrental-preview-brand';

/** Swap the live-preview brand-token overlay (colours/radius/font) without a reload. */
function applyPreviewBrand(css: string | null) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(PREVIEW_BRAND_STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = PREVIEW_BRAND_STYLE_ID;
    document.head.appendChild(el);
  }
  // must win over the SSR `#carrental-brand-tokens` overlay — keep it last in <head>
  if (document.head.lastElementChild !== el) document.head.appendChild(el);
  el.textContent = css;
}

/**
 * Renders a public page from a live draft pushed by the ops page builder over `postMessage`
 * (same origin, or an allow-listed dashboard origin). First paint uses the server-provided blocks; every editor change re-renders
 * client-side — content, layout, block order, and the brand palette. Mounted only for
 * `/{locale}...?preview=1`.
 */
export function PreviewBridge({
  initialBlocks,
  locale: initialLocale,
  categories,
  locations,
}: {
  initialBlocks: Block[];
  locale: string;
  categories: FleetCategory[];
  locations: LocationItem[];
}) {
  const { t } = useI18n();
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [locale, setLocale] = useState(initialLocale);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!isAllowedPreviewOrigin(e.origin, window.location.origin)) return;
      const data = e.data as {
        type?: string;
        payload?: { blocks?: unknown; locale?: unknown; brand?: unknown };
      };
      if (data?.type !== 'carrental:preview:update' || !data.payload) return;
      const parsed = zBlocks.safeParse(data.payload.blocks);
      if (!parsed.success) return;
      setBlocks(parsed.data);
      if (typeof data.payload.locale === 'string') setLocale(data.payload.locale);
      if ('brand' in data.payload) {
        const brand = brandConfigSchema.safeParse(data.payload.brand);
        applyPreviewBrand(brand.success ? brandConfigToCss(brand.data) : null);
      }
    }
    window.addEventListener('message', onMessage);
    window.parent?.postMessage(
      { type: 'carrental:preview:ready', v: 1 },
      previewParentOrigin(document.referrer, window.location.origin),
    );
    return () => {
      window.removeEventListener('message', onMessage);
      applyPreviewBrand(null);
    };
  }, []);

  return (
    <BlockRenderer
      blocks={blocks}
      ctx={{
        t,
        locale,
        categories,
        locations,
        locationsCount: locations.length,
        preview: true,
      }}
    />
  );
}
