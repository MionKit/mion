<script setup lang="ts">
// Local override of docus/app/components/app/AppHeaderBody.vue, the mobile menu. Docus
// renders the FULL navigation tree there (every subsite nested); this one renders the
// subsite list (the same entries the header's SubsiteMenu popup shows, with their
// icons) and then only the current subsite's sections, so the phone menu is the same
// scoped sidebar the desktop shows.
import type {ContentNavigationItem} from '@nuxt/content'

const route = useRoute()
const {subsite} = useSubsite()
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const tabs = computed(() => SUBSITES.map((entry) => ({
  label: entry.label,
  icon: entry.icon,
  to: entry.path,
  active: isInSubsite(route.path, entry),
})))

const sections = computed<ContentNavigationItem[]>(() => {
  if (!subsite.value || !navigation?.value) return []
  return navigation.value.find((item) => item.path === subsite.value?.path)?.children ?? []
})
</script>

<template>
  <UNavigationMenu
    :items="tabs"
    orientation="vertical"
    variant="pill"
    highlight
    class="mb-4"
  />
  <USeparator
    v-if="sections.length"
    class="mb-4"
  />
  <UContentNavigation
    v-if="sections.length"
    highlight
    variant="link"
    :navigation="sections"
  />
</template>
