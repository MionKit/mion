import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/fixtures/**',
      '**/shared-fixtures/**',
      '**/coverage/**',
      '**/__snapshots__/**',
      '**/.dist/**',
      'eslint.config.js',
      // The runtypes example files share src/ but belong to the runtypes
      // program: tsconfig.runtypes.json type-checks them (root typecheck).
      // TODO(step 3): unify linting.
      'src/enrich/**',
      'src/guide/**',
      'src/suites/**',
      'src/_homepage/define-builder.ts',
      'src/_homepage/define-type.ts',
      'src/_homepage/formats-builder.ts',
      'src/_homepage/formats-type.ts',
      'src/_homepage/json-roundtrip.ts',
      'src/_homepage/reflection-value.ts',
      'src/_homepage/reflection.ts',
      'src/_homepage/showcase.ts',
      'src/introduction/manual-install-vite-config.ts',
      'src/introduction/one-type-one-id.ts',
      'src/introduction/quick-start-next-config.ts',
      'src/introduction/quick-start-rollup-config.ts',
      'src/introduction/quick-start-validate.ts',
      'src/introduction/quick-start-vite-config.ts',
      'src/introduction/whatis-duality.ts',
      'src/introduction/whatis-reflection.ts',
      'src/introduction/whatis-taste.ts',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
    rules: {
      'no-empty-function': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    files: ['**/*.routes.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      'no-unused-vars': 'off',
      'no-unused-expressions': 'off',
    },
  }
);
