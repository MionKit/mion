import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/tests/aot-build.spec.ts'],
        testTimeout: 60000,
    },
});
