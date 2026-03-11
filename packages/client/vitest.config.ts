import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

export default defineConfig({
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
            aotCaches: {
                startServerScript: resolve(__dirname, '../router/src/defaultRoutes.ts'),
                serverViteConfig: resolve(__dirname, '../router/vite.config.ts'),
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
        globalSetup: './globalSetup.ts',
        // Prevent test-server from auto-starting when imported
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
