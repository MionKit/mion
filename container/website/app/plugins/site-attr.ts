// Sets <html data-site> (sites/<id>/theme.css keys on it) and a <body> width/TOC class from the route:
// Docus' `pageClass` frontmatter is inert here. Reactive, so it is prerendered (no colour flash) and follows navigation.
export default defineNuxtPlugin(() => {
  const route = useRoute()
  const {theme} = useSubsite()
  const sectionClass = computed(() => {
    const path = route.path
    if (SUBSITES.some((subsite) => subsite.path === path)) return 'rt-wide-page'
    if (/^\/runtypes\/(introduction|guide)(\/|$)/.test(path)) return 'rt-wide-page'
    if (/^\/benchmarks\/.+/.test(path)) return 'rt-flush-page'
    return ''
  })
  const site = computed(() => theme.value.id)
  useHead({htmlAttrs: {'data-site': site}, bodyAttrs: {class: sectionClass}})
})
