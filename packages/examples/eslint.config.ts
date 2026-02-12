import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

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
