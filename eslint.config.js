import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import mionESLintPlugin from '@mionjs/devtools/eslint';
import tsRuntypesESLint from '@ts-runtypes/devtools/eslint';

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
      'test-publish/**',
      'scripts/**',
      '**/vite.config.ts',
      '**/vitest.config.ts',
      '**/eslint.config.ts',
      '**/eslint.config.mjs',
      '**/bun-preload.ts',
      '**/globalSetup.ts',
      'website/**',
      'eslint.config.js',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  mionESLintPlugin.configs.recommended,
  // @ts-runtypes' 25 `runtypes/*` rules, at THEIR default severities -- a deliberate choice, not a
  // default we never looked at. Every `error` rule there marks output that is wrong or impossible
  // to generate (invalid-marker, {validate,json,binary}-non-serializable, format, non-enumerable,
  // invalid-override, the enrichment-file rules): the build would fail on them anyway, so finding
  // out at lint time is strictly earlier. Every `warn` rule describes something that still works
  // but silently drops or reshapes data (*-skipped-member, class-serializer, clone-shared-reference,
  // unknown-keys, redundant-marker, override-side-effect) -- worth reading, not worth blocking a
  // consumer's first build on. Nothing is downgraded: the whole set passes on this repo today.
  tsRuntypesESLint.configs.recommended,
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
