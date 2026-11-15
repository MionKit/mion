<script setup lang="ts">
// Overrides Docus' mobile menu, which renders the full navigation tree, so the phone gets the desktop's scoped
// sidebar: SubsiteMenu's entries, then only the current subsite's sections.
import type {ContentNavigationItem} from '@nuxt/content'

const {subsites, subsite, sidebar} = useSubsite()
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const tabs = computed(() => subsites.value.map((entry) => ({
  label: entry.label,
  icon: entry.icon,
  to: entry.path,
  active: entry.id === subsite.value?.id,
})))

const sections = computed<ContentNavigationItem[]>(() => sidebar(navigation?.value))
</script>

<template>
  <UNavigationMenu
    :items="tabs"
    orientation="vertical"
    variant="pill"
    highlight
    class="mb-4"
  />

  <AppHeaderBodyMenu />

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
