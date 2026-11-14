<!-- Local override of docus/app/components/docs/DocsAsideLeftBody.vue. Docus lists the
     current subsite's navigation tree, which leaves out the subsite home: it sits at the
     subsite root, not inside a section (app/utils/subsites.ts → subsiteSidebar). -->
<script setup lang="ts">
import type {ContentNavigationItem} from '@nuxt/content'

const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')
const {sidebar} = useSubsite()
const sections = computed(() => sidebar(navigation?.value))
</script>

<template>
  <UContentNavigation
    highlight
    :navigation="sections"
  />
</template>
