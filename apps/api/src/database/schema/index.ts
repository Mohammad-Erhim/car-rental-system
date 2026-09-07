/**
 * Drizzle schema barrel. Each domain module owns its tables (SRS-ARC-008); they are re-exported
 * here so the single migration pipeline and the typed client see the whole schema.
 */
export * from './i18n';
export * from './lookup';
export * from './org';
export * from './iam';
export * from './platform';
