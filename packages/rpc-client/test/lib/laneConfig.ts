/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// The client's bundled lane: the fetched lane's sources and test server (vitest.config.ts) with `bundleApi: true`, in its
// own program and genDir; its server runs in its own process (laneServer.ts) so it is the one this program compiled.
//
// `name` stays a literal in each config FILE: scripts/core/test-batches.mjs reads it as text.
export function laneVitestConfig({name}: {name: string}) {
  const lane = 'bundled';
  const packageRoot = resolve(__dirname, '../..');
  return defineConfig({
    resolve: {conditions: ['source']},
    ssr: {resolve: {conditions: ['source']}},
    environments: {__vitest__: {resolve: {conditions: ['source']}}},
    plugins: [
      mionVitePlugin({
        runTypes: {
          tsConfig: resolve(packageRoot, `tsconfig.${lane}.json`),
          genDir: resolve(packageRoot, `.mion-${lane}`),
        },
        bundleApi: true,
      }),
    ],
    test: {
      name,
      globals: true,
      environment: 'node',
      include: [`test/${lane}/**/*.spec.ts`],
      // The first entry runs this lane's test server; the second only removes its genDir on teardown
      globalSetup: ['./test/lib/laneServer.ts', '../../scripts/lib/vitest-clean-gendir.ts'],
      maxWorkers: 1,
    },
  });
}
