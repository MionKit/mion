import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// The plugin compiles test/client.ts's batch the same way the Worker build saw it, so both sides agree on its id.
export default defineConfig({
    plugins: [mionVitePlugin({tsConfig: resolve(__dirname, 'tsconfig.json')})],
    test: {
        environment: 'node',
        include: ['test/edge.spec.ts'],
        testTimeout: 60000,
    },
});
