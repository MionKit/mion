import { fileURLToPath } from 'node:url'

// Vendored by scripts/build-playground.mjs, not the repo mount: Vite's dev server only serves files under the project.
// Dist, not src: Vite's per-file TS transpile breaks on type-only re-exports in dev.
const rtDist = fileURLToPath(new URL('./app/playground/.vendor/ts-runtypes-dist', import.meta.url))

// mion.io's own files: its app config, the playground and its page. ONLY mion.io extends this layer, listed FIRST.
// Another site never does: it would take mion.io's name, links and the playground route, and the alias below
// swaps `@mionjs/run-types` for the WHOLE site build.
export default defineNuxtConfig({
  $meta: { name: 'mion-io' },
  vite: {
    resolve: {
      alias: [
        { find: /^@mionjs\/run-types\/formats$/, replacement: `${rtDist}/formats/index.js` },
        { find: /^@mionjs\/run-types\/mocking$/, replacement: `${rtDist}/mocking/index.js` },
        { find: /^@mionjs\/run-types$/, replacement: `${rtDist}/index.js` },
      ],
    },
    // Monaco is loaded lazily (client-only); its language-service workers are wired
    // via Vite's `?worker` imports in PlaygroundStage.client.vue. Keep it out of
    // dep pre-bundling - its optional worker entry points break optimizeDeps.
    optimizeDeps: { exclude: ['monaco-editor'] },
  },
})
