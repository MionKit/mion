import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { processCodeImports, processMarkdownImports, exampleWatcherPlugin } from './server/utils/code-import'
import { SITE, SITE_DIR } from './site.config'

const isDev = process.env.NODE_ENV !== 'production'

// Which of the two sites this build is. `#site` resolves the per-site dir at
// build time, so app/app.config.ts and the header logo pick up the right one
// without any runtime env lookup; the per-site public/ is layered over the
// shared one through nitro's publicAssets (the site's files win). The content
// tree is selected separately, in content.config.ts. See site.config.ts.
console.log(`[nuxt.config] building the '${SITE}' site (MION_SITE)`)

// Bind-mounted source on macOS/VM container hosts doesn't deliver fs events into
// the container, so native watchers never fire. MION_WEBSITE_POLL=1 sets this env
// (see scripts/website/site.mjs) to make the watchers poll instead.
const usePolling = process.env.CHOKIDAR_USEPOLLING === 'true'

// The playground engine (app/playground) imports the mion RUNTIME factories.
// The compiled DIST is VENDORED into the project (git-ignored, host-synced by
// container/website/scripts/build-playground.mjs) rather than aliased to the
// external repo-context mount, because Vite's dev server only serves modules inside
// the project root. Vendoring the dist (not src) means Vite serves plain ESM with
// no per-file TS transpile (which breaks on type-only re-exports in dev). Only
// `mion` and `@mionjs/run-types/formats` are aliased (exact-match regex); the
// resolver's source OVERLAY is a separately fetched static asset. The relative path
// resolves the same in the container and on a host.
const rtDist = fileURLToPath(new URL('./app/playground/.vendor/ts-runtypes-dist', import.meta.url))

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  site: {
    name: SITE === 'mion' ? 'mion' : 'mion',
  },
  alias: {
    '#site': SITE_DIR,
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
        { find: /^@mionjs\/run-types$/, replacement: `${rtDist}/index.js` }
      ]
    },
    // Monaco is loaded lazily (client-only); its language-service workers are wired
    // via Vite's `?worker` imports in PlaygroundStage.client.vue. Keep it out of
    // dep pre-bundling - its optional worker entry points break optimizeDeps.
    optimizeDeps: { exclude: ['monaco-editor'] }
  },
  nitro: {
    // Shared public/ (fonts, favicons, the generated bench-data + playground
    // bundle) plus the site's own assets (banners, _redirects). Nitro copies
    // every publicAssets dir into the static output, so both land in .output/public.
    publicAssets: [
      { dir: join(SITE_DIR, 'public') }
    ],
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
    }
  }
})