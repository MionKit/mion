module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'jest'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:jest/recommended'],
  parserOptions: {
    project: ['./packages/*/tsconfig.json'],
  },
  rules: {
    'no-empty-function': 'off',
    // 'jest/no-disabled-tests': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@mionkit/eslint-plugin/no-typeof-runtype': 'error',
  },
  overrides: [
    {
      files: ['**/*.routes.ts'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'error',
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
    },
  ],
};
