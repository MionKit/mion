<script setup lang="ts">
// Local override of docus/app/components/app/AppHeaderCenter.vue (which is only the
// search button): the subsite menu (SubsiteMenu, one button that opens the list of
// subsites), then the search button. Rendered in the header on every page, landing
// pages included, so a reader can always switch subsite.
</script>

<template>
  <div class="site-header-center">
    <SubsiteMenu />
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
