<script setup lang="ts">
// Local override of docus/app/components/app/AppHeaderCenter.vue (which is only the
// search button): the subsite tabs, then the search button. Rendered in the header on
// every page, landing pages included, so a reader can always switch subsite.
const route = useRoute()
const items = computed(() => SUBSITES.map((subsite) => ({
  label: subsite.label,
  to: subsite.path,
  active: isInSubsite(route.path, subsite),
})))
</script>

<template>
  <div class="site-header-center">
    <UNavigationMenu
      :items="items"
      variant="pill"
      highlight
      class="site-tabs"
    />
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
