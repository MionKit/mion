import {defineConfig} from 'vitest/config';

// The mion-only project list, used by `test:ci` (the pull-requests.yml lane).
// Loading the FULL root config (vitest.config.ts) initializes every project
// config, and the runtypes ones import @ts-runtypes/devtools/vite from the
// workspace package's dist — which only exists after `pnpm run check:builds`
// (Go toolchain + submodules). The mion CI lane deliberately has none of that,
// so its batches load this config instead. `--project` filters do NOT prevent
// the other configs from loading, hence a separate file.
// TODO(step 6): retire when CI is unified.
export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  test: {
    projects: [
      'packages/core/vitest.config.ts',
      'packages/router/vitest.config.ts',
      'packages/client/vitest.config.ts',
      'packages/platform-aws/vitest.config.ts',
      'packages/platform-gcloud/vitest.config.ts',
      'packages/platform-node/vitest.config.ts',
      'packages/devtools/vitest.config.ts',
      'packages/drizzle/vitest.config.ts',
      'packages/platform-vercel/vitest.config.ts',
      'packages/platform-cloudflare/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**'],
    },
  },
});
