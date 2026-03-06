import {defineConfig} from 'vitest/config';

export default defineConfig({
    resolve: {conditions: ['source']},
    ssr: {resolve: {conditions: ['source']}},
    test: {
        name: 'starter',
        globals: true,
        environment: 'node',
        include: ['cli/**/*.spec.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['cli/**'],
        },
    },
});
