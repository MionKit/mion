// mion.io's own files: its app config and its one page. ONLY mion.io extends this layer, listed FIRST.
// Another site never does: it would take mion.io's name, links and the playground route.
export default defineNuxtConfig({
  $meta: { name: 'mion-io' },
})
