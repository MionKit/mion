<script setup lang="ts">
// Overrides Docus' mobile menu, which renders the full navigation tree, so the phone gets the desktop's scoped
// sidebar: SubsiteMenu's entries, its columns (`shared.menuColumns`) stacked as headed groups, then only the current subsite's sections.
import type {ContentNavigationItem} from '@nuxt/content'

const {subsites, subsite, sidebar} = useSubsite()
const {shared} = useAppConfig()
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const columns = computed(() => menuColumns(subsites.value, shared.menuColumns).columns.map((column) => ({
  label: column.label,
  tabs: column.entries.map((entry) => ({
    label: entry.label,
    icon: entry.icon,
    to: entry.path,
    active: entry.id === subsite.value?.id,
  })),
})))

const sections = computed<ContentNavigationItem[]>(() => sidebar(navigation?.value))
</script>

<template>
  <div
    v-for="column in columns"
    :key="column.label ?? ''"
    class="mb-4"
  >
    <p
      v-if="column.label"
      class="mb-1 px-2.5 text-xs font-semibold uppercase tracking-wide text-muted"
    >
      {{ column.label }}
    </p>
    <UNavigationMenu
      :items="column.tabs"
      orientation="vertical"
      variant="pill"
      highlight
    />
  </div>

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
