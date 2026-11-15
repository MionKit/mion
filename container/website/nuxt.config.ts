// mion.io's identity on top of the shared layers; the shell goes LAST, so Docus stays the lowest layer.
export default defineNuxtConfig({
  extends: ['./site-layers/mion-io', './site-layers/parts', './site-layers/playground', './site-layers/shell'],
  // ONE site, three sections: see site-layers/shell/app/utils/subsites.ts.
  // `url` is what canonical links, the sitemap and the og:url tags are built from.
  site: {
    name: 'mion',
    url: 'https://mion.io',
  },
  app: {
    buildAssetsDir: '_assets', // don't use "_" at the beginning of the folder name to avoid nojekyll conflict
  },
  nitro: {
    // The crawler finds these from the root page today; listed so the build still covers them if that page changes.
    prerender: {
      routes: ['/rpc', '/runtypes', '/benchmarks'],
    },
  },
})
