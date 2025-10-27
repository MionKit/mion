// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
   css: ['~/assets/css/mion.css'],
   app: {
    // baseURL: '/mion/', // working with github pages mionkit.github.io/mion/ - Remove when using mion.io
    buildAssetsDir: '_assets', // don't use "_" at the begining of the folder name to avoids nojkill conflict
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
  ]
})