import { react } from '@carrental/config/eslint';

export default [
  ...react,
  { ignores: ['dist/**', 'coverage/**', '*.cjs', 'tailwind.preset.cjs'] },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'vitest.setup.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
];
