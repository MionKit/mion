import {defineConfig} from 'vite';
import {resolve} from 'path';

/**
 * Vite configuration for test-publish package.
 * This config ensures consistent module resolution with the Vitest config.
 * All @mionjs/* packages resolve to their built .dist folders.
 */
export default defineConfig({
    resolve: {
        alias: {
            '@mionjs/core': resolve(__dirname, '../core/.dist/esm'),
            '@mionjs/run-types': resolve(__dirname, '../run-types/.dist/esm'),
            '@mionjs/type-formats': resolve(__dirname, '../type-formats/.dist/esm'),
            '@mionjs/router': resolve(__dirname, '../router/.dist/esm'),
            '@mionjs/platform-node': resolve(__dirname, '../platform-node/.dist/esm'),
            '@mionjs/client': resolve(__dirname, '../client/.dist/esm'),
            '@mionjs/test-server': resolve(__dirname, '../test-server/.dist/esm'),
            '@mionjs/platform-aws': resolve(__dirname, '../platform-aws/.dist/esm'),
            '@mionjs/platform-gcloud': resolve(__dirname, '../platform-gcloud/.dist/esm'),
            '@mionjs/devtools': resolve(__dirname, '../devtools/.dist/esm'),
            '@mionjs/platform-bun': resolve(__dirname, '../platform-bun/.dist/esm'),
        },
    },
});
