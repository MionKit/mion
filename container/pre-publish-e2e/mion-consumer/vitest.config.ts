import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// The round-trip lane. Vitest hosts the vite pipeline, so the PUBLISHED mion plugin
// transforms the specs and the server entry: it rewrites the marker call sites through
// the published @mionjs/devtools (which resolves and spawns the platform binary via
// the published @mionjs/bin-compiler launcher), writes the batches and their inline inputFrom
// mappers into .mion/rpc/batches.generated.js for the server (same root, so no pointer is
// needed). globalSetup.ts then starts that server in THIS process: one program, one resolver.
// Nothing here points at a workspace path — every one of those pieces came out of a
// tarball verdaccio served.
export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(__dirname, 'tsconfig.json'),
      },
    }),
  ],
  test: {
    environment: 'node',
    include: [
      'src/tests/json.spec.ts',
      'src/tests/compact.spec.ts',
      'src/tests/drizzle-refine.spec.ts',
      'src/tests/packaged-sources.spec.ts',
      'src/tests/lint-transport.spec.ts',
    ],
    testTimeout: 60000,
    maxWorkers: 1,
    globalSetup: ['./globalSetup.ts'],
  },
});
