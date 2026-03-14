import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import mionPlugin from '@mionjs/devtools/eslint';

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
      'packages/run-types/microbenchs/**',
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
  mionPlugin.configs.recommended,
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
