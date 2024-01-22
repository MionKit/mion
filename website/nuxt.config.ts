export default defineNuxtConfig({
    // https://github.com/nuxt-themes/docus
    extends: '@nuxt-themes/docus',

    css: ['~/assets/css/mion.css', '~/node_modules/billboard.js/dist/billboard.css'],

    app: {
        // baseURL: '/mion/', // working with github pages mionkit.github.io/mion/ - Remove when using mion.io
        buildAssetsDir: '_assets', // don't use "_" at the begining of the folder name to avoids nojkill conflict
    },

    colorMode: {
        preference: 'dark'
    },

    modules: [
        // https://github.com/nuxt-modules/plausible
        '@nuxtjs/plausible',
        // https://github.com/nuxt/devtools
        '@nuxt/devtools',
    ],

    // plugins: ['@/plugins/vue-typed'],
});
