<script setup lang="ts">
import {ref} from 'vue';
import {useInView} from '~/composables/useInView';

// One bar of a benchmark chart: a full-width track with the measured fill on top.
// The fill grows from zero the first time the bar scrolls into view, `order` staggers the rows.
withDefaults(
  defineProps<{
    /** CSS width of the fill, e.g. "42.0%". */
    width: string;
    /** mion's own rows: the brand gradient instead of the neutral fill. */
    highlight?: boolean;
    order?: number;
  }>(),
  {highlight: false, order: 0}
);

const track = ref<HTMLElement>();
const inView = useInView(track);
</script>

<template>
  <span ref="track" class="bench-bar">
    <span class="bench-bar-fill" :class="{'is-highlight': highlight}" :style="{width: inView ? width : '0%', transitionDelay: `${order * 60}ms`}" />
  </span>
</template>

<style scoped>
.bench-bar {
  display: block;
  height: 0.85rem;
  border-radius: 999px;
  background: var(--ui-bg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-border) 60%, transparent);
  overflow: hidden;
}

.bench-bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: color-mix(in srgb, var(--ui-text-muted) 40%, transparent);
  transition: width 0.9s cubic-bezier(0.22, 1, 0.36, 1);
}

.bench-bar-fill.is-highlight {
  background: linear-gradient(90deg, var(--color-brand-200), var(--ui-primary));
}

@media (prefers-reduced-motion: reduce) {
  .bench-bar-fill {
    transition: none;
  }
}
</style>
