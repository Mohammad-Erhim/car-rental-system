import { z } from 'zod';

/** Translation catalogue (FR-ADM-012, SRS-I18N-003, SCREEN-OPS-034). */
export const zTranslationCoverageRow = z.object({
  locale: z.string(),
  namespace: z.string(),
  total: z.number().int(),
  published: z.number().int(),
  missing: z.number().int(),
  coveragePct: z.number().int(),
});

export const zTranslationCompleteness = z.object({
  locales: z.array(z.string()),
  rows: z.array(zTranslationCoverageRow),
});
export type TranslationCompleteness = z.infer<typeof zTranslationCompleteness>;

export const zTranslationEntry = z.object({
  key: z.string(),
  source: z.string(),
  /** the working value the editor edits (draft / in-review / published) */
  translation: z.string().nullable(),
  /** the value currently live on the site — frozen while an edit is in review */
  published: z.string().nullable(),
  status: z.enum(['missing', 'draft', 'in_review', 'published']),
  outdated: z.boolean(),
});
export type TranslationEntry = z.infer<typeof zTranslationEntry>;

export const zPublishTranslationsResponse = z.object({
  published: z.number().int(),
  entries: z.array(zTranslationEntry),
});
export type PublishTranslationsResponse = z.infer<typeof zPublishTranslationsResponse>;

export const zUpsertTranslationRequest = z.object({
  namespace: z.string().min(1).max(80),
  key: z.string().min(1).max(200),
  localeCode: z.string().min(2).max(10),
  value: z.string().max(4000),
  status: z.enum(['draft', 'in_review', 'published']).optional(),
});
