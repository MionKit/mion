import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/tests/build-output.spec.ts'],
        testTimeout: 60000,
    },
});
