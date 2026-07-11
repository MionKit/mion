<script setup lang="ts">
interface HoverItem {
  title: string
  class?: string
}

const props = defineProps({
  /** List of items with title and optional class to add to body on hover */
  items: {
    type: Array as () => HoverItem[],
    default: () => [],
  },
})

/** Adds the item's class to the body element on mouse enter */
function handleMouseEnter(item: HoverItem) {
  if (item.class) document.body.classList.add(item.class)
}

/** Removes the item's class from the body element on mouse leave */
function handleMouseLeave(item: HoverItem) {
  if (item.class) document.body.classList.remove(item.class)
}
</script>

<template>
  <ul class="hover-list">
    <li
      v-for="(item, index) in props.items"
      :key="index"
      class="hover-list__item"
      @mouseenter="handleMouseEnter(item)"
      @mouseleave="handleMouseLeave(item)"
    >
      {{ item.title }}
    </li>
  </ul>
</template>

<style>
.hover-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0.75rem 0;
}

.hover-list__item {
  display: inline-flex;
  align-items: center;
  padding: 0.375rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-green-300);
  background-color: transparent;
  border: 2px solid var(--color-green-300);
  border-radius: 0.375rem;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    transform 0.15s ease;
}

.hover-list__item:hover {
  background-color: var(--color-green-500);
  color: var(--ui-text-highlighted);
  transform: translateY(-1px);
}

/* Large screens: vertical layout with full-width items */
@media screen and (min-width: 1024px) {
  .hover-list {
    flex-direction: column;
    padding: 1rem 0;
  }

  .hover-list__item {
    width: 100%;
    justify-content: center;
  }
}
</style>
