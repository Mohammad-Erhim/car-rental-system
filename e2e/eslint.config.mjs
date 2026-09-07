import { node } from '@carrental/config/eslint';

export default [
  ...node,
  { ignores: ['test-results/**', 'playwright-report/**', 'blob-report/**'] },
];
