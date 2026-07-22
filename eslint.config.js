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
      '**/mion-aot-template/**',
      '**/.dist/**',
      '**/build/**',
      '**/xyzSpec/**',
      '**/xyz-Template/**',
      'packages/devtools/bin/**',
      'packages/examples/**',
      'packages/test-publish/**',
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
      // Temporarily disabled until the upstream @ts-runtypes resolver fix ships.
      // Its ESLint lint path runs in inline-server mode, which ignores the
      // tsconfig's customConditions (["source"]), so source-only @mionjs/*
      // workspace types resolve to `any` and these two marker rules
      // false-positive across the monorepo (MKR007 + VE020/VL021). The same
      // types resolve correctly on the build/test path, so this is lint-only
      // noise, not a real defect. Re-enable after bumping to the fixed
      // @ts-runtypes release — see docs/todos/reenable-runtypes-marker-lint-rules.md
      'runtypes/invalid-marker': 'off',
      'runtypes/validate-skipped-member': 'off',
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
