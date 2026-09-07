import { node } from '@carrental/config/eslint';

export default [
  ...node,
  { ignores: ['dist/**', 'coverage/**'] },
  {
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
];
