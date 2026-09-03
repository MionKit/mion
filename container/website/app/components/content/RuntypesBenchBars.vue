<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {aggregateRows, type AggregateRow, type AggregateSection} from '~/utils/benchAggregate';
import {formatValue, lowerBetterFor, shortVersion, strategyOf, unitFor, type BenchMetric, type BenchUnit} from '~/utils/benchFormat';

// A RunTypes benchmark as HTML bars: one chart per group, one bar per library, read
// from /bench-data/<bench>/index.json (the same generated file BenchTable reads, and
// the same geometric means its summary block shows). It replaced the full per-case
// tables on the benchmark pages, which ran to hundreds of rows: the summary is what
// answers "which is faster", and each chart links its group's cases on GitHub for the
// reader who wants the detail. The rpc pages next door use ServerBenchBars the same way.

const props = withDefaults(
  defineProps<{
    /** Generated dataset, e.g. "validation". */
    bench: string;
    /** Which metric(s) to draw, comma-separated: one chart each, side by side. */
    metric: string;
    /** Print the machine / date line above the charts (a page shows it once). */
    showMeta?: boolean;
  }>(),
  {showMeta: true}
);

type PathResult = {valid?: number; invalid?: number; mixed?: number; status?: 'ok' | 'fail' | 'not-supported'};
type BenchCase = {key: string; title: string; results: Record<string, Record<string, PathResult>>};
type BenchSection = AggregateSection & {cases: BenchCase[]};
type BenchIndex = {
  label?: string;
  unit?: BenchUnit;
  /** true when a competitor's two measured paths are accept and reject (validation),
   *  rather than two halves of one operation (serialization's encode and decode). */
  showInvalid?: boolean;
  showStrategy?: boolean;
  metrics: BenchMetric[];
  competitors: string[];
  versions?: Record<string, string>;
  meta?: {generatedAt?: string; os?: string; cpu?: string; cores?: number | null; node?: string};
  sections: BenchSection[];
};

const index = ref<BenchIndex | undefined>();
const state = ref<'loading' | 'missing' | 'ready'>('loading');
const github = useAppConfig().github as {url?: string; branch?: string} | undefined;

/** The metrics this page asked for, in the order it named them. An unknown key is
 *  dropped rather than rendered empty; the deploy gate fails the page instead. */
const metrics = computed<BenchMetric[]>(() => {
  const wanted = props.metric.split(',').map((key) => key.trim());
  return wanted.flatMap((key) => index.value?.metrics.filter((metric) => metric.key === key) ?? []);
});

/** REALWORLD leads the groups (the shapes an app actually validates), and Overall
 *  leads the page: the headline, before any group breakdown. */
const orderedSections = computed<BenchSection[]>(() => {
  const sections = index.value?.sections ?? [];
  return [...sections.filter((section) => section.key === 'REALWORLD'), ...sections.filter((section) => section.key !== 'REALWORLD')];
});

const rows = computed<AggregateRow[]>(() => {
  if (!index.value || metrics.value.length === 0) return [];
  // Every chart on a row averages over the same cases, so one aggregate per metric
  // keyed by row is enough; the first metric decides the row list.
  const first = metrics.value[0]!;
  const all = aggregateRows(orderedSections.value, index.value.competitors, first.key, lowerBetterFor(index.value.metrics, index.value.unit, first.key));
  const overall = all.find((row) => row.key === '__overall__');
  return overall ? [overall, ...all.filter((row) => row.key !== '__overall__')] : all;
});

/** Aggregates for every requested metric, keyed by metric then by row. */
const byMetric = computed<Record<string, Record<string, AggregateRow>>>(() => {
  if (!index.value) return {};
  const competitors = index.value.competitors;
  return Object.fromEntries(
    metrics.value.map((metric) => [
      metric.key,
      Object.fromEntries(
        aggregateRows(orderedSections.value, competitors, metric.key, lowerBetterFor(index.value!.metrics, index.value!.unit, metric.key)).map((row) => [
          row.key,
          row,
        ])
      ),
    ])
  );
});

const caseCount = (row: AggregateRow): number =>
  row.key === '__overall__'
    ? orderedSections.value.reduce((total, section) => total + section.cases.length, 0)
    : (orderedSections.value.find((section) => section.key === row.key)?.cases.length ?? 0);

/** Where this group's cases are authored, on GitHub. Absent for the Overall row
 *  (every group at once) and whenever the dataset predates the `source` field. */
const sourceLink = (row: AggregateRow): string | undefined =>
  row.source && github?.url ? `${github.url}/blob/${github.branch ?? 'main'}/${row.source}` : undefined;

type Bar = {name: string; label: string; detail: string; value: number | null; text: string; width: string; mion: boolean};

/** One chart: a bar per library, best first, `n-a` rows last. Width is relative to
 *  the best value in the chart, so the comparison is within the group. */
function bars(metric: BenchMetric, rowKey: string): Bar[] {
  const idx = index.value;
  if (!idx) return [];
  const unit = unitFor(idx.metrics, idx.unit, metric.key);
  const lowerBetter = lowerBetterFor(idx.metrics, idx.unit, metric.key);
  const values = byMetric.value[metric.key]?.[rowKey]?.values ?? {};
  const showStrategy = idx.showStrategy !== false && idx.unit !== 'count';
  const entries = idx.competitors.map((name) => {
    const value = values[name]?.valid ?? null;
    // A second number rides along only where the page explains it: on serialization
    // the two paths are the encode and decode passes, and the prose says so. On the
    // validation benches they are the accept and reject paths, and an unlabelled
    // second figure there reads as noise, which is what these charts replaced.
    const second = idx.showInvalid === true ? null : (values[name]?.invalid ?? null);
    const version = shortVersion(idx.versions?.[name]);
    return {
      name,
      label: name,
      detail: [version ? `v${version}` : null, showStrategy ? strategyOf(name) : null].filter(Boolean).join(' · '),
      value,
      text: value == null ? 'n-a' : [formatValue(value, unit), second != null && second > 0 ? formatValue(second, unit, true) : null].filter(Boolean).join(' · '),
      width: '0%',
      mion: /^mion|ts-runtypes/.test(name),
    };
  });
  // Bar length always means BETTER, never just "bigger". On a lower-is-better chart
  // (payload bytes) the ratio is inverted, so the smallest payload fills the bar and
  // one twice its size fills half; drawn the other way the worst row had the longest
  // bar while sitting at the top of a best-first list.
  const measured = entries.filter((entry) => entry.value != null && entry.value > 0);
  const measuredValues = measured.map((entry) => entry.value!);
  const best = measuredValues.length > 0 ? (lowerBetter ? Math.min(...measuredValues) : Math.max(...measuredValues)) : 0;
  for (const entry of entries) {
    const ratio = entry.value != null && entry.value > 0 && best > 0 ? (lowerBetter ? best / entry.value : entry.value / best) : 0;
    entry.width = `${Math.min(100, ratio * 100).toFixed(1)}%`;
  }
  return [
    ...measured.sort((a, b) => (lowerBetter ? a.value! - b.value! : b.value! - a.value!)),
    ...entries.filter((entry) => !measured.includes(entry)),
  ];
}

const chartCaption = (metric: BenchMetric): string => {
  const idx = index.value;
  const unit = idx ? unitFor(idx.metrics, idx.unit, metric.key) : undefined;
  const better = idx && lowerBetterFor(idx.metrics, idx.unit, metric.key) ? 'lower is better' : 'higher is better';
  const measure = unit === 'bytes' ? 'bytes' : unit === 'count' ? '' : 'ops/sec';
  return [metric.label, measure, better].filter(Boolean).join(' · ');
};

const meta = computed(() => index.value?.meta);
const runInfo = computed<string>(() => {
  const value = meta.value;
  if (!value) return '';
  const parts: string[] = [];
  if (value.generatedAt) {
    const date = new Date(value.generatedAt);
    if (!Number.isNaN(date.getTime())) parts.push(date.toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric'}));
  }
  if (value.cpu && value.cpu !== 'unknown') parts.push(value.cores ? `${value.cpu} (${value.cores} cores)` : value.cpu);
  if (value.os) parts.push(value.os);
  if (value.node) parts.push(`Node ${shortVersion(value.node.replace(/^v/, ''))}`);
  return parts.join(' · ');
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
  <div class="runtypes-bench-bars">
    <div v-if="state === 'loading'" class="runtypes-bench-bars-note">$ loading benchmark&hellip;</div>

    <div v-else-if="state === 'missing'" class="runtypes-bench-bars-note">
      $ Benchmark data not generated yet, run <code>pnpm miondevx bench --website</code>.
    </div>

    <template v-else>
      <p v-if="showMeta && runInfo" class="runtypes-bench-bars-meta">Measured on {{ runInfo }}.</p>

      <section v-for="row in rows" :key="row.key" class="runtypes-bench-group">
        <h3 class="runtypes-bench-group-title">
          <span>{{ row.label }}</span>
          <span class="runtypes-bench-group-count">{{ caseCount(row) }} cases</span>
          <a v-if="sourceLink(row)" class="runtypes-bench-group-link" :href="sourceLink(row)" target="_blank" rel="noopener noreferrer">
            <UIcon name="i-simple-icons-github" />
            <span>cases on GitHub</span>
          </a>
        </h3>

        <div class="runtypes-bench-charts">
          <table v-for="metric in metrics" :key="metric.key" class="runtypes-bench-chart">
            <caption>{{ chartCaption(metric) }}</caption>
            <tbody>
              <tr v-for="bar in bars(metric, row.key)" :key="bar.name" :class="{'is-mion': bar.mion, 'is-na': bar.value === null}">
                <th scope="row">
                  <span class="runtypes-bench-name">{{ bar.label }}</span>
                  <span v-if="bar.detail" class="runtypes-bench-detail">{{ bar.detail }}</span>
                </th>
                <td class="runtypes-bench-bar"><span :style="{width: bar.width}" /></td>
                <td class="runtypes-bench-num">{{ bar.text }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.runtypes-bench-bars {
  margin: 0.75rem 0 1.5rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--ui-text-muted) 5%, transparent);
}

.runtypes-bench-bars-note {
  font-family: var(--font-mono, monospace);
  font-size: 0.85rem;
  color: var(--ui-text-muted);
}

.runtypes-bench-bars-meta {
  margin: 0 0 1.25rem;
  font-size: 0.78rem;
  color: var(--ui-text-dimmed);
}

.runtypes-bench-group + .runtypes-bench-group {
  margin-top: 1.75rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--ui-border);
}

.runtypes-bench-group-title {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}

.runtypes-bench-group-count {
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--ui-text-dimmed);
}

.runtypes-bench-group-link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-left: auto;
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--ui-text-dimmed);
  text-decoration: none;
}

.runtypes-bench-group-link:hover {
  color: var(--ui-primary);
}

/* Two metrics (the serialization pages: speed and bytes) sit side by side while
   there is room, and stack on a narrow screen. */
.runtypes-bench-charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr));
  gap: 1.25rem;
}

.runtypes-bench-chart {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.runtypes-bench-chart caption {
  margin-bottom: 0.5rem;
  text-align: left;
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
}

.runtypes-bench-chart th,
.runtypes-bench-chart td {
  padding: 0.3rem 0;
  border: 0;
  vertical-align: middle;
}

.runtypes-bench-chart th {
  width: 8rem;
  padding-right: 0.75rem;
  text-align: left;
  font-weight: 500;
}

.runtypes-bench-name {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ui-text-muted);
}

.runtypes-bench-detail {
  display: block;
  font-size: 0.7rem;
  line-height: 1.3;
  color: var(--ui-text-dimmed);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.runtypes-bench-bar span {
  display: block;
  height: 0.6rem;
  border-radius: 0.3rem;
  background: color-mix(in srgb, var(--ui-text-muted) 45%, transparent);
}

.runtypes-bench-num {
  width: 7rem;
  padding-left: 0.75rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--ui-text-muted);
}

/* the mion rows are the point of the comparison */
.runtypes-bench-chart tr.is-mion .runtypes-bench-name,
.runtypes-bench-chart tr.is-mion .runtypes-bench-num {
  color: var(--ui-text-highlighted);
  font-weight: 700;
}

.runtypes-bench-chart tr.is-mion .runtypes-bench-bar span {
  background: var(--ui-primary);
}

.runtypes-bench-chart tr.is-na .runtypes-bench-num {
  color: var(--ui-text-dimmed);
}

@media (max-width: 640px) {
  .runtypes-bench-chart th {
    width: 6.5rem;
  }
}
</style>
