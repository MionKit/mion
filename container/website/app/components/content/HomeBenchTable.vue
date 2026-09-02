<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {commonBasis, geomeanOver, type AggregateCase} from '~/utils/benchAggregate';

// The small results table on the root landing's benchmarks card: one headline number
// per family, read from the SAME generated files the benchmark pages read
// (/bench-data/<bench>/index.json), so the card can never quote a run the pages do
// not show. RPC: requests per second on the hello-world suite, one row per server.
// RunTypes: the is-valid check, geometric mean over the cases every library supports
// (benchAggregate.ts, the same math as the "Overall" row of the validation page), one
// row per library. Plus the machine and date of the run. A missing dataset renders
// the "not generated yet" note, never an error; check-static gates the deploy.

const props = withDefaults(
  defineProps<{
    /** The mion server dataset, e.g. "servers-hello-world". */
    servers?: string;
    /** The RunTypes validation dataset. */
    validation?: string;
    /** Rows shown per family, fastest first. */
    rows?: number;
  }>(),
  {servers: 'servers-hello-world', validation: 'validation', rows: 5}
);

type ServerRow = {app: string; label: string; family: string; requests: number};
type Meta = {generatedAt?: string | null; os?: string | null; cpu?: string | null; cores?: number | null; node?: string | null};
type ServersIndex = {meta?: Meta; rows?: ServerRow[]};
type ValidationIndex = {competitors?: string[]; meta?: Meta; sections?: {key: string; cases: AggregateCase[]}[]};

type Row = {name: string; value: number; mion: boolean};

const serversIndex = ref<ServersIndex | undefined>();
const validationIndex = ref<ValidationIndex | undefined>();
const state = ref<'loading' | 'missing' | 'ready'>('loading');

/** The fastest servers by requests per second. */
const serverRows = computed<Row[]>(() =>
  [...(serversIndex.value?.rows ?? [])]
    .filter((row) => row.requests > 0)
    .sort((a, b) => b.requests - a.requests)
    .slice(0, props.rows)
    .map((row) => ({name: row.label, value: row.requests, mion: row.family === 'mion'}))
);

/** The fastest validators: geometric mean of the is-valid check on valid input over
 *  the cases every listed library supports. The deploy gate refuses a dataset that
 *  lists a library twice; the Set keeps a stale local index from doubling a row. */
const validationRows = computed<Row[]>(() => {
  const index = validationIndex.value;
  if (!index?.sections?.length) return [];
  const cases = index.sections.flatMap((section) => section.cases);
  const competitors = [...new Set(index.competitors ?? [])];
  const {participants, common} = commonBasis(cases, competitors, 'validate');
  return participants
    .map((comp) => ({name: comp, value: geomeanOver(common, 'validate', comp, 'valid') ?? 0, mion: /mion|ts-runtypes/.test(comp)}))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, props.rows);
});

const meta = computed(() => serversIndex.value?.meta ?? validationIndex.value?.meta);
const machine = computed(() => [meta.value?.cpu, meta.value?.cores ? `${meta.value.cores} vCPUs` : null].filter(Boolean).join(', '));
const runDate = computed(() => (meta.value?.generatedAt ? new Date(meta.value.generatedAt).toISOString().slice(0, 10) : ''));

const format = (value: number): string => {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return value.toFixed(0);
};
const width = (rows: Row[], value: number): string => `${Math.min(100, (value / Math.max(...rows.map((row) => row.value), 1)) * 100).toFixed(1)}%`;

async function fetchIndex<T>(bench: string): Promise<T | undefined> {
  try {
    const res = await fetch(`/bench-data/${bench}/index.json`);
    if (res.ok) return (await res.json()) as T;
  } catch {
    // A missing dataset renders the "not generated yet" note, not an error page.
  }
  return undefined;
}

onMounted(async () => {
  [serversIndex.value, validationIndex.value] = await Promise.all([fetchIndex<ServersIndex>(props.servers), fetchIndex<ValidationIndex>(props.validation)]);
  state.value = serverRows.value.length > 0 || validationRows.value.length > 0 ? 'ready' : 'missing';
});
</script>

<template>
  <div class="home-bench">
    <div v-if="state === 'loading'" class="home-bench-note">$ loading benchmarks&hellip;</div>

    <div v-else-if="state === 'missing'" class="home-bench-note">
      $ Benchmark data not generated yet, run <code>pnpm miondevx bench --website</code>.
    </div>

    <template v-else>
      <table v-if="serverRows.length" class="home-bench-table">
        <caption>RPC servers, hello world, requests per second</caption>
        <tbody>
          <tr v-for="row in serverRows" :key="row.name" :class="{'is-mion': row.mion}">
            <th scope="row">{{ row.name }}</th>
            <td class="home-bench-bar"><span :style="{width: width(serverRows, row.value)}" /></td>
            <td class="home-bench-num">{{ format(row.value) }}</td>
          </tr>
        </tbody>
      </table>

      <table v-if="validationRows.length" class="home-bench-table">
        <caption>RunTypes validation, is-valid check, operations per second</caption>
        <tbody>
          <tr v-for="row in validationRows" :key="row.name" :class="{'is-mion': row.mion}">
            <th scope="row">{{ row.name }}</th>
            <td class="home-bench-bar"><span :style="{width: width(validationRows, row.value)}" /></td>
            <td class="home-bench-num">{{ format(row.value) }}</td>
          </tr>
        </tbody>
      </table>

      <p v-if="meta" class="home-bench-meta">
        Measured on {{ machine }}<template v-if="meta.node">, Node {{ meta.node.replace(/^v/, '') }}</template><template v-if="runDate">, {{ runDate }}</template>.
      </p>
    </template>
  </div>
</template>

<style scoped>
.home-bench {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.15rem 1.25rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--ui-text-muted) 5%, transparent);
}

.home-bench-note {
  font-family: var(--font-mono, monospace);
  font-size: 0.85rem;
  color: var(--ui-text-muted);
}

.home-bench-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.home-bench-table caption {
  margin-bottom: 0.4rem;
  text-align: left;
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
}

.home-bench-table th,
.home-bench-table td {
  padding: 0.22rem 0;
  border: 0;
  vertical-align: middle;
}

.home-bench-table th {
  width: 7rem;
  padding-right: 0.6rem;
  text-align: left;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ui-text-muted);
}

.home-bench-bar span {
  display: block;
  height: 0.55rem;
  border-radius: 0.3rem;
  background: color-mix(in srgb, var(--ui-text-muted) 45%, transparent);
}

.home-bench-num {
  width: 3.5rem;
  padding-left: 0.6rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted);
}

/* the mion rows are the point of the comparison */
.home-bench-table tr.is-mion th,
.home-bench-table tr.is-mion td {
  color: var(--ui-text-highlighted);
  font-weight: 700;
}

.home-bench-table tr.is-mion .home-bench-bar span {
  background: var(--ui-primary);
}

.home-bench-meta {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.4;
  color: var(--ui-text-dimmed);
}
</style>
