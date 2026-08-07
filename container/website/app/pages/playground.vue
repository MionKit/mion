<script setup lang="ts">
// Standalone, full-bleed playground page - intentionally OUTSIDE the docs reading
// flow (no left nav, no right TOC) and a sibling of the home page. It is a real
// Nuxt route using the minimal `fullscreen` layout. (Docus's content catch-all
// does not honor a per-page `layout` frontmatter - the docs sidebars are rendered
// by that catch-all, not a swappable layout - so the playground lives as its own
// page rather than a content/*.md entry. The site's global header + footer still
// wrap it.)
//
// The playground fills the FULL page width (no UContainer max-width / centering)
// so the three-column editor gets as much horizontal room as possible.
definePageMeta({ layout: 'fullscreen' });
useSeoMeta({
  title: 'Playground',
  description: 'Write a TypeScript type, a builder schema or a JSON Schema document and run its generated functions live in your browser.',
});
</script>

<template>
  <div class="rt-playground-page">
    <RuntypesPlayground />
  </div>
</template>

<style scoped>
.rt-playground-page {
  width: 100%;
  padding: 16px;
}
</style>

<!-- Global (not scoped): the playground component's own styles are global (nested
     under .rt-playground so its v-html'd code blocks are reachable), so the page
     overrides them the same way rather than via scoped :deep. Gated by
     .rt-playground-page so it only affects this page. Sizes the playground to fill
     the viewport between the global header/footer. -->
<style>
.rt-playground-page .rt-playground-embed {
  margin: 0;
}
.rt-playground-page .rt-playground .rtpg-layout {
  height: calc(100vh - 160px);
}
</style>
