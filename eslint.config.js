import js from '@eslint/js';
import globals from 'globals';

// Bug-finding lint for the zero-build app: undefined references, unused values, unreachable code, bad comparisons.
// It is a dev tool only; nothing here ships to the browser.
export default [
  { ignores: ['vendor/**', 'node_modules/**', 'coverage/**', '_site/**'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module', globals: { ...globals.browser } },
    rules: { 'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },
  {
    files: ['sw.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'script', globals: { ...globals.serviceworker } },
  },
  {
    files: ['tests/**/*.mjs', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }] },
  },
];
