import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import mionPlugin from '@mionkit/devtools/eslint';

const mionRules = {
  '@mionkit/no-typeof-runtype': 'error',
  '@mionkit/strong-typed-routes': 'error',
  '@mionkit/no-unreachable-union-types': 'error',
  '@mionkit/no-type-imports': 'error',
};

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
      'packages/codegen/bin/**',
      'packages/examples/**',
      'packages/quick-start/**',
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
  {
    plugins: {
      '@mionkit': mionPlugin,
    },
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        project: ['./packages/*/tsconfig.json'],
      },
    },
    rules: {
      'no-empty-function': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      ...mionRules,
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
