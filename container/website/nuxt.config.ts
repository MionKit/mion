import { fileURLToPath } from 'node:url'
import { processCodeImports, processMarkdownImports, exampleWatcherPlugin } from './server/utils/code-import'
import { processFunctionCatalog } from './server/utils/function-catalog'

const isDev = process.env.NODE_ENV !== 'production'

// Bind-mounted source on macOS/VM container hosts doesn't deliver fs events into
// the container, so native watchers never fire. MION_WEBSITE_POLL=1 sets this env
// (see scripts/website/site.mjs) to make the watchers poll instead.
const usePolling = process.env.CHOKIDAR_USEPOLLING === 'true'

// Dist vendored by scripts/build-playground.mjs, not the repo mount: Vite's dev server only serves the project root.
// Dist, not src: Vite's per-file TS transpile breaks on type-only re-exports in dev.
// The resolver's source overlay is a separately fetched static asset, not one of these aliases.
// The relative path resolves the same in the container and on a host.
const rtDist = fileURLToPath(new URL('./app/playground/.vendor/ts-runtypes-dist', import.meta.url))

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // ONE site, THREE subsites (/rpc, /runtypes, /benchmarks): see app/utils/subsites.ts.
  // `url` is what canonical links, the sitemap and the og:url tags are built from.
  site: {
    name: 'mion',
    url: 'https://mion.io',
  },
  css: [
    '~/assets/css/mion.css',
    '@shikijs/twoslash/style-rich.css',
  ],
  app: {
    buildAssetsDir: '_assets', // don't use "_" at the beginning of the folder name to avoid nojekyll conflict
  },
  colorMode: {
    preference: 'dark'
  },
  modules: [
    "@nuxt/content",
    "@nuxt/eslint",
    "@nuxt/image",
    "@nuxt/scripts",
    "@nuxt/ui"
  ],
  content: {
    watch: {
      enabled: isDev
    }
  },
  vite: {
    server: usePolling ? { watch: { usePolling: true, interval: 300 } } : {},
    plugins: isDev ? [exampleWatcherPlugin(usePolling)] : [],
    resolve: {
      alias: [
        { find: /^@mionjs\/run-types\/formats$/, replacement: `${rtDist}/formats/index.js` },
        { find: /^@mionjs\/run-types\/mocking$/, replacement: `${rtDist}/mocking/index.js` },
        { find: /^@mionjs\/run-types$/, replacement: `${rtDist}/index.js` }
      ]
    },
    // Monaco is loaded lazily (client-only); its language-service workers are wired
    // via Vite's `?worker` imports in PlaygroundStage.client.vue. Keep it out of
    // dep pre-bundling - its optional worker entry points break optimizeDeps.
    optimizeDeps: { exclude: ['monaco-editor'] }
  },
  nitro: {
    // The subsite landing pages are reachable from the root page, so the crawler
    // would find them; listing them keeps the build honest if that page changes.
    prerender: {
      routes: ['/rpc', '/runtypes', '/benchmarks'],
    },
    output: {
      publicDir: '.output/public'
    }
  },
  hooks: {
    'content:file:beforeParse'(ctx) {
      const { file } = ctx
      if (!file.id.endsWith('.md')) return
      // markdown-import first: an inlined document may itself contain
      // <code-import> blocks, and those must still be processed.
      file.body = processMarkdownImports(file.body, isDev)
      file.body = processCodeImports(file.body, isDev)
      file.body = processFunctionCatalog(file.body)
    }
  }
})