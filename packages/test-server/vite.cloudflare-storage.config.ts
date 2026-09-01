import {defineConfig} from 'vite';
import {resolve} from 'path';
// Import from source to ensure we use the latest code during development (not stale build artifacts)
import {mionVitePlugin} from '../devtools/src/mion/index.ts';

// The MODULES-worker bundle: the cloudflare storage server (D1 + Durable
// Objects). Separate from vite.cloudflare.config.ts because the two output
// FORMATS differ and cannot be reconciled — that one is an iife service worker,
// and a service worker cannot export a class, so it cannot host a Durable
// Object. Everything else here matches it knob for knob.
export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(__dirname, 'tsconfig.build.json'),
        // 'both' is REQUIRED for edge targets, exactly as in vite.cloudflare.config.ts:
        // the default 'code' ships each compiled fn as a source STRING that
        // @mionjs/run-types materializes with `new Function` on first use, and
        // workerd refuses that.
        emitMode: 'both',
        // Its own genDir, for the same reason the other bundles have theirs: the
        // builds in this package disagree on emitMode, so one shared `__runtypes`
        // means the last writer wins.
        genDir: resolve(__dirname, '__runtypes-cloudflare-storage'),
      },
    }),
  ],
  // `conditions: ['source']` — see vite.cloudflare.config.ts for why this is a
  // condition and not a directory alias map.
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  build: {
    lib: {
      entry: resolve(__dirname, 'src/test-server-cloudflare-storage.ts'),
      formats: ['es'],
      fileName: () => 'test-server-cloudflare-storage.js',
    },
    outDir: 'build',
    emptyOutDir: false,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      // workerd's own module, provided by the runtime. Bundling it is impossible
      // and externalising it is what lets `extends DurableObject` work.
      external: ['cloudflare:workers'],
      output: {format: 'es', inlineDynamicImports: true},
    },
  },
});
