// Tags <body> with a per-section class so CSS can control page width + TOC.
// Docus' `pageClass` frontmatter is inert in this setup, and there's no per-page
// DOM hook, so we derive one from the route: Introduction + Guide pages go wide
// (reclaiming the TOC rail), Benchmarks stay normal width but lose the TOC too.
// Reactive class → SSR-rendered and updated on client navigation.
export default defineNuxtPlugin(() => {
  const route = useRoute();
  const sectionClass = computed(() => {
    const path = route.path;
    if (/^\/(introduction|guide|ai-integration)(\/|$)/.test(path)) return 'rt-wide-page';
    if (/^\/benchmarks(\/|$)/.test(path)) return 'rt-flush-page';
    return '';
  });
  useHead({bodyAttrs: {class: sectionClass}});
});
