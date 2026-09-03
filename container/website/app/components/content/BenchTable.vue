<script setup lang="ts">
import {reactive, ref, computed, onMounted} from 'vue';
import {aggregateRows, type AggregateRow} from '~/utils/benchAggregate';
import {formatValue, lowerBetterFor as lowerBetterOf, shortVersion, strategyOf, unitFor as unitOf} from '~/utils/benchFormat';

type CaseStatus = 'ok' | 'fail' | 'not-supported';

/** One metric for a competitor: throughput on the valid (accept), invalid
 *  (reject) and mixed (interleaved) input streams. */
interface PathResult {
  valid?: number;
  invalid?: number;
  mixed?: number;
  status?: CaseStatus;
}

type Path = 'valid' | 'invalid' | 'mixed';

interface Metric {
  key: string;
  label: string;
  metricLabel?: string;
  /** Per-metric overrides (serialization bench): the cell unit + heatmap
   *  direction, a value DERIVED client-side (`roundtrip`), and the legend hint.
   *  All fall back to the index-level `unit` when absent (validation/typecost). */
  unit?: 'ops' | 'count' | 'bytes';
  lowerBetter?: boolean;
  derived?: 'roundtrip';
  cellHint?: string;
}

interface BenchCase {
  key: string;
  title: string;
  /** results[competitor][metricKey] -> {valid, invalid, status} */
  results: Record<string, Record<string, PathResult>>;
  /** serialization bench: false when native JSON can't round-trip this case's
   *  data (bigint / Date / Map / Set / Temporal), drives the "non-JSON" badge. */
  jsonSafe?: boolean;
}

interface BenchSection {
  key: string;
  label: string;
  cases: BenchCase[];
}

/** What one column measures: surfaced by hovering that column's header
 *  (BenchColumnInfo). Optional per bench: no `columnNotes` block in the index,
 *  no glyph and no hover. */
interface ColumnNote {
  text: string;
  detail?: string;
}

interface BenchIndex {
  bench: string;
  label: string;
  unit?: 'ops' | 'count';
  /** when true, each competitor splits into valid (accept) + invalid (reject) columns */
  showInvalid?: boolean;
  /** true when per-case detail JSON carries a shared `samples` block (validation +
   *  correctness): drives the hover hint wording and the "Tested data" panel column. */
  hasSamples?: boolean;
  /** false hides the comptime/jit/interpreted build-strategy tags (serialization
   *  columns are our own round-trips, not competitor libraries). Defaults true. */
  showStrategy?: boolean;
  /** true hides the "Aggregated · geometric mean" summary table, for panels whose
   *  rows aren't comparable (e.g. compile-time tiers: strip/typecheck/full), where a
   *  geomean across rows is meaningless. */
  hideAggregate?: boolean;
  /** serialization bench: link-speed options (Mbps) for the derived round-trip
   *  metric's selector, and the initial selection. */
  bandwidthsMbps?: number[];
  defaultBandwidthMbps?: number;
  metrics: Metric[];
  competitors: string[];
  /** competitor/form label -> installed library version (shown under the header) */
  versions?: Record<string, string>;
  /** competitor label -> what that column is, revealed by hovering its column
   *  header. Absent for benches whose column names speak for themselves (the
   *  library names on the validation pages), which then render no info glyph. */
  columnNotes?: Record<string, ColumnNote>;
  /** run environment captured at benchmark time */
  meta?: {generatedAt?: string; os?: string; cpu?: string; cores?: number | null; node?: string; typescript?: string};
  sections: BenchSection[];
}

interface BenchCompetitorSource {
  name: string;
  /** per-metric builder body (validation bench): the function this page measures */
  sources?: {validate?: string; validationErrors?: string};
  /** single source (typecost bench, no metric split) */
  source?: string;
  /** pre-highlighted HTML baked in at build time for the static deploy
   *  (scripts/embed-panel-highlights.mjs); absent in dev -> use /api/highlight */
  sourcesHtml?: {validate?: string; validationErrors?: string};
  sourceHtml?: string;
}

interface BenchCaseDetail {
  competitors: BenchCompetitorSource[];
  /** the case's shared tested-data block (identical for every competitor): comment-
   *  labelled valid/invalid sample arrays as one TS snippet, shown syntax-highlighted
   *  in the "Tested data" panel column. `Html` is baked for the static deploy. */
  samplesCode?: string;
  samplesCodeHtml?: string;
  /** correctness bench: the exact sample values each competitor diverged on (deduped
   *  reprs). `accepts` = values the library accepts but mion rejects (the usual
   *  case); `rejects` = the reverse. Present only on rows that actually disagree. */
  disagreements?: {competitor: string; accepts: string[]; rejects: string[]}[];
}

interface DetailEntry {
  state: 'loading' | 'ready' | 'error';
  data?: BenchCaseDetail;
  /** highlighted source HTML aligned to data.competitors ('' = render plain) */
  html?: string[];
  /** highlighted tested-data block (undefined = render plain samplesCode) */
  samplesHtml?: string;
}

/** values[competitor][path] -> geometric mean (or null), plus the section it covers. */
type AggRow = AggregateRow;

const props = defineProps<{
  /** bench slug: fetched from /bench-data/<bench>/index.json */
  bench: string;
  /** when set, render only this metric's block (one benchmark per page) */
  metric?: string;
  /** disable the hover/click "show source" detail panel, for tables with no code to
   *  show (e.g. the correctness page). Pass the string `"false"` from MDC. Typed as a
   *  string (not boolean) so an absent prop stays `undefined` rather than being cast to
   *  `false` by Vue's Boolean-prop coercion (which would disable it on EVERY table). */
  showCode?: string;
  /** disable the per-row heatmap colouring + its legend, for tables where ranking a
   *  row is meaningless (correctness, the pivoted build-cost table). Same `"false"`
   *  string convention as showCode. */
  colorize?: string;
  /** flag-cell mode (pass `"true"`): tint any cell whose value is > 0 red and hide the
   *  "lower/higher is better" direction hint. For the correctness table, where a number
   *  means a divergence (0 = aligned), not a rank. Pairs with `colorize="false"`. */
  tintMisalign?: string;
}>();

/** Enabled unless explicitly passed `"false"` (string from MDC) or boolean `false`. */
const codeEnabled = computed(() => props.showCode !== 'false' && (props.showCode as unknown) !== false);
const colorEnabled = computed(() => props.colorize !== 'false' && (props.colorize as unknown) !== false);
/** On only when explicitly passed `"true"` (string from MDC) or boolean `true`. */
const misalignEnabled = computed(() => props.tintMisalign === 'true' || (props.tintMisalign as unknown) === true);

const {highlight} = useCodeHighlighter();

const index = ref<BenchIndex | null>(null);
const indexState = ref<'loading' | 'ready' | 'missing'>('loading');

/** Row-heatmap coloring style: toggled from the legend; 'tint' background or 'text'. */
const colorMode = ref<'tint' | 'text'>('tint');

/** Link speed (Mbps) for the derived round-trip metric, picked in its block. */
const bandwidthMbps = ref<number>(100);

const details = reactive<Record<string, DetailEntry>>({});

function metricByKey(key: string): Metric | undefined {
  return index.value?.metrics.find((m) => m.key === key);
}

/** Cell unit and heatmap direction for a metric, bound to this table's index
 *  (benchFormat.ts owns the rules; the charts read them the same way). */
function unitFor(metricKey: string): BenchIndex['unit'] | 'bytes' {
  return unitOf(index.value?.metrics ?? [], index.value?.unit, metricKey);
}

function lowerBetterFor(metricKey: string): boolean {
  return lowerBetterOf(index.value?.metrics ?? [], index.value?.unit, metricKey);
}

/** Row-extrema labels for the heatmap legend, by unit. */
function extremaLabels(metricKey: string): {worst: string; best: string} {
  const unit = unitFor(metricKey);
  if (unit === 'bytes') return {worst: 'largest', best: 'smallest'};
  if (unit === 'count') return {worst: 'most', best: 'fewest'};
  return {worst: 'slowest', best: 'fastest'};
}

/** Derived round-trip ops/sec = 1 / (1/encode + 1/decode + network(bytes)), where
 *  network time = bytes·8 / (Mbps·1e6). Returns null when encode/decode are absent. */
function roundtripValue(perMetric: Record<string, PathResult> | undefined, mbps: number): number | null {
  const enc = perMetric?.encdec?.valid;
  const dec = perMetric?.encdec?.invalid;
  const bytes = perMetric?.payload?.valid;
  if (typeof enc !== 'number' || enc <= 0 || typeof dec !== 'number' || dec <= 0) return null;
  const network = typeof bytes === 'number' && bytes > 0 && mbps > 0 ? (bytes * 8) / (mbps * 1_000_000) : 0;
  const total = 1 / enc + 1 / dec + network;
  return total > 0 ? 1 / total : null;
}

/** Sections with the derived `roundtrip` result injected per competitor (reactive
 *  on bandwidth), so the existing per-metric rendering + aggregate work unchanged.
 *  A no-op (same ref) when no metric is `derived`, validation/typecost untouched. */
const enrichedSections = computed<BenchSection[]>(() => {
  if (!index.value) return [];
  if (!index.value.metrics.some((m) => m.derived === 'roundtrip')) return index.value.sections;
  const mbps = bandwidthMbps.value;
  const comps = index.value.competitors;
  return index.value.sections.map((section) => ({
    ...section,
    cases: section.cases.map((kase) => {
      const results: BenchCase['results'] = {};
      for (const [comp, byMetric] of Object.entries(kase.results)) results[comp] = byMetric;
      for (const comp of comps) {
        const value = roundtripValue(kase.results[comp], mbps);
        if (value != null) results[comp] = {...(results[comp] ?? {}), roundtrip: {valid: value, status: 'ok'}};
      }
      return {...kase, results};
    }),
  }));
});

function rowItem(key: string, title: string) {
  return {key, title};
}

// Shared hover-preview / click-to-pin panel behavior (see useDetailPanel).
const {active, pinned, close, preview, leave, pin, panelEnter, panelLeave} = useDetailPanel<{key: string; title: string}>(loadDetail);

const activeDetail = computed<DetailEntry | undefined>(() => (active.value ? details[active.value.key] : undefined));
const panelState = computed<'loading' | 'ready' | 'error'>(() => activeDetail.value?.state ?? 'loading');

/** The source to show for a competitor on THIS page: the metric-specific builder
 *  body (validation bench), or the single source (typecost). Absent → the
 *  competitor doesn't support this metric (e.g. zod has no boolean validate). */
function metricSource(competitor: BenchCompetitorSource): string | undefined {
  if (props.metric) return competitor.sources?.[props.metric as 'validate' | 'validationErrors'];
  // No metric prop: the single typecost source, else (correctness) the is-valid builder.
  return competitor.source ?? competitor.sources?.validate ?? competitor.sources?.validationErrors;
}

/** Build-time-baked HTML for metricSource(competitor), used on the static deploy
 *  where /api/highlight has no server. Absent in dev -> fall back to the runtime
 *  highlighter. */
function metricSourceHtml(competitor: BenchCompetitorSource): string | undefined {
  if (props.metric) return competitor.sourcesHtml?.[props.metric as 'validate' | 'validationErrors'];
  return competitor.sourceHtml ?? competitor.sourcesHtml?.validate ?? competitor.sourcesHtml?.validationErrors;
}

/** The active row's case data (per-competitor results), looked up from the index so
 *  the panel can echo the same metric the table cell shows. */
const activeCase = computed<BenchCase | undefined>(() => {
  if (!index.value || !active.value) return undefined;
  for (const section of enrichedSections.value) {
    const found = section.cases.find((kase) => kase.key === active.value!.key);
    if (found) return found;
  }
  return undefined;
});

/** Detail-panel columns: one per competitor that supports this page's metric, each
 *  carrying the same result (valid + invalid) shown in its table cell. */
const panelColumns = computed(() => {
  const entry = activeDetail.value;
  if (!entry || entry.state !== 'ready' || !entry.data) return [];
  const kase = activeCase.value;
  const metricKey = props.metric ?? index.value?.metrics[0]?.key;
  const cols: Array<{label: string; html?: string; plain?: string; notes?: string[]; metric?: {valid: string; invalid: string; status: 'ok' | 'fail' | 'na'}}> = [];
  // Disagreements on top (correctness bench, divergent rows only): the exact values
  // that produced the divergence, one note per library, what the reader is after.
  const disagreements = entry.data.disagreements;
  if (disagreements?.length) {
    const notes: string[] = [];
    for (const diff of disagreements) {
      if (diff.accepts.length) notes.push(`${diff.competitor} accepts: ${diff.accepts.join(', ')}`);
      if (diff.rejects.length) notes.push(`${diff.competitor} rejects: ${diff.rejects.join(', ')}`);
    }
    if (notes.length) cols.push({label: 'Disagreements vs mion', notes});
  }
  // Shared "Tested data" column next: the exact valid/invalid samples this case runs
  // (identical for every competitor), syntax-highlighted like the source columns.
  const samplesCode = entry.data.samplesCode;
  if (samplesCode) cols.push({label: 'Tested data', html: entry.samplesHtml, plain: samplesCode});
  entry.data.competitors.forEach((competitor, i) => {
    const plain = metricSource(competitor);
    if (!plain) return;
    const cell = kase && metricKey ? combinedCell(kase, metricKey, competitor.name) : null;
    const status: 'ok' | 'fail' | 'na' = cell ? (cell.cls.includes('--fail') ? 'fail' : cell.cls.includes('--ok') ? 'ok' : 'na') : 'na';
    cols.push({label: competitor.name, html: entry.html?.[i], plain, metric: cell ? {valid: cell.valid, invalid: cell.invalid, status} : undefined});
  });
  return cols;
});

/** Build-strategy tags describe RUNTIME validator construction, so they only apply to
 *  the throughput benches: the typecost (type-instantiation count) table hides them. */
const showStrategy = computed(() => index.value?.showStrategy !== false && index.value?.unit !== 'count');

/** Per-column explanations for the caption info icon, empty when the bench index
 *  ships no `columnNotes`, which is what keeps the icon off the other pages. */
const columnNotes = computed<Record<string, ColumnNote>>(() => index.value?.columnNotes ?? {});

/** Which edge a column's tip hangs from: columns in the left half open rightward
 *  and vice versa, so a wide tip always grows toward the middle of the table and
 *  never spills out of the horizontally scrolling wrapper. */
function tipAlign(columnIndex: number): 'left' | 'right' {
  const total = index.value?.competitors.length ?? 0;
  return columnIndex * 2 < total ? 'left' : 'right';
}

/** Installed library version for a column (competitor name, or typecost form label). */
function versionOf(competitor: string): string | undefined {
  return index.value?.versions?.[competitor];
}

/** One-line run-environment summary (date · cpu · os · runtimes) for the info header. */
const runInfo = computed<string | null>(() => {
  const meta = index.value?.meta;
  if (!meta) return null;
  const parts: string[] = [];
  if (meta.generatedAt) {
    const date = new Date(meta.generatedAt);
    if (!Number.isNaN(date.getTime())) parts.push(date.toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric'}));
  }
  if (meta.cpu && meta.cpu !== 'unknown') parts.push(meta.cores ? `${meta.cpu} (${meta.cores} cores)` : meta.cpu);
  if (meta.os) parts.push(meta.os);
  if (meta.node) parts.push(`Node ${shortVersion(meta.node.replace(/^v/, ''))}`);
  if (meta.typescript) parts.push(`TypeScript ${shortVersion(meta.typescript)}`);
  return parts.length ? parts.join(' · ') : null;
});

/** Serialization "verdict" layout: a bench with a DERIVED round-trip metric collapses
 *  its three metrics (round-trip + encode/decode + payload) into ONE stacked table
 *  instead of one block each. Round-trip is the headline + heatmap; enc/dec + bytes
 *  ride along in each cell. */
const isVerdict = computed(() => !!index.value?.metrics.some((m) => m.derived === 'roundtrip'));

/** The metric keys the verdict cell reads, derived by ROLE (not literal key) so a
 *  rename in the gen script doesn't silently break the stacked cell. */
const verdictKeys = computed(() => {
  const metrics = index.value?.metrics ?? [];
  return {
    rt: metrics.find((m) => m.derived === 'roundtrip')?.key,
    throughput: metrics.find((m) => !m.derived && m.unit === 'ops')?.key,
    payload: metrics.find((m) => m.lowerBetter)?.key,
  };
});

/** Metrics to render: one block per metric, the `metric` prop's block, or (verdict)
 *  a single round-trip block that folds the other two into its cells. */
const displayedMetrics = computed<Metric[]>(() => {
  if (!index.value) return [];
  if (isVerdict.value) return index.value.metrics.filter((m) => m.derived === 'roundtrip');
  return props.metric ? index.value.metrics.filter((m) => m.key === props.metric) : index.value.metrics;
});

/** REALWORLD section first (when present), then the rest in their original order.
 *  Reads the bandwidth-enriched sections so the derived round-trip metric + its
 *  aggregate pick up the selected link speed. */
const orderedSections = computed<BenchSection[]>(() => {
  if (!index.value) return [];
  const realworld = enrichedSections.value.filter((section) => section.key === 'REALWORLD');
  const rest = enrichedSections.value.filter((section) => section.key !== 'REALWORLD');
  return [...realworld, ...rest];
});

onMounted(async () => {
  try {
    const res = await fetch(`/bench-data/${props.bench}/index.json`);
    if (!res.ok) {
      indexState.value = 'missing';
      return;
    }
    index.value = (await res.json()) as BenchIndex;
    if (typeof index.value.defaultBandwidthMbps === 'number') bandwidthMbps.value = index.value.defaultBandwidthMbps;
    indexState.value = 'ready';
  } catch {
    indexState.value = 'missing';
  }
});

/** Lazy-fetch + highlight a row's competitor sources once, keyed by its case key. */
async function loadDetail(item: {key: string; title: string}) {
  const key = item.key;
  if (details[key]) return;
  details[key] = {state: 'loading'};
  try {
    const res = await fetch(`/bench-data/${props.bench}/${key}.json`);
    if (!res.ok) {
      details[key] = {state: 'error'};
      return;
    }
    const data = (await res.json()) as BenchCaseDetail;
    details[key] = {state: 'ready', data};
    // Highlight the metric-specific source, aligned by competitor index ('' when
    // this competitor has no source for the page's metric).
    const html = await Promise.all(
      data.competitors.map((competitor) => {
        const baked = metricSourceHtml(competitor);
        if (baked !== undefined) return Promise.resolve(baked);
        const code = metricSource(competitor);
        return code ? highlight(code, 'ts') : Promise.resolve('');
      }),
    );
    // Tested-data block: baked HTML on the static deploy, runtime highlight in dev.
    const samplesHtml = data.samplesCodeHtml ?? (data.samplesCode ? await highlight(data.samplesCode, 'ts') : '');
    const current = details[key];
    if (current && current.state === 'ready') {
      current.html = html;
      current.samplesHtml = samplesHtml || undefined;
    }
  } catch {
    details[key] = {state: 'error'};
  }
}

/** Compact value: ops/sec (1.2M/s) for runtime, or a bare count (1.2M) for the
 *  typecost bench. `bare` drops the `/s` (used for the invalid number, whose unit
 *  is already established by the valid number it sits beside). */
/** Combined cell: the valid (accept) number is the headline, the invalid (reject)
 *  number rides along smaller + dimmer. `cls` colors the whole cell (the valid
 *  number / FAIL / n-a / em-dash); `invalid` is empty when there's no reject
 *  number (always for the single-metric typecost bench). */
interface CombinedCell {
  cls: string;
  valid: string;
  invalid: string;
  /** 0 (worst in its row) → 1 (best); null for non-ok cells. Drives the row heatmap. */
  rank?: number | null;
  /** value > 0: drives the correctness "misaligned" red tint (tintMisalign mode). */
  misaligned?: boolean;
}

function combinedCell(kase: BenchCase, metricKey: string, comp: string): CombinedCell {
  const result = kase.results[comp]?.[metricKey];
  // No entry at all = the competitor can't express this case → n-a (distinct from
  // a measured 0, which is a real value, e.g. a typecost case that cost the type
  // checker zero extra instantiations).
  if (!result) return {cls: 'bench-val--na', valid: 'n-a', invalid: ''};
  if (result.status === 'fail') return {cls: 'bench-val--fail', valid: 'FAIL', invalid: ''};
  if (result.status === 'not-supported') return {cls: 'bench-val--na', valid: 'n-a', invalid: ''};
  const unit = unitFor(metricKey);
  const valid = typeof result.valid === 'number' && result.valid >= 0 ? formatValue(result.valid, unit) : '';
  const invalid = typeof result.invalid === 'number' && result.invalid > 0 ? formatValue(result.invalid, unit, true) : '';
  if (!valid && !invalid) return {cls: 'bench-val--none', valid: '—', invalid: ''};
  // misaligned = the DISPLAYED count is > 0 (Math.round mirrors formatValue for the
  // small counts here), so a geomean that rounds to "0" is not flagged.
  return {cls: 'bench-val--ok', valid: valid || '—', invalid, misaligned: typeof result.valid === 'number' && Math.round(result.valid) > 0};
}

function combinedAggCell(values: {valid: number | null; invalid: number | null}, metricKey: string): CombinedCell {
  const unit = unitFor(metricKey);
  const valid = values.valid != null ? formatValue(values.valid, unit) : '';
  const invalid = values.invalid != null ? formatValue(values.invalid, unit, true) : '';
  // null geomean = the competitor doesn't participate in this row (geomeanOver
  // collapses an all-zero category to 0), so it's n-a, same as a cell.
  if (!valid && !invalid) return {cls: 'bench-val--na', valid: 'n-a', invalid: ''};
  return {cls: 'bench-val--ok', valid: valid || '—', invalid, misaligned: values.valid != null && Math.round(values.valid) > 0};
}

/** Per-row heatmap ranks: 0 = worst in the row, 1 = best, over the positive values
 *  only (others null). Direction follows the metric: count benches (typecost) are
 *  lower-is-better. Small gaps are dampened toward neutral (0.5) so a row of near-ties
 *  isn't painted a dramatic red→green spread. Dampening is always on. */
function ranksFor(values: (number | null)[], lowerBetter = false): (number | null)[] {
  // For lower-is-better metrics (typecost count / payload bytes) a 0 is a real value
  // (free) and ranks BEST; for throughput a 0 means "didn't run" and is excluded.
  const counts = (value: number | null): value is number => value != null && (lowerBetter ? value >= 0 : value > 0);
  const present = values.filter(counts);
  if (present.length < 2) return values.map(() => null);
  const min = Math.min(...present);
  const max = Math.max(...present);
  const spread = max > 0 ? (max - min) / max : 0;
  const factor = Math.min(1, spread / 0.25);
  return values.map((value) => {
    if (!counts(value)) return null;
    let rank = max === min ? 0.5 : (value - min) / (max - min);
    if (lowerBetter) rank = 1 - rank;
    return 0.5 + (rank - 0.5) * factor;
  });
}

/** One combined cell per competitor, in column order, computed once per row, each
 *  carrying its row-relative rank for the heatmap. */
function sectionCells(kase: BenchCase, metricKey: string): CombinedCell[] {
  if (!index.value) return [];
  const comps = index.value.competitors;
  const lowerBetter = index.value.unit === 'count';
  const vals = comps.map((comp) => {
    const result = kase.results[comp]?.[metricKey];
    if (!result || result.status !== 'ok' || typeof result.valid !== 'number') return null;
    return lowerBetter || result.valid > 0 ? result.valid : null;
  });
  const ranks = colorEnabled.value ? ranksFor(vals, lowerBetterFor(metricKey)) : vals.map(() => null);
  return comps.map((comp, i) => ({...combinedCell(kase, metricKey, comp), rank: ranks[i]}));
}

function aggCells(row: AggRow, metricKey: string): CombinedCell[] {
  if (!index.value) return [];
  const comps = index.value.competitors;
  const lowerBetter = index.value.unit === 'count';
  const vals = comps.map((comp) => {
    const value = row.values[comp]?.valid;
    if (typeof value !== 'number') return null;
    return lowerBetter || value > 0 ? value : null;
  });
  const ranks = colorEnabled.value ? ranksFor(vals, lowerBetterFor(metricKey)) : vals.map(() => null);
  return comps.map((comp, i) => ({...combinedAggCell(row.values[comp], metricKey), rank: ranks[i]}));
}

/** A stacked verdict cell: round-trip headline (heatmap driver, higher-better) over a
 *  dim encode/decode line and a payload byte line that carries its OWN lower-better
 *  "fewest bytes = green" cue, independent of the throughput ramp. */
interface VerdictCell {
  cls: string;
  rt: string;
  rank: number | null;
  enc: string;
  dec: string;
  bytes: string;
  bytesMin: boolean;
}

/** Assemble VerdictCell[] from per-column round-trip values + an (enc,dec,bytes) getter.
 *  Shared by the per-case and the geomean-aggregate rows. */
function buildVerdict(rtVals: (number | null)[], get: (i: number) => {enc?: number | null; dec?: number | null; bytes?: number | null}): VerdictCell[] {
  if (!index.value) return [];
  const rtRanks = ranksFor(rtVals, false);
  const ingredients = index.value.competitors.map((_c, i) => get(i));
  // 0 bytes is a REAL, valid (and best) payload, not "absent": a binary literal bakes
  // its single possible value into the compiled fn, so nothing rides the wire. Include
  // it so it wins the "fewest bytes" cue (>= 0, matching ranksFor's lower-better path).
  const present = ingredients.map((g) => g.bytes).filter((v): v is number => typeof v === 'number' && v >= 0);
  const byteMin = present.length ? Math.min(...present) : NaN;
  return ingredients.map(({enc, dec, bytes}, i) => {
    const rtv = rtVals[i];
    if (rtv == null) return {cls: 'bench-val--na', rt: 'n-a', rank: null, enc: '', dec: '', bytes: '', bytesMin: false};
    return {
      cls: 'bench-val--ok',
      rt: formatValue(rtv, 'ops'),
      rank: rtRanks[i],
      enc: typeof enc === 'number' ? formatValue(enc, 'ops', true) : '',
      dec: typeof dec === 'number' ? formatValue(dec, 'ops', true) : '',
      bytes: typeof bytes === 'number' ? formatValue(bytes, 'bytes') : '',
      bytesMin: typeof bytes === 'number' && bytes === byteMin,
    };
  });
}

function verdictCells(kase: BenchCase): VerdictCell[] {
  if (!index.value) return [];
  const comps = index.value.competitors;
  const {rt, throughput, payload} = verdictKeys.value;
  const rtVals = comps.map((comp) => {
    const v = rt ? kase.results[comp]?.[rt]?.valid : undefined;
    return typeof v === 'number' && v > 0 ? v : null;
  });
  return buildVerdict(rtVals, (i) => {
    const tp = throughput ? kase.results[comps[i]]?.[throughput] : undefined;
    return {enc: tp?.valid, dec: tp?.invalid, bytes: payload ? kase.results[comps[i]]?.[payload]?.valid : undefined};
  });
}

function verdictAggCells(row: AggRow): VerdictCell[] {
  if (!index.value) return [];
  const comps = index.value.competitors;
  // The three tiers come from three independent geomean passes (round-trip / encode-
  // decode / payload), matched by row.key. Today every serialization competitor that
  // has encode/decode also has payload and round-trip, so all three tiers average over
  // the same case set. If a future bench gave a competitor encdec without payload (or a
  // metric-specific fail), this cell could pair a round-trip number with enc/dec/bytes
  // computed over a different basis: revisit the per-tier basis if that becomes possible.
  const {throughput, payload} = verdictKeys.value;
  const tRow = throughput ? aggregates.value[throughput]?.find((r) => r.key === row.key) : undefined;
  const pRow = payload ? aggregates.value[payload]?.find((r) => r.key === row.key) : undefined;
  const rtVals = comps.map((comp) => {
    const v = row.values[comp]?.valid;
    return typeof v === 'number' && v > 0 ? v : null;
  });
  return buildVerdict(rtVals, (i) => ({enc: tRow?.values[comps[i]]?.valid, dec: tRow?.values[comps[i]]?.invalid, bytes: pRow?.values[comps[i]]?.valid}));
}

// geomean / commonBasis / geomeanOver live in app/utils/benchAggregate.ts:
// the root landing's HomeBenchTable quotes the same "Overall" numbers, so the math has
// ONE home. A lower-is-better bench (typecost, unit "count") keeps zeros via +1 smoothing there.
const aggregateLowerBetter = computed(() => index.value?.unit === 'count');

/** Per-category + Overall geometric-mean summary for one metric. The math lives in
 *  benchAggregate.ts (the charts and the home summary read the same numbers); this
 *  keeps the table's own section order, REALWORLD first. */
function aggregateFor(metricKey: string): AggRow[] {
  if (!index.value) return [];
  return aggregateRows(orderedSections.value, index.value.competitors, metricKey, aggregateLowerBetter.value);
}

/** Precomputed aggregates keyed by metric. */
const aggregates = computed<Record<string, AggRow[]>>(() => {
  if (!index.value) return {};
  return Object.fromEntries(index.value.metrics.map((metric) => [metric.key, aggregateFor(metric.key)]));
});
</script>

<template>
  <div class="bench-table" :class="`bench-color-${colorMode}`">
    <div v-if="indexState === 'loading'" class="bench-note bench-note--muted">
      <span class="bench-prompt">$</span> loading benchmark&hellip;
    </div>

    <div v-else-if="indexState === 'missing'" class="bench-note">
      <span class="bench-prompt">$</span> Benchmark data not generated yet, run
      <code>pnpm miondevx bench --website</code>.
    </div>

    <template v-else-if="index">
      <!-- One metric block: the # title, then the how-to-read info (cell format,
           strategy key, row-colour controls) between the title and the tables. -->
      <div v-for="metric in displayedMetrics" :key="metric.key" class="bench-metric-block">
        <div class="bench-metric">
          <span class="bench-prompt">#</span> <strong class="bench-metric-name">{{ metric.label }}</strong>
          <span v-if="isVerdict" class="bench-metric-sub">@ {{ bandwidthMbps >= 1000 ? `${bandwidthMbps / 1000} Gbps` : `${bandwidthMbps} Mbps` }}</span>
          <span v-else-if="metric.metricLabel" class="bench-metric-sub">{{ metric.metricLabel }}</span>
        </div>
        <p v-if="codeEnabled" class="bench-metric-hint">hover any row for {{ index.hasSamples ? 'the tested data and ' : '' }}each competitor's source</p>

        <!-- Serialization verdict: page-level sticky link-speed bar: re-derives every
             round-trip headline + the heatmap live; enc/dec + bytes stay frozen below. -->
        <div v-if="isVerdict && index.bandwidthsMbps" class="bench-bw-bar">
          <span id="bench-bw-label" class="bench-bw-label"><svg class="bench-bw-icon" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M1.4 7a9.2 9.2 0 0 1 13.2 0" /><path d="M4.2 9.3a5.6 5.6 0 0 1 7.6 0" /><path d="M6.4 11.9a2.2 2.2 0 0 1 3.2 0" /></g><circle cx="8" cy="13.4" r="0.95" fill="currentColor" /></svg> link speed</span>
          <span class="bench-bw-seg" role="group" aria-labelledby="bench-bw-label">
            <button
              v-for="bw in index.bandwidthsMbps"
              :key="bw"
              type="button"
              class="bench-bw-btn"
              :class="{'bench-bw-btn--on': bandwidthMbps === bw}"
              :aria-pressed="bandwidthMbps === bw"
              @click="bandwidthMbps = bw"
            >{{ bw >= 1000 ? `${bw / 1000} Gbps` : `${bw} Mbps` }}</button>
          </span>
          <span class="bench-bw-hint">round-trip = encode + transmit + decode · transmit = payload × 8 ÷ link speed</span>
        </div>

        <div class="bench-legend">
          <!-- Run environment: when the benchmarks ran + the machine + library versions. -->
          <div v-if="runInfo" class="bench-runinfo">
            <span class="bench-prompt">@</span> <span class="bench-runinfo-text">measured {{ runInfo }}</span>
          </div>
          <div v-if="isVerdict" class="bench-legend-row bench-legend-metric">
            <span class="bench-legend-sample">
              <span class="bench-val-col">
                <span class="bench-val-rt bench-val-primary bench-val--ok">180k/s</span>
                <span class="bench-val-io">&uarr;3.4M &darr;2.5M</span>
                <span class="bench-val-pl bench-val-pl--min">55 B</span>
              </span>
            </span>
            <span class="bench-legend-note">
              each cell stacks <span class="bench-legend-valid">round-trip/sec</span> at the link speed (headline, tinted: green = fastest), then <code>&uarr;encode &darr;decode</code>, then
              <span class="bench-legend-pl">bytes on the wire</span> (green = fewest).<br/><code>n-a</code> = can't round-trip this case (no encode/decode result, mostly the native JSON baseline)
            </span>
          </div>
          <div v-else-if="metric.cellHint" class="bench-legend-row bench-legend-metric">
            <span class="bench-legend-note">
              each cell = {{ metric.cellHint }}; <code>n-a</code> = unsupported or not JSON-safe
            </span>
          </div>
          <div v-else-if="index.showInvalid" class="bench-legend-row bench-legend-metric">
            <span class="bench-legend-sample"><span class="bench-val-wrap"><span class="bench-val-primary bench-val--ok">24M/s</span><span class="bench-val-secondary">47M</span></span></span>
            <span class="bench-legend-note">
              each cell = ops/sec on <span class="bench-legend-valid">valid input</span> (headline) and, smaller, on
              <span class="bench-legend-invalid">invalid input</span><br/><code>FAIL</code> = wrong answer, <code>n-a</code> = unsupported
            </span>
          </div>
          <div v-else class="bench-legend-row bench-legend-metric">
            <span class="bench-legend-note">
              each cell = {{ index.unit === 'count' ? 'TypeScript type-instantiations, lower is better' : 'validations/sec, higher is better' }};
              <code>0</code> is a real value, <code>n-a</code> = unsupported
            </span>
          </div>
          <div v-if="showStrategy" class="bench-legend-strategy">
            <span class="bench-legend-srow"><span class="bench-tag bench-tag--comptime">comptime</span> <span class="bench-legend-note">generated at build time<br /><span class="bench-strat-perf">(no perf hit)</span></span></span>
            <span class="bench-legend-srow"><span class="bench-tag bench-tag--jit">jit</span> <span class="bench-legend-note">compiled at runtime<br /><span class="bench-strat-perf">(perf hit when creating fn)</span></span></span>
            <span class="bench-legend-srow"><span class="bench-tag bench-tag--interpreted">interpreted</span> <span class="bench-legend-note">walked per call<br /><span class="bench-strat-perf">(perf hit when running fn)</span></span></span>
          </div>
          <div v-if="colorEnabled" class="bench-legend-row bench-legend-footer">
            <span class="bench-legend-note">row colour</span>
            <button type="button" class="bench-color-btn" :class="{'bench-color-btn--on': colorMode === 'tint'}" @click="colorMode = 'tint'">tint</button>
            <button type="button" class="bench-color-btn" :class="{'bench-color-btn--on': colorMode === 'text'}" @click="colorMode = 'text'">text</button>
            <span class="bench-legend-note">{{ extremaLabels(metric.key).worst }}</span>
            <span class="bench-grad" aria-hidden="true"></span>
            <span class="bench-legend-note">{{ extremaLabels(metric.key).best }} · per row</span>
          </div>
        </div>

        <!-- Aggregated summary first: geometric mean per competitor + path. -->
        <section v-if="!index.hideAggregate" class="bench-section">
          <header class="bench-caption">
            <span class="bench-prompt">&Sigma;</span> Aggregated · geometric mean
            <span v-if="!misalignEnabled" class="bench-agg-hint">{{ lowerBetterFor(metric.key) ? 'lower is better' : 'higher is better' }}</span>
          </header>
          <div class="bench-scroll">
            <table class="bench-grid">
              <colgroup>
                <col class="bench-col--case" />
                <col v-for="comp in index.competitors" :key="comp" />
              </colgroup>
              <thead>
                <tr class="bench-head">
                  <th class="bench-th bench-th--case">category</th>
                  <th v-for="(comp, ci) in index.competitors" :key="comp" class="bench-th bench-th--comp">
                    <span class="bench-th-name">{{ comp }}<BenchColumnInfo v-if="columnNotes[comp]" :label="comp" :note="columnNotes[comp]" :align="tipAlign(ci)" /></span>
                    <span v-if="versionOf(comp)" class="bench-th-version" :title="versionOf(comp)">v{{ shortVersion(versionOf(comp)) }}</span>
                    <span v-if="showStrategy" class="bench-tag" :class="`bench-tag--${strategyOf(comp)}`">{{ strategyOf(comp) }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in aggregates[metric.key]"
                  :key="row.key"
                  class="bench-row bench-row--agg"
                  :class="{'bench-row--overall': row.key === '__overall__'}"
                >
                  <td class="bench-cell bench-cell--case" :title="row.label">{{ row.label }}</td>
                  <template v-if="isVerdict">
                    <td v-for="(vc, ci) in verdictAggCells(row)" :key="ci" class="bench-cell bench-val" :class="[vc.cls, {'bench-val--ranked': vc.rank != null}]" :style="vc.rank != null ? {'--rank': vc.rank} : undefined">
                      <span class="bench-val-col">
                        <span class="bench-val-rt bench-val-primary">{{ vc.rt }}</span>
                        <span v-if="vc.enc" class="bench-val-io">&uarr;{{ vc.enc }} &darr;{{ vc.dec }}</span>
                        <span v-if="vc.bytes" class="bench-val-pl" :class="{'bench-val-pl--min': vc.bytesMin}">{{ vc.bytes }}</span>
                      </span>
                    </td>
                  </template>
                  <template v-else>
                    <td v-for="(cc, ci) in aggCells(row, metric.key)" :key="ci" class="bench-cell bench-val" :class="[cc.cls, {'bench-val--ranked': cc.rank != null, 'bench-val--misaligned': misalignEnabled && cc.misaligned}]" :style="cc.rank != null ? {'--rank': cc.rank} : undefined">
                      <span class="bench-val-wrap"><span class="bench-val-primary">{{ cc.valid }}</span><span v-if="cc.invalid" class="bench-val-secondary">{{ cc.invalid }}</span></span>
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-for="section in orderedSections" :key="section.key" class="bench-section">
          <header class="bench-caption">
            <span class="bench-prompt">&gt;</span> {{ section.label }}
          </header>

          <div class="bench-scroll">
            <table class="bench-grid">
              <colgroup>
                <col class="bench-col--case" />
                <col v-for="comp in index.competitors" :key="comp" />
              </colgroup>
              <thead>
                <tr class="bench-head">
                  <th class="bench-th bench-th--case">case</th>
                  <th v-for="(comp, ci) in index.competitors" :key="comp" class="bench-th bench-th--comp">
                    <span class="bench-th-name">{{ comp }}<BenchColumnInfo v-if="columnNotes[comp]" :label="comp" :note="columnNotes[comp]" :align="tipAlign(ci)" /></span>
                    <span v-if="versionOf(comp)" class="bench-th-version" :title="versionOf(comp)">v{{ shortVersion(versionOf(comp)) }}</span>
                    <span v-if="showStrategy" class="bench-tag" :class="`bench-tag--${strategyOf(comp)}`">{{ strategyOf(comp) }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="kase in section.cases"
                  :key="kase.key"
                  class="bench-row"
                  :class="{'bench-row--active': codeEnabled && active?.key === kase.key, 'bench-row--static': !codeEnabled}"
                  :tabindex="codeEnabled ? 0 : undefined"
                  @mouseenter="codeEnabled && preview(rowItem(kase.key, kase.title))"
                  @mouseleave="codeEnabled && leave()"
                  @focus="codeEnabled && preview(rowItem(kase.key, kase.title))"
                  @blur="codeEnabled && leave()"
                  @click="codeEnabled && pin(rowItem(kase.key, kase.title))"
                  @keydown.enter.prevent="codeEnabled && pin(rowItem(kase.key, kase.title))"
                  @keydown.space.prevent="codeEnabled && pin(rowItem(kase.key, kase.title))"
                >
                  <td class="bench-cell bench-cell--case" :title="kase.title">{{ kase.title }}</td>
                  <template v-if="isVerdict">
                    <td v-for="(vc, ci) in verdictCells(kase)" :key="ci" class="bench-cell bench-val" :class="[vc.cls, {'bench-val--ranked': vc.rank != null}]" :style="vc.rank != null ? {'--rank': vc.rank} : undefined">
                      <span class="bench-val-col">
                        <span class="bench-val-rt bench-val-primary">{{ vc.rt }}</span>
                        <span v-if="vc.enc" class="bench-val-io">&uarr;{{ vc.enc }} &darr;{{ vc.dec }}</span>
                        <span v-if="vc.bytes" class="bench-val-pl" :class="{'bench-val-pl--min': vc.bytesMin}">{{ vc.bytes }}</span>
                      </span>
                    </td>
                  </template>
                  <template v-else>
                    <td v-for="(cc, ci) in sectionCells(kase, metric.key)" :key="ci" class="bench-cell bench-val" :class="[cc.cls, {'bench-val--ranked': cc.rank != null, 'bench-val--misaligned': misalignEnabled && cc.misaligned}]" :style="cc.rank != null ? {'--rank': cc.rank} : undefined">
                      <span class="bench-val-wrap"><span class="bench-val-primary">{{ cc.valid }}</span><span v-if="cc.invalid" class="bench-val-secondary">{{ cc.invalid }}</span></span>
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </template>

    <!-- Shared full-width bottom detail panel (see DetailPanel + useDetailPanel). -->
    <DetailPanel
      :open="!!active"
      :pinned="pinned"
      :title="active?.title ?? ''"
      :state="panelState"
      :columns="panelColumns"
      @close="close"
      @panelenter="panelEnter"
      @panelleave="panelLeave"
    />
  </div>
</template>

<style scoped>
.bench-table {
  margin: 1.5rem 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.bench-prompt {
  color: var(--ui-primary);
  user-select: none;
}

.bench-metric-block + .bench-metric-block {
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px dashed color-mix(in srgb, var(--color-brand-500) 30%, transparent);
}

.bench-metric {
  margin: 0 0 0.3rem;
  font-size: 0.78rem;
  color: var(--ui-text-muted, #9aa0a6);
}

.bench-metric-name {
  color: var(--ui-text-highlighted, #e8eaed);
  font-size: 0.92rem;
}

/* Hover hint directly under the # title, above the how-to-read info. */
.bench-metric-hint {
  margin: 0 0 0.9rem;
  font-size: 0.72rem;
  color: var(--ui-text-muted, #9aa0a6);
}

.bench-metric-sub {
  margin-left: 0.5rem;
}

/* How-to-read legend: metric + combined cell + status symbols + build-strategy tags. */
.bench-legend {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin: 0 0 1.25rem;
  padding: 0.55rem 0.85rem;
  font-size: 0.74rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.4rem;
  background: var(--rt-surface, rgba(20, 20, 20, 0.4));
}

.bench-legend-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem 0.55rem;
}

/* Row-colour controls sit at the bottom of the legend, set off by a subtle rule. */
.bench-legend-footer {
  margin-top: 0.2rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--ui-border);
}

.bench-legend-sample {
  flex: none;
  padding: 0.1rem 2.4rem 0.1rem 0.4rem;
  font-size: 0.82rem;
}

.bench-legend-note {
  color: var(--ui-text-muted, #9aa0a6);
  line-height: 1.4;
}

.bench-legend code {
  color: var(--ui-text-highlighted, #e8eaed);
}

/* Build-strategy tag (comptime / jit / interpreted), in column headers + legend. */
/* Plain coloured text (more readable than a bordered pill). */
.bench-tag {
  display: inline-block;
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1.45;
}

.bench-tag--comptime {
  color: var(--ui-primary);
}

.bench-tag--jit {
  color: var(--rt-note, #c8b072);
}

.bench-tag--interpreted {
  color: var(--ui-text-dimmed, var(--ui-text-muted, #9aa0a6));
}

/* Strategy key: three equal columns (comptime / jit / interpreted), left-aligned,
   glosses wrap within their column; set off by a subtle rule like the footer. */
.bench-legend-strategy {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: start;
  gap: 0.3rem 1.25rem;
  margin-top: 0.2rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--ui-border);
}

.bench-legend-srow {
  line-height: 1.45;
}

.bench-legend-srow .bench-tag {
  margin-right: 0.35rem;
}

/* Second line: the performance note, a touch dimmer than the mechanism text. */
.bench-strat-perf {
  color: var(--ui-text-dimmed, var(--ui-text-muted, #9aa0a6));
}

/* Metric-explanation row: let the description text expand to fill the row. */
.bench-legend-metric .bench-legend-note {
  flex: 1;
  min-width: 0;
}

/* Row-heatmap controls + gradient sample. */
.bench-color-btn {
  padding: 0.1rem 0.5rem;
  font-family: inherit;
  font-size: 0.7rem;
  color: var(--ui-text-muted, #9aa0a6);
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--ui-border);
  border-radius: 0.3rem;
}

.bench-color-btn--on {
  color: var(--ui-text-highlighted, #e8eaed);
  border-color: var(--ui-primary);
  background: color-mix(in srgb, var(--color-brand-500) 12%, transparent);
}

.bench-grad {
  display: inline-block;
  width: 84px;
  height: 0.5rem;
  border-radius: 0.25rem;
  background: linear-gradient(90deg, hsl(0 55% 50%), hsl(calc(var(--site-hue-good) / 2) 55% 50%), hsl(var(--site-hue-good) 55% 50%));
}

.bench-legend-valid {
  color: var(--ui-primary);
}

.bench-legend-invalid {
  color: var(--ui-text-dimmed, var(--ui-text-muted, #9aa0a6));
}

.bench-note {
  display: block;
  padding: 0.85rem 1rem;
  font-size: 0.85rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.4rem;
  background: var(--rt-surface, rgba(20, 20, 20, 0.55));
}

.bench-note code {
  color: var(--ui-primary);
}

.bench-note--muted {
  color: var(--ui-text-muted, #9aa0a6);
  border-style: dashed;
}

.bench-section {
  margin-bottom: 1.5rem;
}

.bench-caption {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--ui-primary);
  border: 1px solid var(--ui-border);
  border-bottom: none;
  border-radius: 0.4rem 0.4rem 0 0;
  background: color-mix(in srgb, var(--color-brand-500) 8%, transparent);
}

.bench-scroll {
  overflow-x: auto;
  border: 1px solid var(--ui-border);
  border-radius: 0 0 0.4rem 0.4rem;
  background: var(--rt-surface, rgba(20, 20, 20, 0.55));
}

.bench-agg-hint {
  margin-left: auto;
  font-size: 0.66rem;
  font-weight: 400;
  text-transform: lowercase;
  letter-spacing: 0.02em;
  color: var(--ui-text-muted, #9aa0a6);
}

/* Aggregated rows are a read-only summary: no hover detail panel. */
.bench-row--agg {
  cursor: default;
}

.bench-row--overall {
  font-weight: 600;
  border-top: 1px solid color-mix(in srgb, var(--color-brand-500) 30%, transparent);
}

.bench-row--overall .bench-cell {
  color: var(--ui-text-highlighted, #e8eaed);
}

.bench-grid {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.bench-col--case {
  width: 16%;
  min-width: 8rem;
}

.bench-head {
  background: color-mix(in srgb, var(--color-brand-500) 6%, transparent);
}

.bench-th {
  padding: 0.35rem 0.7rem;
  font-size: 0.66rem;
  font-weight: 600;
  text-align: right;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted, #9aa0a6);
  border-bottom: 1px solid color-mix(in srgb, var(--color-brand-500) 25%, transparent);
  overflow-wrap: anywhere;
}

/* Competitor column header: centered + bright, same look as the type-cost table. */
.bench-th--comp {
  text-align: center;
  color: var(--ui-text-highlighted, #e8eaed);
  border-left: 1px solid color-mix(in srgb, var(--color-brand-500) 18%, transparent);
}

.bench-th-name {
  display: block;
}

/* installed library version under the column name, dim + monospace-ish */
.bench-th-version {
  display: block;
  margin-top: 0.1rem;
  font-size: 0.72em;
  font-weight: 400;
  color: var(--ui-text-dimmed, #9aa0a6);
  font-variant-numeric: tabular-nums;
}

.bench-th--comp .bench-tag {
  margin-top: 0.2rem;
  font-weight: 600;
}

/* The whole header cell is the hover target for its column note, the info glyph
   BenchColumnInfo draws is only the cue that there is something to hover. Reaching
   into the child's tip is deliberate: the trigger has to be the cell, which lives
   here, while the tip's own look stays the child's business. */
.bench-th--comp:hover :deep(.bench-info-tip) {
  opacity: 1;
  transform: translateY(0);
}

.bench-th--comp:hover :deep(.bench-info-glyph) {
  color: var(--ui-primary);
  opacity: 1;
}

/* Run-environment line above the tables: quiet, terminal-style. */
.bench-runinfo {
  margin: 0 0 0.85rem;
  font-size: 0.7rem;
  color: var(--ui-text-muted, #b3b8bd);
}
.bench-runinfo .bench-prompt {
  margin-right: 0.4rem;
  opacity: 0.7;
}
.bench-runinfo-text {
  font-variant-numeric: tabular-nums;
}

.bench-th--case {
  text-align: left;
}

.bench-row {
  cursor: pointer;
  outline: none;
  transition: background 0.12s ease;
  border-left: 3px solid transparent;
}

.bench-row:hover,
.bench-row:focus-visible,
.bench-row--active {
  background: color-mix(in srgb, var(--color-brand-500) 10%, transparent);
  border-left-color: var(--ui-primary);
}

/* Non-interactive rows (showCode disabled): no pointer, no hover highlight. */
.bench-row--static {
  cursor: default;
}

.bench-row--static:hover,
.bench-row--static:focus-visible {
  background: transparent;
  border-left-color: transparent;
}

.bench-cell {
  padding: 0.5rem 0.7rem;
  font-size: 0.76rem;
  text-align: right;
  border-bottom: 1px solid color-mix(in srgb, var(--color-brand-500) 12%, transparent);
  white-space: nowrap;
}

.bench-cell--case {
  text-align: left;
  color: var(--ui-text-highlighted, #e8eaed);
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* Subtle separator between competitor columns. The combined value is centered so
   the valid number sits centered and the invalid annotation hangs off its corner. */
.bench-val {
  border-left: 1px solid color-mix(in srgb, var(--color-brand-500) 12%, transparent);
  text-align: center;
}

.bench-val--ok {
  color: var(--ui-primary);
}

.bench-val--fail {
  color: #e0533d;
}

.bench-val--na,
.bench-val--none {
  color: var(--ui-text-muted, #9aa0a6);
}

/* Row heatmap: --rank (0 = worst in the row → 1 = best) drives one hsl ramp
   (red → amber → green), dampened upstream so near-ties stay neutral. Only ok cells
   are ranked; two modes chosen from the legend. */
.bench-color-tint .bench-val--ranked {
  background: hsl(calc(var(--rank) * var(--site-hue-good) * 1deg) 55% 48% / 0.2);
}

/* Correctness "misaligned" flag (tintMisalign mode): any cell whose value is > 0 (   a divergence from mion)gets a flat red tint + reddened number. Not a rank
   ramp; a binary "this library disagreed here". */
.bench-val--misaligned {
  background: hsl(0deg 60% 50% / 0.18);
}

.bench-val--misaligned .bench-val-primary {
  color: hsl(0deg 75% 72%);
}

:root.light .bench-val--misaligned .bench-val-primary {
  color: hsl(0deg 70% 45%);
}

.bench-color-tint .bench-val--ranked .bench-val-primary {
  color: var(--ui-text-highlighted, #e8eaed);
}

.bench-color-text .bench-val--ranked .bench-val-primary {
  color: hsl(calc(var(--rank) * var(--site-hue-good) * 1deg) 58% 68%);
}

/* Light theme: darker numbers so the ramp stays legible on the light surface. */
:root.light .bench-color-text .bench-val--ranked .bench-val-primary {
  color: hsl(calc(var(--rank) * var(--site-hue-good) * 1deg) 55% 38%);
}

/* Combined cell: valid (accept) is the centered headline (inherits the cell's
   ok/fail color); invalid (reject) hangs off its bottom-right corner, smaller +
   dimmed. Both colors are theme tokens (Nuxt UI) so they adapt to light + dark. */
.bench-val-wrap {
  position: relative;
  display: inline-block;
}

.bench-val-primary {
  font-variant-numeric: tabular-nums;
}

.bench-val-secondary {
  position: absolute;
  top: 0.85em;
  left: 100%;
  margin-left: 0.1rem;
  font-size: 0.65rem;
  line-height: 1;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-dimmed, var(--ui-text-muted, #9aa0a6));
}

/* ── Serialization "verdict" layout ──────────────────────────────────────────
   Sticky page-level link-speed bar: the one knob that re-derives every round-trip
   headline + the heatmap. Sits under the fixed docs header. */
.bench-bw-bar {
  position: sticky;
  top: var(--ui-header-height, 4rem);
  z-index: 6;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem 0.75rem;
  margin: 0 0 0.85rem;
  padding: 0.45rem 0.7rem;
  background: var(--rt-surface, rgba(20, 20, 20, 0.7));
  border: 1px solid color-mix(in srgb, var(--color-brand-500) 18%, transparent);
  border-radius: 0.5rem;
  backdrop-filter: blur(8px);
}
.bench-bw-label {
  font-size: 0.82rem;
  color: var(--ui-text-muted, #b3b8bd);
}
/* Inline SVG rather than an icon font: the site ships no webfont, so the Tabler
   class this used to carry drew nothing at all. */
.bench-bw-icon {
  vertical-align: -0.14em;
  margin-right: 0.2rem;
}
.bench-bw-seg {
  display: inline-flex;
  border: 1px solid color-mix(in srgb, var(--color-brand-500) 28%, transparent);
  border-radius: 0.4rem;
  overflow: hidden;
}
.bench-bw-btn {
  border: none;
  border-right: 1px solid color-mix(in srgb, var(--color-brand-500) 18%, transparent);
  background: transparent;
  padding: 0.22rem 0.7rem;
  font: inherit;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted, #b3b8bd);
  cursor: pointer;
}
.bench-bw-btn:last-child {
  border-right: none;
}
.bench-bw-btn--on {
  background: color-mix(in srgb, var(--color-brand-500) 22%, transparent);
  color: var(--ui-text-highlighted, #e8eaed);
  font-weight: 600;
}
.bench-bw-hint {
  font-size: 0.72rem;
  color: var(--ui-text-dimmed, #9aa0a6);
}

/* Stacked verdict cell: round-trip headline (heatmap-tinted) over dim encode/decode
   and a payload byte line that carries its own lower-better "fewest = green" cue. */
.bench-val-col {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  line-height: 1.18;
}
.bench-val-rt {
  font-size: 0.82rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.bench-val-io {
  font-size: 0.62rem;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-dimmed, #9aa0a6);
}
.bench-val-pl {
  font-size: 0.62rem;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted, #b3b8bd);
}
/* lower-better "fewest bytes" cue: text (not a cell background), so it never reads
   as a second heatmap signal next to the round-trip tint. */
.bench-val-pl--min {
  color: var(--site-accent);
  font-weight: 600;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}
:root.light .bench-val-pl--min {
  color: var(--color-brand-700);
}
.bench-legend-pl {
  color: var(--site-accent);
}

/* ── Narrow viewports ────────────────────────────────────────────────────────
   The stacked verdict cell (round-trip headline + enc/dec + bytes) is ~3 lines
   tall and case names can be long, so both blow out the row on phones. On small
   screens the case column collapses to one ellipsised line (the full name stays
   on hover via the title attribute), the verdict stack tightens, the value tiers
   shrink, and the sticky link-speed bar stays thumb-reachable. Styling only. */
@media (max-width: 640px) {
  .bench-col--case {
    width: 30%;
    min-width: 5.5rem;
  }
  /* one clamped line instead of wrapping to two or three */
  .bench-cell--case {
    max-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bench-cell {
    padding: 0.4rem 0.5rem;
    font-size: 0.72rem;
  }
  .bench-th {
    padding: 0.3rem 0.5rem;
  }
  .bench-val-col {
    gap: 0;
    line-height: 1.12;
  }
  .bench-val-rt {
    font-size: 0.76rem;
  }
  .bench-val-io,
  .bench-val-pl {
    font-size: 0.58rem;
  }
  /* bigger touch target for the bandwidth segmented control */
  .bench-bw-btn {
    padding: 0.45rem 0.7rem;
    min-height: 2.25rem;
  }
}

@media (max-width: 380px) {
  .bench-col--case {
    width: 26%;
    min-width: 4.25rem;
  }
  .bench-cell {
    padding: 0.35rem 0.35rem;
    font-size: 0.68rem;
  }
  .bench-th {
    padding: 0.3rem 0.35rem;
    font-size: 0.6rem;
  }
  .bench-val-rt {
    font-size: 0.72rem;
  }
  .bench-val-io,
  .bench-val-pl {
    font-size: 0.54rem;
  }
  /* the bandwidth note is the least essential token, drop it to save a row */
  .bench-bw-hint {
    display: none;
  }
  .bench-bw-bar {
    gap: 0.4rem 0.5rem;
    padding: 0.4rem 0.5rem;
  }
}
</style>
