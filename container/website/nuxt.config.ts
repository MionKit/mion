// mion.io: the site's identity on top of the shared layers (site-layers/). The shell goes LAST,
// so Docus stays the lowest layer.
export default defineNuxtConfig({
  extends: ['./site-layers/parts', './site-layers/playground', './site-layers/shell'],
  // ONE site, THREE sections (/rpc, /runtypes, /benchmarks): see site-layers/shell/app/utils/subsites.ts.
  // `url` is what canonical links, the sitemap and the og:url tags are built from.
  site: {
    name: 'mion',
    url: 'https://mion.io',
  },
  app: {
    buildAssetsDir: '_assets', // don't use "_" at the beginning of the folder name to avoid nojekyll conflict
  },
  nitro: {
    // The section home pages are reachable from the root page, so the crawler
    // would find them; listing them keeps the build honest if that page changes.
    prerender: {
      routes: ['/rpc', '/runtypes', '/benchmarks'],
    },
  },
})
