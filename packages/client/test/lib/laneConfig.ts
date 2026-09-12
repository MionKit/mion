/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';
import type {BundleApiMode} from '../../src/types.ts';

// A bundleApi lane of the client: the same client sources and the same in-process test server as the
// fetched-lane project (vitest.config.ts), built with the mode this lane is named after, so every
// route its specs call comes in with its call site. Each lane gets its own program and its own
// genDir to keep it apart from the others, and its test server runs in a process of its own
// (laneServer.ts), so it is the server that lane's program compiled.
//
// `name` is passed in rather than derived: scripts/core/test-batches.mjs reads the project name out
// of each config FILE as text, so it has to stay a literal there.
export function laneVitestConfig({mode, name}: {mode: BundleApiMode; name: string}) {
  const packageRoot = resolve(__dirname, '../..');
  return defineConfig({
    resolve: {conditions: ['source']},
    ssr: {resolve: {conditions: ['source']}},
    environments: {__vitest__: {resolve: {conditions: ['source']}}},
    plugins: [
      mionVitePlugin({
        runTypes: {
          tsConfig: resolve(packageRoot, `tsconfig.${mode}.json`),
          genDir: resolve(packageRoot, `.mion-${mode}`),
        },
        bundleApi: mode,
      }),
    ],
    test: {
      name,
      globals: true,
      environment: 'node',
      include: [`test/${mode}/**/*.spec.ts`],
      // First entry starts and stops this lane's own test server; the second is teardown-only and
      // removes the lane's genDir after the run
      globalSetup: ['./test/lib/laneServer.ts', '../../scripts/lib/vitest-clean-gendir.ts'],
      maxWorkers: 1,
    },
  });
}
