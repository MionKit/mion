import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// Standalone config for the fuzz UNIT tests. Unlike the package's main
// vitest.config.ts it installs NO ts-runtypes-devtools — the fuzz core
// (seeded RNG, invalid-value switch, mutation walker) is pure TS over
// hand-built RunType graphs, so it runs without the Go binary. The
// integration spec (fuzz.integration.test.ts) uses real factories and runs
// under the package config instead.
const here = fileURLToPath(new URL('.', import.meta.url));
const packageRoot = resolve(here, '../..');

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'fuzz-unit',
    include: ['test/fuzz/**/*.unit.test.ts'],
    environment: 'node',
    globals: true,
  },
});
