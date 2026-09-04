import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import mionESLintPlugin from '@mionjs/devtools/eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/jest.config.js',
      '**/fixtures/**',
      '**/shared-fixtures/**',
      '**/coverage/**',
      '**/__snapshots__/**',
      '**/.dist/**',
      '**/build/**',
      'packages/examples/**',
      'scripts/**',
      '**/vite.config.ts',
      // per-target build configs (vite.edge.config.ts, vite.eslint.config.ts, …) sit
      // outside every package tsconfig, so the type-aware parser cannot load them
      '**/vite.*.config.ts',
      '**/vitest.config.ts',
      '**/eslint.config.ts',
      '**/eslint.config.mjs',
      '**/bun-preload.ts',
      '**/globalSetup.ts',
      'eslint.config.js',
      // The runtypes packages are linted by oxlint, which owns the `runtypes/*`
      // rules for the whole repo; this config carries mion's own plugin rules
      // (strong-typed-routes and friends), which mean nothing over there.
      //
      // packages/devtools is on that side of the line since the two devtools
      // packages merged: the bulk of it is the transform, and mion's own rules
      // (route shapes) say nothing about plugin code. oxlint's ignorePatterns do
      // not exclude it, so the mion half that used to be linted here is linted
      // there instead rather than going uncovered.
      'packages/run-types/**',
      'packages/bin-compiler/**',
      'packages/devtools/**',
      'packages/go-be-sidecar/**',
      'container/**',
      'ts-go-runtypes/**',
      'docs/**',
      'plans/**',
      'mion-bin/**',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  mionESLintPlugin.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-empty-function': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['**/*.routes.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {args: 'none'}],
      'no-unused-vars': ['warn', {args: 'none'}],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {args: 'none'}],
      'no-unused-vars': ['warn', {args: 'none'}],
    },
  }
);
