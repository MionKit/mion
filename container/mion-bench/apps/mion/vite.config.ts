/* ########
 * 2026 mion · License: MIT
 * ######## */
// Builds the three mion server entries. The plugin drives the Go resolver over the
// route handlers and emits the validators / serializers their types imply, which is
// exactly the work a real mion app does at build time.
import {resolve} from 'node:path';
import {defineConfig} from 'vite';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [mionVitePlugin({runTypes: {tsConfig: resolve(import.meta.dirname, 'tsconfig.json')}})],
  // Deliberately NOT resolving the packages' `source` condition. Their raw TypeScript
  // needs the plugin's type-id injection, which only happens when the plugin builds
  // that package - consuming it here would load a @mionjs/core whose class serializers
  // were never registered, and the server dies on the first import. The built .dist is
  // also what a real consumer installs, so this measures the shipped code. The driver
  // rebuilds those dists from the current workspace before every run, so "built" never
  // means "stale".
  ssr: {
    // A vite SSR build externalizes every dependency by default, which would leave
    // the bundle importing @mionjs/* and @ts-runtypes/* by name at run time. They are
    // bind-mounted, not installed, and more importantly the point of this app is to
    // measure the workspace code INLINED the way a real production build ships it.
    noExternal: true,
    // The one exception: @mionjs/uws is a loader for a native .node addon it resolves
    // by its own path at run time, so it must stay a real import.
    external: ['@mionjs/uws'],
  },
  build: {
    ssr: true,
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    sourcemap: false,
    rollupOptions: {
      input: {
        'server-node': resolve(import.meta.dirname, 'server-node.ts'),
        'server-uws': resolve(import.meta.dirname, 'server-uws.ts'),
        'server-bun': resolve(import.meta.dirname, 'server-bun.ts'),
      },
      output: {format: 'es', entryFileNames: '[name].mjs', chunkFileNames: '[name]-[hash].mjs'},
      // Everything first-party is INLINED (that is the point - the bundle is the app
      // under test); only node builtins and the uws native loader stay external.
      external: [/^node:/, '@mionjs/uws'],
    },
  },
});
