import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { addVitePlugin } from 'nuxt/kit'
import { processCodeImports, processMarkdownImports, exampleWatcherPlugin } from './server/utils/code-import'
import { loadExampleTool } from './server/utils/repo-root'
import { processFunctionCatalog } from './server/utils/function-catalog'
import { layerOrderProblem } from './layer-order'

const isDev = process.env.NODE_ENV !== 'production'

// Bind mounts on macOS/VM hosts deliver no fs events into the container: scripts/website/site.mjs sets this to poll.
const usePolling = process.env.CHOKIDAR_USEPOLLING === 'true'

// Everything both sites use: Docus, the look, the section menu, the example tool, benchmark tables, cards, tiles.
// It carries NO site identity (name, address, routes, content): the consuming site sets those.
export default defineNuxtConfig({
  $meta: { name: 'mion-shared' },
  extends: ['docus'],
  css: [
    // Order matters: mion-pages.css overrides rules of shell.css with the same weight.
    fileURLToPath(new URL('./app/assets/css/shell.css', import.meta.url)),
    '@shikijs/twoslash/style-rich.css',
    fileURLToPath(new URL('./app/assets/css/mion-pages.css', import.meta.url)),
  ],
  colorMode: {
    preference: 'dark',
  },
  modules: [
    '@nuxt/content',
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/scripts',
    '@nuxt/ui',
    (_options, nuxt) => {
      const orderProblem = layerOrderProblem(nuxt.options._layers.map((layer) => layer.config.rootDir))
      if (orderProblem) throw new Error(orderProblem)

      // Section links that start with the site's own address become local links (app/utils/subsites.ts).
      const siteUrl = (nuxt.options as { site?: { url?: string } }).site?.url
      const appConfig = nuxt.options.appConfig as { shell?: { origin?: string } }
      appConfig.shell = { origin: siteUrl ?? '', ...appConfig.shell }

      // The example tool's values come from the consuming site's website.config.json.
      const tool = loadExampleTool(nuxt.options.rootDir)
      nuxt.options.runtimeConfig.exampleTool = tool
      nuxt.hook('content:file:beforeParse' as never, ((ctx: { file: { id: string, body: string } }) => {
        const { file } = ctx
        if (!file.id.endsWith('.md')) return
        // markdown-import first: an inlined document may itself contain <code-import> blocks.
        file.body = processMarkdownImports(tool, file.body, isDev)
        file.body = processCodeImports(tool, file.body, isDev)
        file.body = processFunctionCatalog(file.body)
      }) as never)
      if (isDev) addVitePlugin(exampleWatcherPlugin(tool, join(nuxt.options.rootDir, 'content'), usePolling))

      // Opt-in benchmark data: scripts/website/site.mjs mounts the site's `benchData` folder and sets this env.
      const benchData = process.env.MION_WEBSITE_BENCH_DATA
      if (benchData) {
        nuxt.options.nitro.publicAssets ||= []
        nuxt.options.nitro.publicAssets.push({ dir: benchData, baseURL: '/bench-data' })
      }
    },
  ],
  content: {
    watch: {
      enabled: isDev,
    },
  },
  vite: {
    server: usePolling ? { watch: { usePolling: true, interval: 300 } } : {},
  },
  nitro: {
    // scripts/website/site.mjs copies /app/.output out of the container.
    output: {
      publicDir: '.output/public',
    },
  },
})
