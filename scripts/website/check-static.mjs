// check-static.mjs — post-build gate for the docs site: serve the PRERENDERED
// artifact (container/website/.output/public) and prove every benchmark page can
// actually render its benchmark.
//
// Why this exists: the bench tables are client-rendered. `BenchTable.vue` fetches
// /bench-data/<bench>/index.json on mount, and when that file is missing it renders
// a tidy "Benchmark data not generated yet" notice instead of failing. That is right
// for a fresh clone and wrong for a deploy: a benchmark stage that dies mid-run ships
// a green build whose pages are empty (exactly what happened to the serialization
// pages). Prerendered HTML can't reveal it either, since the table only appears after
// hydration. So we replay what the browser does, over HTTP, against the real artifact:
//
//   1. discover every page under content/<N>.benchmarks/ and the ::bench-table
//      components it declares (bench slug + optional metric),
//   2. GET the page through the same clean-URL resolution Cloudflare Pages uses
//      (scripts/website/serve.mjs) and assert the table mounted,
//   3. GET the /bench-data/<bench>/index.json the component would fetch and assert it
//      holds real, renderable numbers — mirroring BenchTable's own cell logic, so a
//      dataset that would paint every cell `n-a` fails here rather than on the web,
//   4. GET one hover-panel detail file per section (the lazy per-case fetch).
//
// Usage:  node scripts/website/check-static.mjs [publicDir]
//         pnpm rtx website check --static
// Runs automatically as the last stage of `pnpm rtx website build` (generate).

import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {die, note, reportCliError} from '../lib/proc.mjs';
import {createStaticServer, DEFAULT_ROOT, hasBuild} from './serve.mjs';

const CONTENT_DIR = join(REPO_ROOT, 'container/website/content');

// ── page discovery ───────────────────────────────────────────────────────────

// The benchmarks section dir, found by name so renumbering it (7.benchmarks ->
// 9.benchmarks) doesn't silently disable the whole check.
function benchmarksDir() {
  const match = readdirSync(CONTENT_DIR, {withFileTypes: true}).find((entry) => entry.isDirectory() && /^\d+\.benchmarks$/.test(entry.name));
  if (!match) die(`check-static: no '<N>.benchmarks' directory under ${CONTENT_DIR} - has the section moved?`);
  return match.name;
}

// Nuxt Content drops the numeric ordering prefix from every path segment:
// content/7.benchmarks/5.serialization.md -> /benchmarks/serialization.
const routeSegment = (name) => name.replace(/^\d+\./, '').replace(/\.md$/, '');

// The `::bench-table{bench="x" metric="y"}` components on one page, in order.
function benchTables(markdown) {
  const tables = [];
  for (const match of markdown.matchAll(/^::bench-table\{([^}]*)\}/gm)) {
    const props = {};
    for (const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) props[attr[1]] = attr[2];
    tables.push(props);
  }
  return tables;
}

function benchmarkPages() {
  const dir = benchmarksDir();
  const pages = [];
  for (const file of readdirSync(join(CONTENT_DIR, dir)).sort()) {
    if (!file.endsWith('.md')) continue;
    const markdown = readFileSync(join(CONTENT_DIR, dir, file), 'utf8');
    pages.push({source: `${dir}/${file}`, route: `/${routeSegment(dir)}/${routeSegment(file)}`, tables: benchTables(markdown)});
  }
  if (pages.length === 0) die(`check-static: no .md pages under ${join(CONTENT_DIR, dir)}`);
  return pages;
}

// ── the cell logic BenchTable renders with (kept in sync with BenchTable.vue) ──

/** A bench whose metrics carry a client-derived round-trip renders ONE stacked
 *  "verdict" block instead of one block per metric (the serialization pages). */
const isVerdict = (index) => (index.metrics ?? []).some((metric) => metric.derived === 'roundtrip');

/** Metric keys a page paints cells for: the derived round-trip on a verdict bench,
 *  the `metric` prop when the page pins one, else every metric in the index. */
function displayedMetrics(index, props) {
  const metrics = index.metrics ?? [];
  if (isVerdict(index)) return metrics.filter((metric) => metric.derived === 'roundtrip');
  if (props.metric) return metrics.filter((metric) => metric.key === props.metric);
  return metrics;
}

/** True when this competitor's cell shows a number rather than `n-a` / `FAIL` / `—`.
 *  Round-trip is DERIVED client-side from encode + decode, so it needs both. */
function rendersValue(perMetric, metricKey, metric) {
  if (!perMetric) return false;
  if (metric?.derived === 'roundtrip') {
    const encode = perMetric.encdec?.valid;
    const decode = perMetric.encdec?.invalid;
    return typeof encode === 'number' && encode > 0 && typeof decode === 'number' && decode > 0;
  }
  const result = perMetric[metricKey];
  if (!result || result.status === 'fail' || result.status === 'not-supported') return false;
  return (typeof result.valid === 'number' && result.valid >= 0) || (typeof result.invalid === 'number' && result.invalid > 0);
}

// ── HTTP helpers (against our own static server) ──────────────────────────────

async function get(base, path) {
  try {
    const res = await fetch(`${base}${path}`);
    return {ok: res.ok, status: res.status, body: res.ok ? await res.text() : ''};
  } catch (err) {
    return {ok: false, status: 0, body: '', error: err.message};
  }
}

async function getJson(base, path) {
  const res = await get(base, path);
  if (!res.ok) return {ok: false, status: res.status, reason: res.error ? `request failed (${res.error})` : `HTTP ${res.status}`};
  try {
    return {ok: true, data: JSON.parse(res.body)};
  } catch {
    return {ok: false, status: res.status, reason: 'response is not valid JSON'};
  }
}

// ── the checks ───────────────────────────────────────────────────────────────

const pass = (msg) => console.log(`  PASS  ${msg}`);
const fail = (msg) => (console.error(`  FAIL  ${msg}`), 1);

/** The page itself prerendered, and the bench-table component mounted on it. */
async function checkPage(base, page) {
  const res = await get(base, page.route);
  if (!res.ok) return fail(`${page.route}: HTTP ${res.status}${res.error ? ` (${res.error})` : ''} - page missing from the build`);
  // The table is client-rendered, so the prerendered HTML carries the component's
  // shell (and its loading notice), not the rows. A missing shell means the page
  // shipped without the component at all (unregistered / renamed / MDC typo).
  if (!res.body.includes('bench-table')) return fail(`${page.route}: no bench-table markup in the prerendered HTML (${page.source})`);
  pass(`${page.route}: page prerendered with ${page.tables.length} bench-table${page.tables.length === 1 ? '' : 's'}`);
  return 0;
}

/** The dataset the component fetches: present, well-formed and actually populated. */
async function checkBench(base, page, props) {
  const bench = props.bench;
  const indexPath = `/bench-data/${bench}/index.json`;
  const index = await getJson(base, indexPath);
  if (!index.ok) {
    return fail(`${page.route}: ${indexPath} - ${index.reason}. The page renders "Benchmark data not generated yet" (the benchmark stage produced nothing).`);
  }
  const data = index.data;
  const competitors = data.competitors ?? [];
  const sections = data.sections ?? [];
  const cases = sections.flatMap((section) => section.cases ?? []);
  if (competitors.length === 0) return fail(`${page.route}: ${indexPath} has no competitors - the table would render column-less`);
  if (cases.length === 0) return fail(`${page.route}: ${indexPath} has no cases - the table would render empty`);

  const metrics = displayedMetrics(data, props);
  if (metrics.length === 0) {
    const known = (data.metrics ?? []).map((metric) => metric.key).join(', ') || 'none';
    return fail(`${page.route}: metric="${props.metric ?? ''}" is not in ${indexPath} (has: ${known})`);
  }
  pass(`${page.route}: ${indexPath} (${competitors.length} competitors, ${sections.length} sections, ${cases.length} cases)`);

  let failures = 0;
  for (const metric of metrics) {
    // Every section must paint at least one real number. A section of pure `n-a`
    // is the "table rendered but says nothing" failure the deploy has to catch.
    const empty = [];
    let filled = 0;
    for (const section of sections) {
      const rendered = (section.cases ?? []).filter((kase) => competitors.some((comp) => rendersValue(kase.results?.[comp], metric.key, metric)));
      filled += rendered.length;
      if (rendered.length === 0) empty.push(section.key);
    }
    if (empty.length > 0) {
      failures += fail(`${page.route}: metric '${metric.key}' renders n-a for every case in section${empty.length === 1 ? '' : 's'} ${empty.join(', ')}`);
      continue;
    }
    pass(`${page.route}: metric '${metric.key}' renders values in ${filled}/${cases.length} cases, all ${sections.length} sections covered`);
  }

  // The hover panel lazy-fetches <case>.json per row; sample the first case of each
  // section. Pages that disable the panel (show-code="false") never fetch them.
  if ((props['show-code'] ?? props.showCode) === 'false') return failures;
  let detailFailures = 0;
  for (const section of sections) {
    const first = (section.cases ?? [])[0];
    if (!first) continue;
    const detail = await getJson(base, `/bench-data/${bench}/${first.key}.json`);
    if (!detail.ok) {
      detailFailures += fail(`${page.route}: /bench-data/${bench}/${first.key}.json - ${detail.reason} (the row's hover panel would error)`);
      continue;
    }
    if (!Array.isArray(detail.data.competitors)) detailFailures += fail(`${page.route}: /bench-data/${bench}/${first.key}.json has no competitors array`);
  }
  if (detailFailures === 0) pass(`${page.route}: hover-panel detail present for all ${sections.length} sections`);
  return failures + detailFailures;
}

export async function main(args) {
  const root = args.find((arg) => !arg.startsWith('-')) ?? DEFAULT_ROOT;
  if (!hasBuild(root)) die(`check-static: no prerendered site at ${root} - run 'pnpm rtx website build' first.`);

  const pages = benchmarkPages();
  const server = createStaticServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  note(`check-static: serving ${root} and checking ${pages.length} benchmark pages`);

  let failures = 0;
  try {
    for (const page of pages) {
      failures += await checkPage(base, page);
      if (page.tables.length === 0) {
        failures += fail(`${page.route}: no ::bench-table component in ${page.source} - a benchmarks page with no benchmark`);
        continue;
      }
      for (const props of page.tables) {
        if (!props.bench) {
          failures += fail(`${page.route}: a ::bench-table in ${page.source} has no bench="…" prop`);
          continue;
        }
        failures += await checkBench(base, page, props);
      }
    }
  } finally {
    // close() alone leaves fetch's keep-alive sockets open, which would hold the
    // process (and the CI step) past the last check.
    server.close();
    server.closeAllConnections();
  }

  if (failures > 0) die(`check-static: FAIL - ${failures} check${failures === 1 ? '' : 's'} failed. The built site would ship benchmark pages that render nothing; do NOT deploy it.`);
  note(`check-static: PASS - every benchmark page renders its benchmark (${pages.length} pages)`);
}

if (import.meta.main) {
  loadEnv();
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
