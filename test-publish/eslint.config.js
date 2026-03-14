import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import mionPlugin from '@mionjs/devtools/eslint';

const mionRules = {
  '@mionjs/no-typeof-runtype': 'error',
  '@mionjs/strong-typed-routes': 'error',
  '@mionjs/no-unreachable-union-types': 'error',
  '@mionjs/no-type-imports': 'error',
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
      '**/.dist/**',
      '**/build/**',
      '**/*.js',
      'eslint.config.js',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: {
      '@mionjs': mionPlugin,
    },
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
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
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {args: 'none'}],
      'no-unused-vars': ['warn', {args: 'none'}],
    },
  }
);
