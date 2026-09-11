import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { auditColumns } from './_helpers';

/**
 * SRC-LANGUAGE-LOCALE (SRS §21.1) — enabled locales are business configuration served
 * dynamically. `system` seed profile writes the dev/test set (DEC-020); production activation
 * of a locale is gated by the business (BR-028).
 */
export const locale = pgTable(
  'locale',
  {
    ...auditColumns,
    code: text('code').notNull(), // BCP-47, stable, language-neutral
    nativeName: text('native_name').notNull(),
    englishName: text('english_name').notNull(),
    direction: text('direction').notNull().default('ltr'), // 'ltr' | 'rtl'
    fallbackChain: jsonb('fallback_chain')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    testOnly: boolean('test_only').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({
    codeUnq: uniqueIndex('locale_code_unq').on(t.code),
    activeIdx: index('locale_active_idx').on(t.isActive),
    // exactly one default locale — guards a race between two "make default" calls.
    oneDefaultUnq: uniqueIndex('locale_one_default_unq')
      .on(t.isDefault)
      .where(sql`${t.isDefault}`),
  }),
);

/**
 * DAT-TRANSLATION (SRS §9.2) — translation resource/version for UI keys, lookup labels,
 * catalogue content, policy text, templates. Publishing detects missing/outdated/placeholder.
 */
export const translation = pgTable(
  'translation',
  {
    ...auditColumns,
    namespace: text('namespace').notNull(), // e.g. 'common', 'checkout', 'lookup:cancel_reason'
    key: text('key').notNull(), // stable translation key, language-neutral
    localeCode: text('locale_code').notNull(),
    /** the working value — what the draft/in-review editor shows and edits */
    value: text('value').notNull(),
    /** the value currently live on the site; frozen while an edit is in review so a draft never
     *  un-publishes a string. Null until this key has been published at least once. */
    publishedValue: text('published_value'),
    status: text('status').notNull().default('published'), // draft|in_review|published|retired
    /** hash of the source string this translation was made against (stale detection) */
    sourceRevision: text('source_revision'),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'string' }),
    isFallbackAccepted: boolean('is_fallback_accepted').notNull().default(false),
  },
  (t) => ({
    unq: uniqueIndex('translation_ns_key_locale_unq').on(t.namespace, t.key, t.localeCode),
    localeIdx: index('translation_locale_idx').on(t.localeCode, t.status),
  }),
);
