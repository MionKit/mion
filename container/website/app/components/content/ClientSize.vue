<script setup lang="ts">
// The published @mionjs/client's bundled size, for the rpc home page.
//
// Measured by scripts/website/gen-client-size.mjs and imported (not fetched) so the
// real number is in the prerendered HTML: a size that hydrates from a placeholder is
// a visible flash on the fold.
//
// Renders an inline span, so a page can name it mid-sentence and keep the words that
// qualify the number (it is the package, not an app's cost) in the content tree.
import clientSize from '../../data/client-size.json'

const props = withDefaults(defineProps<{of?: 'gzipped' | 'minified'}>(), {of: 'gzipped'})

const bytes = computed(() => (props.of === 'minified' ? clientSize.client.minified : clientSize.client.gzipped))
// One decimal: the number moves by tens of bytes between releases and the extra digits read as noise.
const label = computed(() => `${(bytes.value / 1024).toFixed(1)} kB`)
</script>

<template>
  <span class="client-size">{{ label }}</span>
</template>

<style scoped>
.client-size {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ui-primary);
}
</style>
