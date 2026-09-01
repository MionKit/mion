<!-- Docus picks this component up by name for the header wordmark. The actual
     mark is per site: `#site` is aliased in nuxt.config.ts to sites/<MION_SITE>,
     so only the selected site's logo is bundled. -->
<script setup>
import SiteLogo from '#site/Logo.vue';
</script>

<template>
  <SiteLogo />
</template>
