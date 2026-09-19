import { ICON_NAMES, type BlockType } from '@carrental/contracts';
import {
  CarFront,
  GalleryVerticalEnd,
  HelpCircle,
  Image as ImageIcon,
  LayoutList,
  ListOrdered,
  MapPin,
  Megaphone,
  MessageSquareQuote,
  Rows3,
  Search,
  Sparkles,
  Type,
  type LucideIcon,
} from 'lucide-react';

export type FieldKind =
  | 'ltext'
  | 'larea'
  | 'text'
  | 'num'
  | 'bool'
  | 'select'
  | 'icon'
  | 'asset'
  | 'link'
  | 'list';

export interface FieldDef {
  kind: FieldKind;
  key: string;
  label: string; // i18n key ops.pages.field.*
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[]; // for select
  purpose?: 'heroImage' | 'pageImage'; // for asset
  itemFields?: FieldDef[]; // for list
  itemMax?: number;
}

export interface BlockDef {
  type: BlockType;
  label: string; // ops.pages.block.<type>
  hint: string; // ops.pages.block.<type>.desc
  Icon: LucideIcon;
  group: 'content' | 'data' | 'media';
  singleton?: boolean;
  required?: boolean;
  supportsTone: boolean;
  fields: FieldDef[];
}

const ICON_OPTS = ICON_NAMES as unknown as string[];

const iconItem = (): FieldDef[] => [
  { kind: 'icon', key: 'icon', label: 'ops.pages.field.icon' },
  { kind: 'ltext', key: 'title', label: 'ops.pages.field.title' },
  { kind: 'larea', key: 'text', label: 'ops.pages.field.text' },
];

export const BLOCK_DEFS: Record<BlockType, BlockDef> = {
  hero: {
    type: 'hero',
    label: 'ops.pages.block.hero',
    hint: 'ops.pages.block.hero.desc',
    Icon: Sparkles,
    group: 'content',
    singleton: true,
    supportsTone: false,
    fields: [
      { kind: 'ltext', key: 'eyebrow', label: 'ops.pages.field.eyebrow' },
      {
        kind: 'ltext',
        key: 'title',
        label: 'ops.pages.field.title',
        hint: 'ops.pages.field.title.hint',
      },
      { kind: 'larea', key: 'subtitle', label: 'ops.pages.field.subtitle' },
      {
        kind: 'asset',
        key: 'background',
        label: 'ops.pages.field.background',
        purpose: 'heroImage',
      },
      {
        kind: 'num',
        key: 'overlayOpacity',
        label: 'ops.pages.field.overlayOpacity',
        min: 0,
        max: 0.9,
        step: 0.05,
      },
      {
        kind: 'select',
        key: 'textAlign',
        label: 'ops.pages.field.textAlign',
        options: ['center', 'start'],
      },
      { kind: 'ltext', key: 'rating', label: 'ops.pages.field.rating' },
      { kind: 'link', key: 'primaryCta', label: 'ops.pages.field.primaryCta' },
      { kind: 'link', key: 'secondaryCta', label: 'ops.pages.field.secondaryCta' },
    ],
  },
  'search-card': {
    type: 'search-card',
    label: 'ops.pages.block.searchCard',
    hint: 'ops.pages.block.searchCard.desc',
    Icon: Search,
    group: 'data',
    singleton: true,
    required: true,
    supportsTone: false,
    fields: [
      { kind: 'ltext', key: 'title', label: 'ops.pages.field.title' },
      { kind: 'ltext', key: 'hint', label: 'ops.pages.field.hint' },
    ],
  },
  'trust-bar': {
    type: 'trust-bar',
    label: 'ops.pages.block.trustBar',
    hint: 'ops.pages.block.trustBar.desc',
    Icon: Rows3,
    group: 'content',
    singleton: true,
    supportsTone: false,
    fields: [
      {
        kind: 'list',
        key: 'items',
        label: 'ops.pages.field.items',
        itemFields: iconItem(),
        itemMax: 6,
      },
    ],
  },
  'feature-grid': {
    type: 'feature-grid',
    label: 'ops.pages.block.featureGrid',
    hint: 'ops.pages.block.featureGrid.desc',
    Icon: LayoutList,
    group: 'content',
    supportsTone: true,
    fields: [
      { kind: 'ltext', key: 'eyebrow', label: 'ops.pages.field.eyebrow' },
      { kind: 'ltext', key: 'title', label: 'ops.pages.field.title' },
      { kind: 'larea', key: 'subtitle', label: 'ops.pages.field.subtitle' },
      {
        kind: 'select',
        key: 'columns',
        label: 'ops.pages.field.columns',
        options: ['2', '3', '4'],
      },
      {
        kind: 'list',
        key: 'items',
        label: 'ops.pages.field.items',
        itemFields: iconItem(),
        itemMax: 8,
      },
    ],
  },
  steps: {
    type: 'steps',
    label: 'ops.pages.block.steps',
    hint: 'ops.pages.block.steps.desc',
    Icon: ListOrdered,
    group: 'content',
    supportsTone: true,
    fields: [
      { kind: 'ltext', key: 'eyebrow', label: 'ops.pages.field.eyebrow' },
      { kind: 'ltext', key: 'title', label: 'ops.pages.field.title' },
      {
        kind: 'list',
        key: 'items',
        label: 'ops.pages.field.items',
        itemFields: iconItem(),
        itemMax: 6,
      },
    ],
  },
  stats: {
    type: 'stats',
    label: 'ops.pages.block.stats',
    hint: 'ops.pages.block.stats.desc',
    Icon: GalleryVerticalEnd,
    group: 'content',
    singleton: true,
    supportsTone: true,
    fields: [
      { kind: 'ltext', key: 'title', label: 'ops.pages.field.title' },
      { kind: 'bool', key: 'autoLocations', label: 'ops.pages.field.autoLocations' },
      {
        kind: 'list',
        key: 'items',
        label: 'ops.pages.field.items',
        itemMax: 4,
        itemFields: [
          { kind: 'text', key: 'value', label: 'ops.pages.field.value', max: 16 },
          { kind: 'ltext', key: 'label', label: 'ops.pages.field.label' },
        ],
      },
    ],
  },
  testimonials: {
    type: 'testimonials',
    label: 'ops.pages.block.testimonials',
    hint: 'ops.pages.block.testimonials.desc',
    Icon: MessageSquareQuote,
    group: 'content',
    supportsTone: true,
    fields: [
      { kind: 'ltext', key: 'eyebrow', label: 'ops.pages.field.eyebrow' },
      { kind: 'ltext', key: 'title', label: 'ops.pages.field.title' },
      {
        kind: 'list',
        key: 'items',
        label: 'ops.pages.field.items',
        itemMax: 3,
        itemFields: [
          { kind: 'text', key: 'name', label: 'ops.pages.field.name', max: 80 },
          { kind: 'ltext', key: 'role', label: 'ops.pages.field.role' },
          { kind: 'larea', key: 'quote', label: 'ops.pages.field.quote' },
        ],
      },
    ],
  },
  locations: {
    type: 'locations',
    label: 'ops.pages.block.locations',
    hint: 'ops.pages.block.locations.desc',
    Icon: MapPin,
    group: 'data',
    singleton: true,
    supportsTone: true,
    fields: [
      { kind: 'ltext', key: 'eyebrow', label: 'ops.pages.field.eyebrow' },
      { kind: 'ltext', key: 'title', label: 'ops.pages.field.title' },
      { kind: 'larea', key: 'subtitle', label: 'ops.pages.field.subtitle' },
      { kind: 'ltext', key: 'ctaLabel', label: 'ops.pages.field.ctaLabel' },
      { kind: 'num', key: 'limit', label: 'ops.pages.field.limit', min: 1, max: 12 },
    ],
  },
  faq: {
    type: 'faq',
    label: 'ops.pages.block.faq',
    hint: 'ops.pages.block.faq.desc',
    Icon: HelpCircle,
    group: 'content',
    singleton: true,
    supportsTone: true,
    fields: [
      { kind: 'ltext', key: 'eyebrow', label: 'ops.pages.field.eyebrow' },
      { kind: 'ltext', key: 'title', label: 'ops.pages.field.title' },
      { kind: 'ltext', key: 'ctaLabel', label: 'ops.pages.field.ctaLabel' },
      {
        kind: 'list',
        key: 'items',
        label: 'ops.pages.field.items',
        itemMax: 8,
        itemFields: [
          { kind: 'ltext', key: 'q', label: 'ops.pages.field.question' },
          { kind: 'larea', key: 'a', label: 'ops.pages.field.answer' },
        ],
      },
    ],
  },
  cta: {
    type: 'cta',
    label: 'ops.pages.block.cta',
    hint: 'ops.pages.block.cta.desc',
    Icon: Megaphone,
    group: 'content',
    supportsTone: true,
    fields: [
      { kind: 'ltext', key: 'title', label: 'ops.pages.field.title' },
      { kind: 'larea', key: 'subtitle', label: 'ops.pages.field.subtitle' },
      { kind: 'link', key: 'primary', label: 'ops.pages.field.primaryCta' },
      { kind: 'link', key: 'secondary', label: 'ops.pages.field.secondaryCta' },
    ],
  },
  fleet: {
    type: 'fleet',
    label: 'ops.pages.block.fleet',
    hint: 'ops.pages.block.fleet.desc',
    Icon: CarFront,
    group: 'data',
    singleton: true,
    supportsTone: true,
    fields: [
      { kind: 'ltext', key: 'eyebrow', label: 'ops.pages.field.eyebrow' },
      { kind: 'ltext', key: 'title', label: 'ops.pages.field.title' },
      { kind: 'larea', key: 'subtitle', label: 'ops.pages.field.subtitle' },
      { kind: 'ltext', key: 'ctaLabel', label: 'ops.pages.field.ctaLabel' },
      { kind: 'num', key: 'limit', label: 'ops.pages.field.limit', min: 3, max: 12 },
    ],
  },
  'rich-text': {
    type: 'rich-text',
    label: 'ops.pages.block.richText',
    hint: 'ops.pages.block.richText.desc',
    Icon: Type,
    group: 'content',
    supportsTone: true,
    fields: [
      { kind: 'ltext', key: 'eyebrow', label: 'ops.pages.field.eyebrow' },
      { kind: 'ltext', key: 'heading', label: 'ops.pages.field.title' },
      {
        kind: 'larea',
        key: 'body',
        label: 'ops.pages.field.body',
        hint: 'ops.pages.field.body.hint',
      },
      {
        kind: 'select',
        key: 'align',
        label: 'ops.pages.field.textAlign',
        options: ['start', 'center'],
      },
      {
        kind: 'select',
        key: 'maxWidth',
        label: 'ops.pages.field.maxWidth',
        options: ['prose', 'wide'],
      },
    ],
  },
  image: {
    type: 'image',
    label: 'ops.pages.block.image',
    hint: 'ops.pages.block.image.desc',
    Icon: ImageIcon,
    group: 'media',
    supportsTone: true,
    fields: [
      { kind: 'asset', key: 'src', label: 'ops.pages.field.background', purpose: 'pageImage' },
      { kind: 'ltext', key: 'alt', label: 'ops.pages.field.alt' },
      { kind: 'ltext', key: 'caption', label: 'ops.pages.field.caption' },
      { kind: 'bool', key: 'decorative', label: 'ops.pages.field.decorative' },
      {
        kind: 'select',
        key: 'maxWidth',
        label: 'ops.pages.field.maxWidth',
        options: ['prose', 'wide', 'full'],
      },
      { kind: 'bool', key: 'rounded', label: 'ops.pages.field.rounded' },
    ],
  },
};

export const BLOCK_ORDER: BlockType[] = [
  'hero',
  'search-card',
  'trust-bar',
  'fleet',
  'feature-grid',
  'steps',
  'stats',
  'testimonials',
  'locations',
  'faq',
  'cta',
  'rich-text',
  'image',
];

export const ICON_OPTIONS = ICON_OPTS;
