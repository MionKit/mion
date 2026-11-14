import { fileURLToPath } from 'node:url'

// Dist vendored by scripts/build-playground.mjs, not the repo mount: Vite's dev server only serves what sits under the project.
// Dist, not src: Vite's per-file TS transpile breaks on type-only re-exports in dev.
const rtDist = fileURLToPath(new URL('./app/playground/.vendor/ts-runtypes-dist', import.meta.url))

// The RunTypes playground, opt-in: it aliases `@mionjs/run-types` for the whole site build and
// needs the assets scripts/build-playground.mjs stages (public/playground-app/, the vendored dist).
// It adds no route: a site renders <RuntypesPlayground /> on a page of its own.
export default defineNuxtConfig({
  $meta: { name: 'mion-playground' },
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
