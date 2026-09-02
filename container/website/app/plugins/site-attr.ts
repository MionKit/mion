// Tags <html> with the subsite (`data-site`, what sites/<id>/theme.css keys its colours
// on) and <body> with a per-section class so CSS can control page width + TOC.
// Docus' `pageClass` frontmatter is inert in this setup, and there's no per-page DOM
// hook, so both are derived from the route. Reactive → rendered into the prerendered
// HTML (no colour flash) and updated on client navigation. The runtypes Introduction,
// Guide and AI pages go wide (reclaiming the TOC rail), and so does every subsite home
// (it carries a hero); benchmark pages stay normal width but lose the TOC too.
export default defineNuxtPlugin(() => {
  const route = useRoute()
  const {theme} = useSubsite()
  const sectionClass = computed(() => {
    const path = route.path
    if (/^\/(rpc|runtypes|benchmarks)\/home$/.test(path)) return 'rt-wide-page'
    if (/^\/runtypes\/(introduction|guide|ai-integration)(\/|$)/.test(path)) return 'rt-wide-page'
    if (/^\/benchmarks\/.+/.test(path)) return 'rt-flush-page'
    return ''
  })
  const site = computed(() => theme.value.id)
  useHead({htmlAttrs: {'data-site': site}, bodyAttrs: {class: sectionClass}})
})
