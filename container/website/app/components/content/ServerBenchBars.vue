<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';

// One metric of a mion server benchmark as HTML bars: one row per server, best first,
// read from /bench-data/<bench>/index.json (the same generated file the home summary
// reads). Replaces the chart library and the results table the rpc benchmark pages
// carried: the table's other facts (version, runtime, description) sit under each
// server's name, and the run metadata (machine, node, date, load) renders once per
// page, on the bars that ask for it (`show-meta`). A section (the payload sweep)
// carries its own metadata, since its concurrency differs per size.

type MetricKey = 'requests' | 'throughput' | 'latency' | 'maxMem' | 'maxCpu';

const props = withDefaults(
  defineProps<{
    /** Generated dataset, e.g. "servers-hello-world". */
    bench: string;
    /** Which column to draw. */
    metric?: MetricKey;
    /** For a multi-section dataset (the payload sweep), which section to draw. */
    section?: string;
    /** Print the machine / method block above the bars (a page shows it once). */
    showMeta?: boolean;
  }>(),
  {metric: 'requests', section: '', showMeta: false}
);

const METRICS: Record<MetricKey, {label: string; unit: string; lowerBetter: boolean; digits: number}> = {
  requests: {label: 'Requests per second', unit: 'req/s', lowerBetter: false, digits: 0},
  throughput: {label: 'Throughput', unit: 'Mb/s', lowerBetter: false, digits: 1},
  latency: {label: 'Latency', unit: 'ms', lowerBetter: true, digits: 2},
  maxMem: {label: 'Max memory', unit: 'MB', lowerBetter: true, digits: 0},
  maxCpu: {label: 'Max CPU', unit: '%', lowerBetter: true, digits: 0},
};

type Row = {
  app: string;
  label: string;
  family: string;
  runtime: string;
  version: string | null;
  runtimeVersion: string | null;
  router: boolean;
  validation: boolean;
  description: string;
  requests: number;
  latency: number;
  throughput: number;
  maxMem: number;
  maxCpu: number;
};
type Meta = {generatedAt?: string | null; os?: string | null; cpu?: string | null; cores?: number | null; node?: string | null; method?: string; tolerance?: number | null};
type BenchIndex = {label?: string; meta?: Meta; rows?: Row[]; sections?: {key: string; label: string; meta?: Meta; rows: Row[]}[]};

const index = ref<BenchIndex | undefined>();
const state = ref<'loading' | 'missing' | 'ready'>('loading');
const metric = computed(() => METRICS[props.metric]);
const section = computed(() => (props.section ? index.value?.sections?.find((entry) => entry.key === props.section) : undefined));

/** The rows of the dataset (or of the section), best first for the metric. */
const rows = computed<Row[]>(() => {
  const source = props.section ? (section.value?.rows ?? []) : (index.value?.rows ?? []);
  const key = props.metric;
  return [...source].filter((row) => typeof row[key] === 'number').sort((a, b) => (metric.value.lowerBetter ? a[key] - b[key] : b[key] - a[key]));
});
const max = computed(() => Math.max(...rows.value.map((row) => row[props.metric]), 0));
const width = (row: Row): string => `${max.value > 0 ? Math.min(100, (row[props.metric] / max.value) * 100).toFixed(1) : 0}%`;
const value = (row: Row): string => row[props.metric].toLocaleString('en-US', {minimumFractionDigits: metric.value.digits, maximumFractionDigits: metric.value.digits});
// everything the results table used to say about a lane, on one line under its name
const detail = (row: Row): string =>
  [
    row.version ? `v${row.version}` : null,
    row.runtime && row.runtimeVersion ? `${row.runtime} ${row.runtimeVersion}` : row.runtime,
    row.router ? null : 'no router',
    row.validation ? null : 'no validation',
    row.description,
  ]
    .filter(Boolean)
    .join(' · ');

// A section carries its own meta (the payload sweep caps concurrency on the big sizes).
const meta = computed(() => section.value?.meta ?? index.value?.meta);
const machine = computed(() => [meta.value?.cpu, meta.value?.os, meta.value?.cores ? `${meta.value.cores} vCPUs` : null].filter(Boolean).join(' | '));
const runDate = computed(() => (meta.value?.generatedAt ? new Date(meta.value.generatedAt).toUTCString() : ''));
const caption = computed(() => {
  const what = section.value?.label ?? index.value?.label ?? props.bench;
  return `${what} · ${metric.value.label} (${metric.value.unit}, ${metric.value.lowerBetter ? 'lower' : 'higher'} is better)`;
});

onMounted(async () => {
  try {
    const res = await fetch(`/bench-data/${props.bench}/index.json`);
    if (res.ok) index.value = (await res.json()) as BenchIndex;
  } catch {
    // A missing dataset renders the "not generated yet" note, not an error page.
  }
  state.value = rows.value.length > 0 ? 'ready' : 'missing';
});
</script>

<template>
  <div class="server-bench-bars">
    <div v-if="state === 'loading'" class="server-bench-bars-note">$ loading benchmark&hellip;</div>

    <div v-else-if="state === 'missing'" class="server-bench-bars-note">
      $ Benchmark data not generated yet, run <code>pnpm miondevx bench servers</code>.
    </div>

    <template v-else>
      <ul v-if="showMeta && meta" class="server-bench-bars-meta">
        <li v-if="machine"><strong>Machine:</strong> {{ machine }}</li>
        <li v-if="meta.node"><strong>Node:</strong> <code>v{{ meta.node.replace(/^v/, '') }}</code></li>
        <li v-if="runDate"><strong>Run:</strong> {{ runDate }}</li>
        <li v-if="meta.method"><strong>Method:</strong> <code>{{ meta.method }}</code> (a warm-up round, then the measured one)</li>
        <li v-if="meta.tolerance"><strong>Repeatability:</strong> running the same server twice lands within {{ meta.tolerance }}%</li>
      </ul>

      <table class="server-bench-bars-table">
        <caption>{{ caption }}</caption>
        <tbody>
          <tr v-for="row in rows" :key="row.app" :class="{'is-mion': row.family === 'mion'}">
            <th scope="row">
              <span class="server-bench-bars-name">{{ row.label }}</span>
              <span class="server-bench-bars-detail">{{ detail(row) }}</span>
            </th>
            <td class="server-bench-bars-bar"><span :style="{width: width(row)}" /></td>
            <td class="server-bench-bars-num">{{ value(row) }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<style scoped>
.server-bench-bars {
  margin: 0.75rem 0 1.5rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--ui-text-muted) 5%, transparent);
}

.server-bench-bars-note {
  font-family: var(--font-mono, monospace);
  font-size: 0.85rem;
  color: var(--ui-text-muted);
}

.server-bench-bars-meta {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
  font-size: 0.85rem;
  color: var(--ui-text-muted);
}

.server-bench-bars-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.server-bench-bars-table caption {
  margin-bottom: 0.5rem;
  text-align: left;
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
}

.server-bench-bars-table th,
.server-bench-bars-table td {
  padding: 0.3rem 0;
  border: 0;
  vertical-align: middle;
}

.server-bench-bars-table th {
  width: 15rem;
  padding-right: 0.75rem;
  text-align: left;
  font-weight: 500;
}

.server-bench-bars-name {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ui-text-muted);
}

.server-bench-bars-detail {
  display: block;
  font-size: 0.7rem;
  line-height: 1.3;
  color: var(--ui-text-dimmed);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.server-bench-bars-bar span {
  display: block;
  height: 0.6rem;
  border-radius: 0.3rem;
  background: color-mix(in srgb, var(--ui-text-muted) 45%, transparent);
}

.server-bench-bars-num {
  width: 5.5rem;
  padding-left: 0.75rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--ui-text-muted);
}

/* the mion rows are the point of the comparison */
.server-bench-bars-table tr.is-mion .server-bench-bars-name,
.server-bench-bars-table tr.is-mion .server-bench-bars-num {
  color: var(--ui-text-highlighted);
  font-weight: 700;
}

.server-bench-bars-table tr.is-mion .server-bench-bars-bar span {
  background: var(--ui-primary);
}

@media (max-width: 640px) {
  .server-bench-bars-table th {
    width: 9rem;
  }
}
</style>
