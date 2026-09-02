<!-- Docus picks this component up by name for the header wordmark: one mion logo on
     every page, in its own fixed colour. The current subsite is named by the subsite
     menu button beside the search box (SubsiteMenu.vue), so nothing else sits here. -->
<template>
  <span class="site-brand">
    <MionLogo class="site-brand-logo" />
  </span>
</template>

<style scoped>
.site-brand {
  display: inline-flex;
  align-items: flex-end;
  /* a touch taller than the h-6 Docus hands the wordmark */
  height: 1.7rem;
}

.site-brand-logo {
  height: 100%;
  width: auto;
}
</style>
