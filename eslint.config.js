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
      'packages/private-examples/**',
      'scripts/**',
      '**/vite.config.ts',
      // Per-target vite configs sit outside every package tsconfig, so the type-aware parser cannot load them.
      '**/vite.*.config.ts',
      '**/vitest.config.ts',
      '**/eslint.config.ts',
      '**/eslint.config.mjs',
      '**/bun-preload.ts',
      '**/globalSetup.ts',
      'eslint.config.js',
      // oxlint owns these and the `runtypes/*` rules; mion's route-shape rules here mean nothing over there.
      // devtools is mostly transform code, and oxlint's ignorePatterns keep its mion half covered there.
      'packages/run-types/**',
      'packages/bin-compiler/**',
      'packages/devtools/**',
      'packages/private-go-be-sidecar/**',
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
      // Tests build throwing handlers on purpose, to pin the thrown-to-undeclared-slot path,
      // and untyped ones to pin what the router does with a route that declares nothing.
      '@mionjs/no-throw-in-handlers': 'off',
      '@mionjs/strong-typed-routes': 'off',
    },
  }
);
