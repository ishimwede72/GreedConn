'use strict';

/**
 * GREEDCON ESLint flat config (`npm run lint` -> `eslint .`).
 *
 * - `@eslint/js` recommended + `typescript-eslint` recommended for TS files.
 * - Stylistic/noisy rules are downgraded to `warn` so real correctness
 *   problems still fail the lint gate with exit code 1.
 * - Prettier stays a separate concern (no eslint-plugin-prettier).
 */

const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

/**
 * Globals available to plain JavaScript files (CommonJS package: esbuild.js,
 * this config). Flat config ships no implicit globals, so Node built-ins must
 * be declared explicitly for `no-undef`.
 */
const nodeGlobals = {
  __dirname: 'readonly',
  __filename: 'readonly',
  Buffer: 'readonly',
  clearImmediate: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  exports: 'writable',
  fetch: 'readonly',
  module: 'writable',
  process: 'readonly',
  queueMicrotask: 'readonly',
  require: 'readonly',
  setImmediate: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
};

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'media/**', 'node_modules/**', 'coverage/**', '**/*.vsix'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // TypeScript files: tsc already performs full type analysis, so the core
    // `no-undef` / `no-unused-vars` rules only produce false positives
    // (Node/DOM/VS Code globals, type-only imports).
    files: ['**/*.ts', '**/*.mts', '**/*.cts'],
    languageOptions: {
      globals: nodeGlobals,
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Plain JavaScript (esbuild.js, eslint.config.js): CommonJS + Node globals.
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: nodeGlobals,
    },
  },
  {
    // Noisy-but-not-correctness rules: keep the signal, avoid blocking CI on
    // style. Everything not listed here stays at its recommended severity
    // (i.e. an error).
    rules: {
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-empty-function': 'warn',
      'no-console': 'warn',
      // Intentional: security sanitizers build regexes that match control
      // characters on purpose (InputSanitizer), so this is a false positive.
      'no-control-regex': 'warn',
    },
  },
);
