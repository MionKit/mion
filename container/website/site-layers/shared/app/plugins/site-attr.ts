// Sets <html data-site> (sites/<id>/theme.css keys on it) and a <body> width/TOC class from the route:
// Docus' `pageClass` frontmatter is inert here. Reactive, so it is prerendered (no colour flash) and follows navigation.
export default defineNuxtPlugin(() => {
  const route = useRoute()
  const {theme, subsites} = useSubsite()
  const {shared} = useAppConfig()
  const wide = shared.widePages.map((source) => new RegExp(source))
  const flush = shared.flushPages.map((source) => new RegExp(source))
  const sectionClass = computed(() => pageWidthClass(route.path, subsites.value, wide, flush))
  const site = computed(() => theme.value.id)
  useHead({htmlAttrs: {'data-site': site}, bodyAttrs: {class: sectionClass}})
})
