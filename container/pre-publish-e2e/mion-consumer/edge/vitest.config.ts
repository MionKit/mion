import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// Compiles src/client.ts's batch as the Worker build did, so both sides agree on its id.
export default defineConfig({
    plugins: [mionVitePlugin({tsConfig: resolve(__dirname, 'tsconfig.json')})],
    test: {
        environment: 'node',
        include: ['test/edge.spec.ts'],
        testTimeout: 60000,
    },
});
