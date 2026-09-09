import { react } from '@carrental/config/eslint';

export default [
  ...react,
  { ignores: ['dist/**', 'coverage/**', '*.cjs'] },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
];
