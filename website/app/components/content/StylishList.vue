<script setup lang="ts">
const props = defineProps({
  /**
   * The style type for the list icons
   * - 'info': renders info icons with bluish color scheme
   * - 'check': renders checkmark icons with greenish color scheme
   */
  type: {
    type: String as () => 'info' | 'check',
    default: 'check',
  },
})

// Compute color class based on type
const colorClass = computed(() => {
  return props.type === 'info' ? 'stylish-list--info' : 'stylish-list--check'
})
</script>

<template>
  <div :class="['stylish-list', colorClass]">
    <slot />
  </div>
</template>

<style>
.stylish-list {
  margin: 1rem 0;
}

.stylish-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.stylish-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.5rem 0;
  line-height: 1.5;
  margin: 0;
}

/* Add icon before each list item using CSS */
.stylish-list li::before {
  content: '';
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  margin-top: 0.125rem;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

/* Check style - greenish color scheme with checkmark icon */
.stylish-list--check li::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2322c55e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 11.08V12a10 10 0 1 1-5.93-9.14'/%3E%3Cpolyline points='22 4 12 14.01 9 11.01'/%3E%3C/svg%3E");
}

:root.dark .stylish-list--check li::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234ade80' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 11.08V12a10 10 0 1 1-5.93-9.14'/%3E%3Cpolyline points='22 4 12 14.01 9 11.01'/%3E%3C/svg%3E");
}

/* Info style - bluish color scheme with info icon */
.stylish-list--info li::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='12' y1='16' x2='12' y2='12'/%3E%3Cline x1='12' y1='8' x2='12.01' y2='8'/%3E%3C/svg%3E");
}

:root.dark .stylish-list--info li::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2360a5fa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='12' y1='16' x2='12' y2='12'/%3E%3Cline x1='12' y1='8' x2='12.01' y2='8'/%3E%3C/svg%3E");
}

/* Highlighted text within list items */
.stylish-list .text-highlighted {
  color: var(--ui-primary);
  font-weight: 500;
}
</style>
