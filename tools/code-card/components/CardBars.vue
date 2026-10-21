<script setup lang="ts">
// Before / after bars, one CardBar per row, with a legend naming the two sides.
withDefaults(defineProps<{before?: string; after?: string}>(), {before: 'before', after: 'after'});
defineSlots<{default(): unknown}>();
</script>

<template>
  <div class="cc-bars">
    <slot />
    <div class="cc-legend">
      <span><i class="cc-before"></i>{{ before }}</span><span><i class="cc-after"></i>{{ after }}</span>
    </div>
  </div>
</template>
