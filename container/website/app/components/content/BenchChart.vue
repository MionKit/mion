<script setup lang="ts">
import "billboard.js/dist/billboard.css";
import 'billboard.js/dist/theme/datalab.css';
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import bb, {bar, line, type Chart} from "billboard.js";

// The chart data is FETCHED from /bench-data/<bench>/index.json, the same generated
// file the results table reads, so a chart can never show one benchmark run while the
// table beside it shows another. It used to be a build-time `import` of a committed
// JSON file, which is why the numbers on these pages sat frozen at mion 0.6.2.

const props = defineProps<{
  /** Generated dataset, e.g. "servers-hello-world". */
  bench: string;
  /** Which column to plot. */
  metric: 'requests' | 'throughput' | 'latency' | 'maxMem' | 'memSeries';
  /** For a multi-section dataset (the payload sweep), which section to plot. */
  section?: string;
}>();

type Row = {
  app: string;
  label: string;
  family: string;
  requests: number;
  throughput: number;
  latency: number;
  maxMem: number;
  memSeries: number[];
};
type BenchIndex = {rows?: Row[]; sections?: {key: string; label: string; rows: Row[]}[]};

const METRICS = {
  requests: {label: 'Req (R/s)', type: 'bar'},
  throughput: {label: 'Throughput (Mb/s)', type: 'bar'},
  latency: {label: 'Latency (ms)', type: 'bar'},
  maxMem: {label: 'Max Memory (MB)', type: 'bar'},
  memSeries: {label: 'Memory (MB)', type: 'line'},
} as const;

const chartId = `benchmark-chart-${props.bench}-${props.metric}${props.section ? `-${props.section}` : ''}`;
const state = ref<'loading' | 'missing' | 'ready'>('loading');
const metricLabel = computed(() => METRICS[props.metric]?.label ?? props.metric);

/** A bar chart of one column, one bar per server, fastest first. */
function barConfig(rows: Row[]) {
  // Only ever called for the scalar metrics; memSeries is an array and takes the line
  // path below, so narrowing here keeps the two apart rather than casting per row.
  const key = props.metric as 'requests' | 'throughput' | 'latency' | 'maxMem';
  return {
    data: {
      x: 'x',
      columns: [['x', metricLabel.value], ...rows.map((row) => [row.label, row[key]])],
      type: bar(),
      labels: true,
    },
    axis: {x: {type: 'category' as const, labels: {rotate: 75}}},
    transition: {duration: 0},
  };
}

/** Memory over the run, one line per server (log scale: the spread is large). */
function lineConfig(rows: Row[]) {
  const withSeries = rows.filter((row) => row.memSeries?.length);
  return {
    data: {
      columns: withSeries.map((row) => [row.label, ...row.memSeries]),
      type: line(),
    },
    axis: {y: {type: 'log' as const}},
    point: {show: false},
    transition: {duration: 0},
  };
}

let chart: Chart | undefined;

onMounted(async () => {
  let index: BenchIndex | undefined;
  try {
    const res = await fetch(`/bench-data/${props.bench}/index.json`);
    if (res.ok) index = await res.json();
  } catch {
    // A missing dataset is a "not generated yet" page, not a broken one.
  }
  const rows = props.section ? index?.sections?.find((section) => section.key === props.section)?.rows : index?.rows;
  if (!rows?.length) {
    state.value = 'missing';
    return;
  }
  state.value = 'ready';
  await nextTick();
  try {
    chart = bb.generate({
      bindto: `#${chartId}`,
      ...(METRICS[props.metric]?.type === 'line' ? lineConfig(rows) : barConfig(rows)),
      tooltip: {show: false},
    });
  } catch (err) {
    console.error(`BenchChart: failed to render "${props.bench}/${props.metric}"`, err);
  }
});

onBeforeUnmount(() => {
  chart?.destroy();
  chart = undefined;
});
</script>
<template>
  <div class="bench-card">
    <div v-if="state === 'loading'" class="bench-chart-note">$ loading benchmark&hellip;</div>
    <div v-else-if="state === 'missing'" class="bench-chart-note">
      $ Benchmark data not generated yet, run <code>pnpm rtx bench servers</code>.
    </div>
    <div v-show="state === 'ready'" :id="chartId" class="mion-bench"/>
  </div>
</template>
<style>
.bench-card {
  position: relative;
  padding: 1.5rem;
  min-height: 370px;
  border: 1px solid var(--color-primary-400);
  background: 
    linear-gradient(to bottom, color-mix(in srgb, var(--color-brand-500) 3%, transparent) 0%, color-mix(in srgb, var(--color-brand-500) 8%, transparent) 100%),
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 24px,
      color-mix(in srgb, var(--color-brand-500) 8%, transparent) 24px,
      color-mix(in srgb, var(--color-brand-500) 8%, transparent) 25px
    ),
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 24px,
      color-mix(in srgb, var(--color-brand-500) 8%, transparent) 24px,
      color-mix(in srgb, var(--color-brand-500) 8%, transparent) 25px
    );
  box-shadow: 
    0 4px 6px -1px color-mix(in srgb, var(--color-brand-500) 10%, transparent),
    0 2px 4px -2px color-mix(in srgb, var(--color-brand-500) 10%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  margin: 1rem 0;
  overflow: hidden;
}

.dark .bench-card {
  border-color: var(--color-primary-600);
  background: 
    linear-gradient(to bottom, color-mix(in srgb, var(--color-brand-500) 2%, transparent) 0%, color-mix(in srgb, var(--color-brand-500) 6%, transparent) 100%),
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 24px,
      color-mix(in srgb, var(--color-brand-500) 6%, transparent) 24px,
      color-mix(in srgb, var(--color-brand-500) 6%, transparent) 25px
    ),
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 24px,
      color-mix(in srgb, var(--color-brand-500) 6%, transparent) 24px,
      color-mix(in srgb, var(--color-brand-500) 6%, transparent) 25px
    ),
    var(--ui-bg, #1a1a1a);
  box-shadow: 
    0 4px 6px -1px rgba(0, 0, 0, 0.3),
    0 2px 4px -2px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 color-mix(in srgb, var(--color-brand-500) 10%, transparent);
}

.mion-bench.bb text {
  color: var(--ui-text);
  fill: var(--ui-text);
}

.dark .bb path {
  stroke: #363232;
}

/* Ensure chart fills the card properly */
.bench-card .mion-bench {
  position: relative;
  z-index: 1;
}

.bench-chart-note {
  position: absolute;
  inset: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono, monospace);
  font-size: 0.875rem;
  color: var(--ui-text-muted, #888);
}
</style>