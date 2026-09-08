'use client';

import { zBlock, type Block } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { useEffect, useState } from 'react';

import { BlockRenderer } from './block-renderer';
import type { FleetCategory } from './fleet-showcase';
import type { LocationItem } from './locations-strip';

const zBlocks = zBlock.array();

/**
 * Renders the homepage from a live draft pushed by the ops page builder over `postMessage`
 * (same-origin only). First paint uses the server-provided blocks; every editor change re-renders
 * client-side. Mounted only for `/{locale}?preview=1`.
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
      if (e.origin !== window.location.origin) return;
      const data = e.data as {
        type?: string;
        payload?: { blocks?: unknown; locale?: unknown };
      };
      if (data?.type !== 'carrental:preview:update' || !data.payload) return;
      const parsed = zBlocks.safeParse(data.payload.blocks);
      if (!parsed.success) return;
      setBlocks(parsed.data);
      if (typeof data.payload.locale === 'string') setLocale(data.payload.locale);
    }
    window.addEventListener('message', onMessage);
    window.parent?.postMessage({ type: 'carrental:preview:ready', v: 1 }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
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
