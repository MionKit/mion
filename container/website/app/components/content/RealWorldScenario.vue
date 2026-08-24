<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Heading shown above the shared scenario. */
    title?: string;
  }>(),
  {title: 'The real-world scenario'},
);
</script>

<template>
  <div class="realworld">
    <h2 class="realworld-title">{{ title }}</h2>
    <slot />
  </div>
</template>

<style scoped>
.realworld {
  margin: 1rem 0 1.5rem;
}

.realworld-title {
  color: var(--ui-primary, #79af43);
}
</style>
