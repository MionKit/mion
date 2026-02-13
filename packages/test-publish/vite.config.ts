import {defineConfig} from 'vite';
import {resolve} from 'path';

/**
 * Vite configuration for test-publish package.
 * This config ensures consistent module resolution with the Vitest config.
 * All @mionkit/* packages resolve to their built .dist folders.
 */
export default defineConfig({
    resolve: {
        alias: {
            '@mionkit/core': resolve(__dirname, '../core/.dist/esm'),
            '@mionkit/run-types': resolve(__dirname, '../run-types/.dist/esm'),
            '@mionkit/type-formats': resolve(__dirname, '../type-formats/.dist/esm'),
            '@mionkit/router': resolve(__dirname, '../router/.dist/esm'),
            '@mionkit/node': resolve(__dirname, '../node/.dist/esm'),
            '@mionkit/client': resolve(__dirname, '../client/.dist/esm'),
            '@mionkit/test-server': resolve(__dirname, '../test-server/.dist/esm'),
            '@mionkit/aws': resolve(__dirname, '../aws/.dist/esm'),
            '@mionkit/gcloud': resolve(__dirname, '../gcloud/.dist/esm'),
            '@mionkit/devtools': resolve(__dirname, '../devtools/.dist/esm'),
            '@mionkit/bun': resolve(__dirname, '../bun/.dist/esm'),
        },
    },
});
