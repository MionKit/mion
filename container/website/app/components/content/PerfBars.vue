<script setup lang="ts">
// Small horizontal bar chart for the homepage "Performance with control" section.
// Bar width = score / max; fill hue is rank-tinted (chartreuse → green), the same
// data-driven HSL idea the benchmark heatmap uses. A `muted` bar is drawn neutral
// and excluded from the scale: for a competitor measured on a different basis
// (e.g. Zod, which only validates by producing errors). Static snapshot, not live.
interface Bar {
  name: string
  score: number
  label: string
  highlight?: boolean
  muted?: boolean
}

const props = withDefaults(defineProps<{bars?: Bar[]; caption?: string; footnote?: string}>(), {
  bars: () => [],
  caption: '',
  footnote: '',
})

// Only the comparable (non-muted) bars set the green→chartreuse scale.
const scored = props.bars.filter((bar) => !bar.muted).map((bar) => bar.score)
const max = Math.max(...scored, 1)
const min = Math.min(...scored)
const rank = (score: number) => (max === min ? 1 : (score - min) / (max - min))
// green-dominant: a tight field stays green (best green, worst chartreuse), never
// red: they're all fast. The muted row gets a neutral fill instead.
const hue = (score: number) => 50 + rank(score) * 90
const width = (score: number) => Math.min(100, (score / max) * 100)
const fill = (bar: Bar) =>
  bar.muted ? 'var(--ui-text-dimmed)' : `hsl(${hue(bar.score)} 60% 47%)`
</script>

<template>
  <div class="perf-bars">
    <p v-if="caption" class="perf-bars-caption">{{ caption }}</p>
    <div
      v-for="bar in bars"
      :key="bar.name"
      class="perf-bar"
      :class="{'perf-bar--me': bar.highlight, 'perf-bar--muted': bar.muted}"
    >
      <span class="perf-bar-name">{{ bar.name }}<sup v-if="bar.muted">*</sup></span>
      <span class="perf-bar-track">
        <span class="perf-bar-fill" :style="{width: width(bar.score) + '%', background: fill(bar)}" />
      </span>
      <span class="perf-bar-val">{{ bar.label }}</span>
    </div>
    <p v-if="footnote" class="perf-bars-footnote"><sup>*</sup> {{ footnote }}</p>
  </div>
</template>

<style scoped>
.perf-bars {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin-top: 0.75rem;
}

.perf-bars-caption {
  margin: 0 0 0.2rem;
  font-size: 0.72rem;
  color: var(--ui-text-dimmed);
}

.perf-bar {
  display: grid;
  grid-template-columns: 6.75rem 1fr 3rem;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.8rem;
}

.perf-bar-name {
  color: var(--ui-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.perf-bar--me .perf-bar-name {
  color: var(--ui-text-highlighted);
  font-weight: 600;
}

.perf-bar--muted .perf-bar-name {
  color: var(--ui-text-dimmed);
}

.perf-bar-track {
  height: 0.6rem;
  background: color-mix(in srgb, var(--ui-text-muted) 16%, transparent);
  border-radius: 0.35rem;
  overflow: hidden;
}

.perf-bar-fill {
  display: block;
  height: 100%;
  border-radius: 0.35rem;
}

.perf-bar-val {
  color: var(--ui-text-muted);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.perf-bar--me .perf-bar-val {
  color: var(--ui-text-highlighted);
}

.perf-bar--muted .perf-bar-val {
  color: var(--ui-text-dimmed);
}

.perf-bars-footnote {
  margin: 0.4rem 0 0;
  font-size: 0.68rem;
  line-height: 1.4;
  color: var(--ui-text-dimmed);
}
</style>
