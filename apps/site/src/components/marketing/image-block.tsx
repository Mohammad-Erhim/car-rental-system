import { Section, cx } from './section';

/**
 * A single image (ops-uploaded, resolved to a signed URL server-side). Plain `<img>` with
 * intrinsic dimensions and lazy loading — the site configures no `next/image` remotePatterns.
 * `decorative` → empty alt + `aria-hidden`.
 */
export function ImageBlock({
  tone = 'default',
  src,
  alt,
  caption,
  width,
  height,
  maxWidth = 'wide',
  rounded = true,
  decorative = false,
}: {
  tone?: 'default' | 'muted' | 'brand';
  src: string;
  alt: string;
  caption?: string;
  width?: number | null;
  height?: number | null;
  maxWidth?: 'prose' | 'wide' | 'full';
  rounded?: boolean;
  decorative?: boolean;
}) {
  if (!src || src === 'obj:placeholder') return null;
  const widthClass =
    maxWidth === 'prose' ? 'max-w-prose' : maxWidth === 'full' ? 'max-w-none' : 'max-w-4xl';

  return (
    <Section tone={tone} className="mkt-section-tight">
      <figure className={cx('mx-auto', widthClass)}>
        <img
          src={src}
          alt={decorative ? '' : alt}
          aria-hidden={decorative || undefined}
          width={width ?? undefined}
          height={height ?? undefined}
          loading="lazy"
          decoding="async"
          className={cx(
            'h-auto w-full object-cover',
            rounded && 'rounded-2xl',
            'border border-hairline shadow-card',
          )}
        />
        {caption ? (
          <figcaption className="mt-2 text-center text-xs text-ink-muted">{caption}</figcaption>
        ) : null}
      </figure>
    </Section>
  );
}
