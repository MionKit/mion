<script setup lang="ts">
// Overrides Docus' AppHeaderCenter.vue (only the search button) to add the subsite menu and a site's menu slot.
// Rendered on every page, landing pages included, so a reader can always switch subsite.
</script>

<template>
  <div class="site-header-center">
    <SubsiteMenu />
    <AppHeaderMenu />
    <UContentSearchButton
      :collapsed="false"
      class="site-search"
      variant="soft"
      :ui="{
        leadingIcon: 'size-4 mr-1',
      }"
    />
  </div>
</template>

<style scoped>
.site-header-center {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
}

.site-search {
  flex: 1;
  min-width: 0;
}
</style>
