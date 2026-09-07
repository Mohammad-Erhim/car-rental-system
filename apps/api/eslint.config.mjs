import { node, apiModuleBoundaries } from '@carrental/config/eslint';

/**
 * Domain modules of the NestJS monolith. Cross-module imports are restricted to each
 * module's public surface (SRS-ARC-001, SRS-NFR-013). Add new modules here as they land.
 */
export const API_MODULES = [
  'meta',
  'iam',
  'config',
  'customer',
  'catalogue',
  'fleet',
  'availability',
  'pricing',
  'payment',
  'booking',
  'rental',
  'case',
  'notify',
  'report',
];

export default [
  ...node,
  { ignores: ['dist/**', 'coverage/**', 'src/database/migrations/**', '*.cjs'] },
  {
    rules: {
      // NestJS DI relies on runtime class references in constructor params; converting a DI
      // dependency to `import type` elides it and breaks `emitDecoratorMetadata`. Disable.
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-import-type-side-effects': 'off',
    },
  },
  ...apiModuleBoundaries(API_MODULES),
  {
    files: ['test/**/*.ts', '**/*.test.ts', 'src/database/seed/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-imports': 'off',
    },
  },
];
