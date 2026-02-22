import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        projects: [
            'packages/core/vitest.config.ts',
            'packages/run-types/vitest.config.ts',
            'packages/type-formats/vitest.config.ts',
            'packages/router/vitest.config.ts',
            'packages/client/vitest.config.ts',
            'packages/aws/vitest.config.ts',
            'packages/gcloud/vitest.config.ts',
            'packages/node/vitest.config.ts',
            'packages/devtools/vitest.config.ts',
            'packages/drizze/vitest.config.ts',
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['packages/*/src/**'],
        },
    },
});
