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
      'packages/devtools/bin/**',
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
      'packages/run-types/**',
      'packages/ts-runtypes-bin/**',
      'packages/ts-runtypes-devtools/**',
      'packages/ts-runtypes-go-be-sidecar/**',
      'container/**',
      'ts-go-runtypes/**',
      'docs/**',
      'plans/**',
      'bin/**',
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
