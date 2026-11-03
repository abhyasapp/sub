// Deliberately lenient: Abhyas is a classic-script app built on shared globals,
// so `no-undef` / `no-unused-vars` would drown real findings. This config only
// flags things that are almost always genuine bugs. Tighten it over time.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'coverage/**', 'dist/**', 'tools/vendor/**'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js', 'sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.serviceworker },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }], // empty catch blocks are tolerated; other empty blocks are not
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',       // the one intended use is annotated in js/core/actions.js
      'no-unreachable': 'error',
      'no-redeclare': 'off',        // shared globals are re-declared by design
      'no-inner-declarations': 'off',
      'no-prototype-builtins': 'off',
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
      'no-self-assign': 'warn',
      'no-cond-assign': ['error', 'except-parens'],
      eqeqeq: ['warn', 'smart'],
      'no-var': 'off',
    },
  },
  {
    files: ['tools/**/*.js', 'tools/**/*.mjs', 'tests/**/*.js', 'tests/**/*.mjs', 'vitest.config.mjs', 'eslint.config.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-unused-vars': 'warn' },
  },
  {
    files: ['tools/sites-worker.mjs'],
    languageOptions: { globals: { ...globals.browser, ...globals.serviceworker } },
  },
  { files: ['tools/audit-handlers.js'], languageOptions: { sourceType: 'commonjs' } },
];
