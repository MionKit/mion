import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  plugins: [
    // Needed by src/runtypes/* specs + the errors.ts class-serializer registration call site:
    // the @mionjs/devtools plugin injects the marker payloads at build time.
    // failOnError defaults to false in mionVitePlugin (see its comment): the adapter's
    // pure-fn helpers wrap mion marker APIs with runtime keys, producing expected
    // non-fatal CTA003/PFN001 diagnostics.
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(__dirname, 'tsconfig.json'),
      },
    }),
  ],
  test: {
    name: 'core',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // teardown-only: removes the .mion genDir the runtypes transform writes during the run
    globalSetup: ['../../scripts/lib/vitest-clean-gendir.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
});
