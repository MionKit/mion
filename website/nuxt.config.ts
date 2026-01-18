import { processCodeImports } from './server/utils/code-import'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  site: {
    name: 'mion',
  },
  css: [
    '~/assets/css/mion.css',
  ],
  app: {
    // baseURL: '/mion/', // working with github pages mionkit.github.io/mion/ - Remove when using mion.io
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
  hooks: {
    'content:file:beforeParse'(ctx) {
      const { file } = ctx

      if (!file.id.endsWith('.md')) return

      file.body = processCodeImports(file.body)
    }
  }
})