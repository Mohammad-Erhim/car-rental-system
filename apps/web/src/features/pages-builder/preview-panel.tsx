import { useI18n } from '@carrental/i18n/react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { DEVICE_W, fitScale, type Viewport } from './builder-model';

import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';

const PREVIEW_H = 760;
const DEVICES: Array<[Viewport, typeof Monitor]> = [
  ['desktop', Monitor],
  ['tablet', Tablet],
  ['mobile', Smartphone],
];

/**
 * The public site in a frame, at the chosen device width (rendered at real width, then scaled to
 * fit). The editor posts the draft to the frame, so what you see is the unsaved edit.
 */
export function PreviewPanel({
  src,
  frameRef,
  viewport,
  onViewport,
}: {
  src: string;
  frameRef: RefObject<HTMLIFrameElement>;
  viewport: Viewport;
  onViewport: (v: Viewport) => void;
}) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(560);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const deviceW = DEVICE_W[viewport];
  const scale = fitScale(containerW, deviceW);

  return (
    <SectionCard
      title={t('ops.pages.preview')}
      description={`${t(`ops.pages.viewport.${viewport}`)} · ${Math.round(scale * 100)}%`}
      actions={
        <div className="flex gap-1 rounded-lg border p-0.5">
          {DEVICES.map(([v, Icon]) => (
            <Button
              key={v}
              type="button"
              size="icon-sm"
              variant={viewport === v ? 'default' : 'ghost'}
              aria-label={t(`ops.pages.viewport.${v}`)}
              aria-pressed={viewport === v}
              onClick={() => onViewport(v)}
            >
              <Icon aria-hidden="true" />
            </Button>
          ))}
        </div>
      }
    >
      <div ref={wrapRef} className="overflow-hidden rounded-lg border bg-muted/40">
        <div className="mx-auto" style={{ width: Math.round(deviceW * scale), height: PREVIEW_H }}>
          <iframe
            ref={frameRef}
            title={t('ops.pages.previewFrameTitle')}
            src={src}
            style={{
              width: deviceW,
              height: Math.round(PREVIEW_H / scale),
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              border: 0,
              display: 'block',
              background: 'hsl(var(--background))',
            }}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t('ops.pages.previewHint')}</p>
    </SectionCard>
  );
}
