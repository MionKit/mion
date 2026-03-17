import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionPlugin} from '@mionjs/devtools/vite-plugin';

export default defineConfig({
    plugins: [
        mionPlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
                compilerOptions: {
                    sourceMap: true,
                },
            },
            server: {
                startScript: resolve(__dirname, 'src/server/server.ts'),
                viteConfig: resolve(__dirname, 'vite.server.config.ts'),
                runMode: 'childProcess',
                port: 8086,
            },
        }) as any,
    ],
    test: {
        environment: 'node',
        include: ['src/tests/json.spec.ts', 'src/tests/binary.spec.ts'],
        testTimeout: 30000,
        maxWorkers: 1,
        globalSetup: ['./globalSetup.ts'],
        env: {
            MION_TEST_SERVER_AUTO_START: 'false',
        },
    },
});
