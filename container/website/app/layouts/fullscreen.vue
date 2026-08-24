<script setup lang="ts">
// Minimal full-bleed layout for standalone tool pages (the playground). Its only
// job is to opt OUT of the docs layout (which renders the left nav + right TOC):
// the page content runs the full width, while the site's global header + footer
// (from the Docus app shell) still wrap it. Select via `definePageMeta({ layout:
// 'fullscreen' })`.
</script>

<template>
  <div class="rt-fullscreen">
    <slot />
  </div>
</template>

<style scoped>
.rt-fullscreen {
  width: 100%;
}
</style>
