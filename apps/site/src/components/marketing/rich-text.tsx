import { Fragment, type ReactNode } from 'react';

import { Section, cx } from './section';

/**
 * A prose block. Content is a tiny, safe markdown subset — blank-line paragraphs, `**bold**`,
 * and `[label](href)` links (relative / anchor / https only). No raw HTML.
 */
export function RichText({
  tone = 'default',
  headingAs = 'h2',
  eyebrow,
  heading_,
  body,
  align = 'start',
  maxWidth = 'prose',
}: {
  tone?: 'default' | 'muted' | 'brand';
  headingAs?: 'h1' | 'h2';
  eyebrow?: string;
  heading_?: string;
  body: string;
  align?: 'start' | 'center';
  maxWidth?: 'prose' | 'wide';
}) {
  const Heading = headingAs;
  const paras = body
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!paras.length && !heading_ && !eyebrow) return null;

  return (
    <Section tone={tone} className="mkt-section-tight">
      <div
        className={cx(
          maxWidth === 'wide' ? 'max-w-3xl' : 'max-w-prose',
          align === 'center' ? 'mx-auto text-center' : '',
        )}
      >
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        {heading_ ? (
          <Heading className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {heading_}
          </Heading>
        ) : null}
        {paras.map((p, i) => (
          <p key={i} className="mt-4 text-[0.95rem] leading-relaxed text-ink-muted first:mt-4">
            {inline(p)}
          </p>
        ))}
      </div>
    </Section>
  );
}

function safeHref(href: string): string {
  return /^(#|\/|https:\/\/)/.test(href.trim()) ? href.trim() : '#';
}

/** Parse `**bold**` and `[label](href)` in one pass. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={k++}>{text.slice(last, m.index)}</Fragment>);
    if (m[1] !== undefined) {
      out.push(
        <strong key={k++} className="font-semibold text-ink">
          {m[1]}
        </strong>,
      );
    } else {
      out.push(
        <a
          key={k++}
          href={safeHref(m[3] ?? '#')}
          className="font-medium text-brand underline underline-offset-4 hover:no-underline"
        >
          {m[2]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={k++}>{text.slice(last)}</Fragment>);
  return out;
}
