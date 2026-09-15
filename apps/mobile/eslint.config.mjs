// `eslint-config-expo`'s flat-config export (`eslint-config-expo/flat.js`) isn't published until
// a version that tracks a much newer Expo SDK than this app pins to (8.0.1, the version matching
// SDK 51, only ships the legacy `.eslintrc` shape) — so this reuses the repo's own shared base
// preset (`@carrental/config/eslint`, already flat-config/ESLint 9 native) plus the two rule sets
// that preset doesn't cover for a React Native app: hooks-of-hooks and RN globals.
import { base } from '@carrental/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.node, __DEV__: 'readonly' },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    ignores: ['.expo/**', 'dist/**', 'node_modules/**', 'expo-env.d.ts', 'ios/**', 'android/**'],
  },
];
