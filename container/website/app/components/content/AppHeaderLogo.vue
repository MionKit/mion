<!-- Docus picks this component up by name for the header wordmark. One mion logo on
     every page, in its own fixed colour, followed by the current subsite's word
     (RPC | RunTypes | Benchmarks) in the subsite's accent colour, slightly smaller than
     the wordmark and sitting on its bottom edge. The root landing shows the logo alone. -->
<script setup lang="ts">
const {subsite} = useSubsite()
</script>

<template>
  <span class="site-brand">
    <MionLogo class="site-brand-logo" />
    <template v-if="subsite">
      <span
        class="site-brand-divider"
        aria-hidden="true"
      />
      <span class="site-brand-word">{{ subsite.label }}</span>
    </template>
  </span>
</template>

<style scoped>
.site-brand {
  display: inline-flex;
  align-items: flex-end;
  gap: 0.6rem;
  height: 1.5rem;
}

.site-brand-logo {
  height: 100%;
  width: auto;
}

.site-brand-divider {
  width: 1px;
  height: 1.1rem;
  margin-bottom: 0.1rem;
  background: var(--ui-border-accented);
}

.site-brand-word {
  /* slightly smaller than the wordmark, bottom aligned with it */
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.01em;
  padding-bottom: 0.12rem;
  color: var(--site-accent);
}
</style>
