// Shared ESLint flat-config presets for the Car Rental System.
// - `base`      : TS rules for any package
// - `node`      : base + Node globals
// - `react`     : base + React/browser globals
// - `apiModuleBoundaries(modules)` : forbids deep cross-module imports in the NestJS monolith
//   (SRS-ARC-001, SRS-NFR-013). A module may import another module's PUBLIC surface only:
//   `modules/<name>` or `modules/<name>/<name>.public` — never `modules/<name>/infra/**` etc.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export const base = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { import: importPlugin },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'off',
      'import/no-duplicates': 'error',
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // Number.parseFloat(x) / anyObj.parseFloat(x) — callee is a MemberExpression.
          selector: "CallExpression[callee.property.name='parseFloat']",
          message: 'Money must use integer minor units (SRS-DAT-003). Do not parseFloat money.',
        },
        {
          // Bare parseFloat(x) — callee is an Identifier, so `.property` never matches above;
          // this was previously the more common spelling and went entirely unchecked.
          selector: "CallExpression[callee.name='parseFloat']",
          message: 'Money must use integer minor units (SRS-DAT-003). Do not parseFloat money.',
        },
      ],
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];

export const node = [...base, { languageOptions: { globals: { ...globals.node } } }];

export const react = [
  ...base,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: { 'no-console': ['warn', { allow: ['warn', 'error'] }] },
  },
];

/**
 * @param {string[]} modules  e.g. ['iam','config','catalogue',...]
 * @returns {import('eslint').Linter.Config[]}
 */
export function apiModuleBoundaries(modules) {
  return modules.map((mod) => ({
    files: [`src/modules/${mod}/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: modules
            .filter((other) => other !== mod)
            .map((other) => ({
              group: [
                `**/modules/${other}/*/**`,
                `@/modules/${other}/*/**`,
                `../${other}/*/**`,
                `../../${other}/*/**`,
              ],
              message: `Module '${mod}' may import only the public surface of '${other}' (modules/${other} or modules/${other}/${other}.public), not its internals. (SRS-ARC-001 / SRS-NFR-013)`,
            })),
        },
      ],
    },
  }));
}

export default { base, node, react, apiModuleBoundaries };
