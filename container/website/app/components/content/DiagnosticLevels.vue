<script setup lang="ts">
/** The three diagnostic levels as cards; the badge classes are shared with the catalog. */
const levels = [
  {
    key: 'error',
    label: 'Error',
    text: 'The build could not produce the code at all, so there is nothing to ship for that piece. It stops that piece of the build everywhere, and nothing you can set or write stands one down.',
  },
  {
    key: 'runtime',
    label: 'RuntimeError',
    text: 'An error too: the code is written, but it throws when called or no longer checks what you asked for. It blocks a production bundle, while a dev server reports it and keeps running. You can stand one down with a comment or a setting.',
  },
  {
    key: 'warning',
    label: 'Warning',
    text: 'Worth knowing, nothing is wrong. Usually a member with no data form (a method, a function-valued property, a symbol key) left out of the generated function. It never stops anything.',
  },
];
</script>

<template>
  <div class="diag-levels">
    <div v-for="level in levels" :key="level.key" class="diag-levels__card">
      <span :class="['diag-badge', `diag-badge--${level.key}`]">{{ level.label }}</span>
      <p>{{ level.text }}</p>
    </div>
  </div>
</template>

<style scoped>
.diag-levels {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.9rem;
  margin: 1rem 0 1.5rem;
}

@media (max-width: 900px) {
  .diag-levels {
    grid-template-columns: 1fr;
  }
}

.diag-levels__card {
  padding: 0.9rem 1rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.6rem;
  background: color-mix(in oklab, var(--ui-bg-elevated) 60%, transparent);
}

.diag-levels__card p {
  margin: 0.55rem 0 0;
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--ui-text-muted);
}
</style>
