<script setup lang="ts">
/** The three diagnostic levels as cards; the badge classes are shared with the catalog. */
const levels = [
  {
    key: 'error',
    label: 'Error',
    text: 'mion could not build the code at all, so there is nothing to ship for it. The build stops there, everywhere, and nothing you write or set turns it off.',
  },
  {
    key: 'runtime',
    label: 'RuntimeError',
    text: "The build is not stopped during dev mode but code will generate an error at runtime. Production build will fail so you don't ship runtime errors.",
  },
  {
    key: 'warning',
    label: 'Warning',
    text: 'Worth knowing, nothing is broken. Usually a field mion skipped because it is not data: a method, a function, a symbol key. It never stops anything.',
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
