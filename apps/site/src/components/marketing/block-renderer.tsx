import {
  H1_CAPABLE_BLOCKS,
  pickText,
  type Block,
  type BlockType,
  type Localized,
} from '@carrental/contracts';
import type { FC } from 'react';

import { CtaBand } from './cta-band';
import { Faq } from './faq';
import { FleetShowcase, type FleetCategory } from './fleet-showcase';
import { Hero } from './hero';
import { HowItWorks } from './how-it-works';
import { ImageBlock } from './image-block';
import { LocationsStrip, type LocationItem } from './locations-strip';
import { RichText } from './rich-text';
import { SearchCard } from './search-card';
import type { Translate } from './section';
import { StatsBand } from './stats-band';
import { Testimonials } from './testimonials';
import { TrustBar } from './trust-bar';
import { WhyUs } from './why-us';

/**
 * Isomorphic block renderer. Runs on the server (`[locale]/page.tsx`) and — for `?preview=1` —
 * on the client (`PreviewBridge`). Every block maps to one of the existing marketing components;
 * per-block copy is applied by wrapping `ctx.t` so a component's own `t('site.home.*')` calls
 * transparently pick up the block's content (falling back to the i18n key when a field is empty).
 * Non-text props (tone, heading level, hero background) are passed explicitly.
 */
export interface RenderCtx {
  t: Translate;
  locale: string;
  categories: FleetCategory[];
  locations: LocationItem[];
  locationsCount: number;
  /** true on the client preview — threads `prefetch={false}` etc. */
  preview?: boolean;
}

const val = (v: Localized | undefined | null, locale: string): string | undefined =>
  v ? pickText(v, locale) || undefined : undefined;

/**
 * Per-block-type map: i18n key → the block field that overrides it. Order of the item keys
 * matches each component's fixed local list, so `items[n]` overrides item `n`.
 */
type Overrides = Record<string, string | undefined>;
/* Block props are a discriminated union keyed elsewhere; the override builders index dynamically. */
/* eslint-disable @typescript-eslint/no-explicit-any */
const OVERRIDES: Partial<Record<BlockType, (p: any, locale: string) => Overrides>> = {
  hero: (p, l) => ({
    'site.home.heroEyebrow': val(p.eyebrow, l),
    'site.home.heroTitle': val(p.title, l),
    'site.home.heroSubtitle': val(p.subtitle, l),
    'site.home.heroRating': val(p.rating, l),
    'site.home.heroPrimaryCta': val(p.primaryCta?.label, l),
    'site.home.heroSecondaryCta': val(p.secondaryCta?.label, l),
    'site.home.trust.cancel.title': val(p.trustItems?.[0], l),
    'site.home.trust.support.title': val(p.trustItems?.[1], l),
    'site.home.trust.locations.title': val(p.trustItems?.[2], l),
  }),
  'search-card': (p, l) => ({
    'site.home.searchCardTitle': val(p.title, l),
    'site.home.searchCardHint': val(p.hint, l),
  }),
  'trust-bar': (p, l) =>
    itemOverrides('site.home.trust', ['cancel', 'price', 'support', 'locations'], p.items, l, [
      'title',
      'text',
    ]),
  'feature-grid': (p, l) => ({
    'site.home.why.eyebrow': val(p.eyebrow, l),
    'site.home.why.title': val(p.title, l),
    'site.home.why.subtitle': val(p.subtitle, l),
    ...itemOverrides('site.home.why', ['item1', 'item2', 'item3', 'item4'], p.items, l, [
      'title',
      'text',
    ]),
  }),
  steps: (p, l) => ({
    'site.home.steps.eyebrow': val(p.eyebrow, l),
    'site.home.steps.title': val(p.title, l),
    ...itemOverrides('site.home.steps', ['step1', 'step2', 'step3'], p.items, l, ['title', 'text']),
  }),
  stats: (p, l) => ({
    'site.home.stats.title': val(p.title, l),
    'site.home.stats.locations': val(p.items?.[0]?.label, l),
    'site.home.stats.vehicles': val(p.items?.[1]?.label, l),
    'site.home.stats.countries': val(p.items?.[2]?.label, l),
    'site.home.stats.rating': val(p.items?.[3]?.label, l),
  }),
  testimonials: (p, l) => ({
    'site.home.reviews.eyebrow': val(p.eyebrow, l),
    'site.home.reviews.title': val(p.title, l),
    ...itemOverrides(
      'site.home.reviews',
      ['r1', 'r2', 'r3'],
      p.items,
      l,
      ['quote', 'role'],
      (it) => ({
        name: typeof it?.name === 'string' ? it.name : undefined,
      }),
    ),
  }),
  locations: (p, l) => ({
    'site.home.locations.eyebrow': val(p.eyebrow, l),
    'site.home.locations.title': val(p.title, l),
    'site.home.locations.subtitle': val(p.subtitle, l),
    'site.home.locations.cta': val(p.ctaLabel, l),
  }),
  faq: (p, l) => ({
    'site.home.faq.eyebrow': val(p.eyebrow, l),
    'site.home.faq.title': val(p.title, l),
    'site.home.faq.cta': val(p.ctaLabel, l),
    ...faqItemOverrides(p.items, l),
  }),
  cta: (p, l) => ({
    'site.home.cta.title': val(p.title, l),
    'site.home.cta.subtitle': val(p.subtitle, l),
    'site.home.cta.primary': val(p.primary?.label, l),
    'site.home.cta.secondary': val(p.secondary?.label, l),
  }),
  fleet: (p, l) => ({
    'site.home.fleet.eyebrow': val(p.eyebrow, l),
    'site.home.fleet.title': val(p.title, l),
    'site.home.fleet.subtitle': val(p.subtitle, l),
    'site.home.fleet.emptyTitle': val(p.emptyTitle, l),
    'site.home.fleet.emptyText': val(p.emptyText, l),
    'site.home.fleet.cta': val(p.ctaLabel, l),
  }),
};

/* eslint-enable @typescript-eslint/no-explicit-any */

function itemOverrides(
  prefix: string,
  localKeys: string[],
  items: Array<Record<string, unknown>> | undefined,
  locale: string,
  fields: string[],
  extra?: (it: Record<string, unknown> | undefined) => Overrides,
): Overrides {
  const out: Overrides = {};
  localKeys.forEach((lk, i) => {
    const it = items?.[i];
    for (const f of fields) {
      out[`${prefix}.${lk}.${f}`] = val(it?.[f] as Localized | undefined, locale);
    }
    if (extra) Object.assign(out, prefixKeys(`${prefix}.${lk}`, extra(it)));
  });
  return out;
}
function prefixKeys(prefix: string, o: Overrides): Overrides {
  const out: Overrides = {};
  for (const [k, v] of Object.entries(o)) out[`${prefix}.${k}`] = v;
  return out;
}
function faqItemOverrides(
  items: Array<{ q?: Localized; a?: Localized }> | undefined,
  locale: string,
): Overrides {
  const keys = ['booking', 'changes', 'payment', 'pickup'];
  const out: Overrides = {};
  keys.forEach((k, i) => {
    out[`site.help.faq.${k}.q`] = val(items?.[i]?.q, locale);
    out[`site.help.faq.${k}.a`] = val(items?.[i]?.a, locale);
  });
  return out;
}

/** Wrap `t` so overridden keys return block content; everything else delegates. */
function scopedT(t: Translate, block: Block, locale: string): Translate {
  const build = OVERRIDES[block.type];
  if (!build) return t;
  const map = build(block.props, locale);
  return (key, params) => {
    const hit = map[key];
    return hit !== undefined && hit !== '' ? hit : t(key, params);
  };
}

type BlockFC = FC<{ block: Block; ctx: RenderCtx; heading: 'h1' | 'h2' }>;

/** Narrow a block's props to the shape for `type` (the discriminated union can't do it here). */
const propsOf = <T extends BlockType>(block: Block, _type: T) =>
  block.props as Extract<Block, { type: T }>['props'];

const BLOCK_COMPONENTS: Record<BlockType, BlockFC> = {
  hero: ({ block, ctx, heading }) => {
    const p = propsOf(block, 'hero');
    return (
      <Hero
        t={scopedT(ctx.t, block, ctx.locale)}
        heading={heading}
        background={p.background ?? null}
        overlayOpacity={p.overlayOpacity}
        textAlign={p.textAlign}
        primaryHref={p.primaryCta?.href}
        secondaryHref={p.secondaryCta === null ? null : p.secondaryCta?.href}
      />
    );
  },
  'search-card': ({ block, ctx }) => (
    <SearchCard
      t={scopedT(ctx.t, block, ctx.locale)}
      locale={ctx.locale}
      locations={ctx.locations}
    />
  ),
  'trust-bar': ({ block, ctx }) => <TrustBar t={scopedT(ctx.t, block, ctx.locale)} />,
  'feature-grid': ({ block, ctx, heading }) => (
    <WhyUs
      t={scopedT(ctx.t, block, ctx.locale)}
      tone={block.tone}
      headingAs={heading}
      columns={propsOf(block, 'feature-grid').columns}
    />
  ),
  steps: ({ block, ctx, heading }) => (
    <HowItWorks t={scopedT(ctx.t, block, ctx.locale)} tone={block.tone} headingAs={heading} />
  ),
  stats: ({ block, ctx, heading }) => (
    <StatsBand
      t={scopedT(ctx.t, block, ctx.locale)}
      locationsCount={ctx.locationsCount}
      tone={block.tone}
      headingAs={heading}
      values={propsOf(block, 'stats').items?.map((it) => it.value)}
      autoLocations={propsOf(block, 'stats').autoLocations}
    />
  ),
  testimonials: ({ block, ctx, heading }) => (
    <Testimonials
      t={scopedT(ctx.t, block, ctx.locale)}
      tone={block.tone}
      headingAs={heading}
      count={propsOf(block, 'testimonials').items?.length || undefined}
    />
  ),
  locations: ({ block, ctx, heading }) => (
    <LocationsStrip
      t={scopedT(ctx.t, block, ctx.locale)}
      locale={ctx.locale}
      locations={ctx.locations}
      tone={block.tone}
      headingAs={heading}
      limit={propsOf(block, 'locations').limit}
    />
  ),
  faq: ({ block, ctx, heading }) => (
    <Faq
      t={scopedT(ctx.t, block, ctx.locale)}
      locale={ctx.locale}
      tone={block.tone}
      headingAs={heading}
    />
  ),
  cta: ({ block, ctx, heading }) => (
    <CtaBand
      t={scopedT(ctx.t, block, ctx.locale)}
      locale={ctx.locale}
      tone={block.tone}
      headingAs={heading}
    />
  ),
  fleet: ({ block, ctx, heading }) => (
    <FleetShowcase
      t={scopedT(ctx.t, block, ctx.locale)}
      locale={ctx.locale}
      categories={ctx.categories.slice(0, propsOf(block, 'fleet').limit)}
      tone={block.tone}
      headingAs={heading}
    />
  ),
  'rich-text': ({ block, ctx, heading }) => {
    const p = propsOf(block, 'rich-text');
    return (
      <RichText
        tone={block.tone}
        headingAs={heading}
        eyebrow={val(p.eyebrow, ctx.locale)}
        heading_={val(p.heading, ctx.locale)}
        body={pickText(p.body, ctx.locale)}
        align={p.align}
        maxWidth={p.maxWidth}
      />
    );
  },
  image: ({ block, ctx }) => {
    const p = propsOf(block, 'image');
    return (
      <ImageBlock
        tone={block.tone}
        src={p.src}
        alt={val(p.alt, ctx.locale) ?? ''}
        caption={val(p.caption, ctx.locale)}
        width={p.width}
        height={p.height}
        maxWidth={p.maxWidth}
        rounded={p.rounded}
        decorative={p.decorative}
      />
    );
  },
};

export function BlockRenderer({ blocks, ctx }: { blocks: Block[]; ctx: RenderCtx }) {
  const visible = blocks.filter((b) => !b.hidden);
  const h1Owner =
    visible.find((b) => b.type === 'hero')?.id ??
    visible.find((b) => H1_CAPABLE_BLOCKS.includes(b.type))?.id;

  return (
    <div className="flex flex-col">
      {visible.map((block) => {
        const C = BLOCK_COMPONENTS[block.type];
        if (!C) return null;
        return (
          <C key={block.id} block={block} ctx={ctx} heading={block.id === h1Owner ? 'h1' : 'h2'} />
        );
      })}
    </div>
  );
}
