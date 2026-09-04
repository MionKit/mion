<script setup lang="ts">
// Two code blocks side by side: the client call on the left, the routes it calls on
// the right. Both columns share the height of the taller one. Falls back to one
// column on narrow screens.
</script>

<template>
  <div class="code-split">
    <slot />
  </div>
</template>

<style>
.code-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: stretch;
  margin: 1.25rem 0;
}

.code-split > * {
  min-width: 0;
  margin: 0 !important;
  display: flex;
  flex-direction: column;
}

/* the shorter block grows to match the taller one, a longer one scrolls */
.code-split > * > pre {
  flex: 1;
  overflow: auto;
}

.code-split :is(pre, code) {
  font-size: 0.78rem;
  line-height: 1.55;
}

@media (max-width: 1023px) {
  .code-split {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
