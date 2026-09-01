import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// The round-trip lane. Vitest hosts the vite pipeline, so the PUBLISHED mion plugin
// transforms the specs and the server entry: it rewrites the marker call sites through
// the published @mionjs/devtools (which resolves and spawns the platform binary via
// the published @mionjs/bin launcher), harvests the inline serverMapFrom mapper
// bodies into .mion/server-mappers.json, and spawns the server beside vitest with
// vite-node. Nothing here points at a workspace path — every one of those pieces came
// out of a tarball verdaccio served.
export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(__dirname, 'tsconfig.json'),
      },
      serverMappers: {emit: resolve(__dirname, '.mion/server-mappers.json')},
      server: {
        startScript: resolve(__dirname, 'src/server/server.ts'),
        viteConfig: resolve(__dirname, 'vite.server.config.ts'),
        runMode: 'childProcess',
        waitTimeout: 60000,
        env: {MION_TEST_PORT: '8086'},
      },
    }),
  ],
  test: {
    environment: 'node',
    include: [
      'src/tests/json.spec.ts',
      'src/tests/binary.spec.ts',
      'src/tests/packaged-sources.spec.ts',
      'src/tests/lint-transport.spec.ts',
    ],
    testTimeout: 60000,
    maxWorkers: 1,
    globalSetup: ['./globalSetup.ts'],
    env: {
      MION_TEST_SERVER_AUTO_START: 'false',
    },
  },
});
