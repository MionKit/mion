<!-- Docus picks this component up by name for the header wordmark. One mion logo on
     every page, in its own fixed colour, followed by the current subsite's word
     (RPC | RunTypes | Benchmarks) in bold and in the subsite's accent colour, slightly
     smaller than the wordmark and sitting on its bottom edge. The root landing shows
     the logo alone. -->
<script setup lang="ts">
const {subsite} = useSubsite()
</script>

<template>
  <span class="site-brand">
    <MionLogo class="site-brand-logo" />
    <span
      v-if="subsite"
      class="site-brand-word"
    >{{ subsite.label }}</span>
  </span>
</template>

<style scoped>
.site-brand {
  display: inline-flex;
  align-items: flex-end;
  gap: 0.5rem;
  /* a touch taller than the h-6 Docus hands the wordmark */
  height: 1.7rem;
}

.site-brand-logo {
  height: 100%;
  width: auto;
}

.site-brand-word {
  /* slightly smaller than the wordmark, bottom aligned with it */
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.01em;
  color: var(--site-accent);
}
</style>
