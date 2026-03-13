import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

// Set test server port so the IPC child process uses the same port as the tests
process.env.MION_TEST_PORT = '8086';

export default defineConfig({
    // Browser-first resolution (client runs in browser by default, but also supports Node/SSR)
    resolve: {conditions: ['source']},
    ssr: {resolve: {conditions: ['source']}},
    plugins: [
        mionVitePlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
                compilerOptions: {
                    sourceMap: true,
                },
            },
            server: {
                startServerScript: resolve(__dirname, '../test-server/src/test-server.ts'),
                serverViteConfig: resolve(__dirname, '../test-server/vite.config.ts'),
                mode: 'IPC',
            },
            aotCaches: {
                customVirtualModuleId: 'client-mion-aot',
            },
        }) as any,
    ],
    test: {
        name: 'client',
        globals: true,
        environment: 'node',
        include: ['src/**/*.spec.ts'],
        exclude: ['src/aot/aotSSR.e2e.test.ts'],
        // Wait for the IPC-managed server to be ready before running tests
        globalSetup: './globalSetup.ts',
        // Prevent test-server from auto-starting when imported by test files
        env: {
            MION_TEST_SERVER_AUTO_START: 'false',
        },
        // Run tests sequentially to avoid conflicts with shared server
        maxWorkers: 1,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**'],
        },
    },
});
