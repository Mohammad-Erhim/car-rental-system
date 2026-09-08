import { react } from '@carrental/config/eslint';

export default [
  ...react,
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', '*.cjs', '*.config.*'] },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'vitest.setup.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
];
