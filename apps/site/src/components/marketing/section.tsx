import type { ReactNode } from 'react';

/** Minimal translator surface the marketing sections need (server-side `getT().t`). */
export type Translate = (key: string, params?: Record<string, string | number>) => string;

type Tone = 'default' | 'muted' | 'brand';

const toneClass: Record<Tone, string> = {
  default: 'bg-background',
  muted: 'band-muted',
  brand: 'band-brand relative overflow-hidden',
};

/**
 * A full-width marketing band. The page shell (`<main>`) carries no horizontal container, so a
 * `<Section>` spans edge-to-edge and places its own `.mkt-container` inside — tinted / brand
 * bands then bleed correctly without any `100vw` trickery (keeps the no-horizontal-scroll e2e
 * guard happy).
 */
export function Section({
  id,
  tone = 'default',
  className,
  containerClassName,
  children,
}: {
  id?: string;
  tone?: Tone;
  className?: string;
  containerClassName?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cx('band', toneClass[tone], className)}>
      {tone === 'brand' ? <span className="aurora" aria-hidden="true" /> : null}
      <div className={cx('mkt-container relative', containerClassName)}>{children}</div>
    </section>
  );
}

/** Eyebrow + heading + lead paragraph, centered or start-aligned. */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = 'center',
  invert = false,
  as: Heading = 'h2',
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  align?: 'center' | 'start';
  invert?: boolean;
  as?: 'h1' | 'h2';
}) {
  return (
    <div
      className={cx(
        'flex max-w-2xl flex-col gap-3',
        align === 'center' ? 'mx-auto items-center text-center' : 'items-start text-start',
      )}
    >
      {eyebrow ? (
        <span className={cx('eyebrow', invert && 'text-warm')}>
          <span aria-hidden="true" className="h-px w-6 bg-current opacity-60" />
          {eyebrow}
        </span>
      ) : null}
      <Heading
        className={cx(
          Heading === 'h1'
            ? 'headline'
            : 'text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl',
          invert ? 'text-brand-foreground' : 'text-ink',
        )}
      >
        {title}
      </Heading>
      {lead ? <p className={cx('subhead', invert && 'text-brand-foreground/85')}>{lead}</p> : null}
    </div>
  );
}

/** Tiny classnames joiner (no runtime dep; `cn` from the UI kit is client-flagged). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
