<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';

// The results table for the mion server benchmarks, and the run metadata line above
// it. Both come from the SAME generated file the charts read, so the machine, the
// runtime versions, the load settings and the numbers can never disagree - they used
// to be hand-written markdown, which is how the tables came to claim mion 0.6.2 long
// after 0.8 shipped.

const props = defineProps<{
  /** Generated dataset, e.g. "servers-hello-world". */
  bench: string;
  /** For a multi-section dataset (the payload sweep), which section to show. */
  section?: string;
  /** Hide the machine / method block (a page showing several tables prints it once). */
  hideMeta?: boolean;
}>();

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
type Meta = {
  generatedAt: string | null;
  os: string | null;
  cpu: string | null;
  cores: number | null;
  node: string | null;
  method: string;
};
type BenchIndex = {rows?: Row[]; meta?: Meta; sections?: {key: string; label: string; meta?: Meta; rows: Row[]}[]};

const index = ref<BenchIndex | undefined>();
const state = ref<'loading' | 'missing' | 'ready'>('loading');

const rows = computed<Row[]>(() => {
  if (props.section) return index.value?.sections?.find((section) => section.key === props.section)?.rows ?? [];
  return index.value?.rows ?? [];
});

// A section carries its own meta because the payload sweep caps concurrency on the
// big sizes, so the dataset-level "autocannon -c N" line does not describe them all.
const meta = computed(() => {
  if (props.section) {
    const section = index.value?.sections?.find((entry) => entry.key === props.section);
    if (section?.meta) return section.meta;
  }
  return index.value?.meta;
});
const machine = computed(() => {
  const m = meta.value;
  if (!m) return '';
  return [m.cpu, m.os, m.cores ? `${m.cores} vCPUs` : null].filter(Boolean).join(' | ');
});
const runDate = computed(() => (meta.value?.generatedAt ? new Date(meta.value.generatedAt).toUTCString() : ''));
const num = (value: number, digits = 0) => value.toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});

onMounted(async () => {
  try {
    const res = await fetch(`/bench-data/${props.bench}/index.json`);
    if (res.ok) index.value = await res.json();
  } catch {
    // A missing dataset renders the "not generated yet" note, not an error page.
  }
  state.value = rows.value.length > 0 ? 'ready' : 'missing';
});
</script>

<template>
  <div class="server-bench">
    <div v-if="state === 'loading'" class="server-bench-note">$ loading benchmark&hellip;</div>

    <div v-else-if="state === 'missing'" class="server-bench-note">
      $ Benchmark data not generated yet, run <code>pnpm miondevx bench servers</code>.
    </div>

    <template v-else>
      <ul v-if="!hideMeta && meta" class="server-bench-meta">
        <li v-if="machine"><strong>Machine:</strong> {{ machine }}</li>
        <li v-if="meta.node"><strong>Node:</strong> <code>v{{ meta.node }}</code></li>
        <li v-if="runDate"><strong>Run:</strong> {{ runDate }}</li>
        <li><strong>Method:</strong> <code>{{ meta.method }}</code> (a warm-up round, then the measured one)</li>
      </ul>

      <div class="server-bench-scroll">
        <table>
          <thead>
            <tr>
              <th>Server</th>
              <th>Version</th>
              <th>Router</th>
              <th>Req (R/s)</th>
              <th>Latency (ms)</th>
              <th>Output (Mb/s)</th>
              <th>Max Memory (MB)</th>
              <th>Max Cpu (%)</th>
              <th>Validation</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.app" :class="{'is-mion': row.family === 'mion'}">
              <td>{{ row.label }}</td>
              <td>{{ row.version ?? '-' }}</td>
              <td>{{ row.router ? '✓' : '✗' }}</td>
              <td>{{ num(row.requests, 1) }}</td>
              <td>{{ num(row.latency, 2) }}</td>
              <td>{{ num(row.throughput, 2) }}</td>
              <td>{{ num(row.maxMem) }}</td>
              <td>{{ num(row.maxCpu) }}</td>
              <td>{{ row.validation ? '✓' : '✗' }}</td>
              <td>{{ row.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.server-bench {
  margin: 1rem 0;
}

.server-bench-note {
  font-family: var(--font-mono, monospace);
  font-size: 0.875rem;
  color: var(--ui-text-muted, #888);
  padding: 1rem 0;
}

.server-bench-meta {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
  font-size: 0.9rem;
}

/* Wide tables scroll inside their own box rather than pushing the page sideways. */
.server-bench-scroll {
  overflow-x: auto;
}

.server-bench table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.server-bench th,
.server-bench td {
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--ui-border);
  text-align: right;
  white-space: nowrap;
}

.server-bench th:first-child,
.server-bench td:first-child,
.server-bench th:last-child,
.server-bench td:last-child {
  text-align: left;
}

.server-bench td:last-child {
  white-space: normal;
  min-width: 16rem;
}

/* The mion rows are the point of the comparison, so they are the ones in bold. */
.server-bench tr.is-mion {
  font-weight: 700;
  color: var(--color-primary-600);
}

.dark .server-bench tr.is-mion {
  color: var(--color-primary-400);
}
</style>
