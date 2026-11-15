import { fileURLToPath } from 'node:url'
import { processFunctionCatalog } from './server/utils/function-catalog'

// mion's own building blocks another site may load: benchmark tables and charts, code cards,
// tiles, the diagnostics catalog, the mion logo and footer note, the mion page classes.
// It adds no route, no content and no site identity. List it BEFORE the shell layer.
export default defineNuxtConfig({
  $meta: { name: 'mion-parts' },
  css: [fileURLToPath(new URL('./app/assets/css/mion-pages.css', import.meta.url))],
  modules: [
    (_options, nuxt) => {
      nuxt.hook('content:file:beforeParse' as never, ((ctx: { file: { id: string, body: string } }) => {
        if (ctx.file.id.endsWith('.md')) ctx.file.body = processFunctionCatalog(ctx.file.body)
      }) as never)
      // Opt-in benchmark data: scripts/website/site.mjs mounts the site's `benchData` folder and sets this env.
      const benchData = process.env.MION_WEBSITE_BENCH_DATA
      if (benchData) {
        nuxt.options.nitro.publicAssets ||= []
        nuxt.options.nitro.publicAssets.push({ dir: benchData, baseURL: '/bench-data' })
      }
    },
  ],
})
