// check-static.mjs — post-build gate for a docs site: serve the PRERENDERED
// artifact (container/website/.output/<site>/public) and prove it is not hollow.
//
// The two sites need DIFFERENT proofs, because their benchmark pages are fed
// differently:
//
//   runtypes — `::bench-table` components fetch /bench-data/<bench>/*.json at
//     runtime, so the gate replays those fetches (everything below).
//   mion — `:bench-chart` and `:server-bench-table` components fetch
//     /bench-data/<bench>/index.json at runtime too, so a missing dataset renders a
//     "not generated yet" notice instead of failing the build. The gate asserts every
//     content page prerenders, its chart components made it into the HTML, and every
//     dataset those components read actually shipped with rows in it.
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
// Usage:  node scripts/website/check-static.mjs [publicDir] [--site <site>]
//         pnpm rtx website check --static [--site <site>]
// Runs automatically as the last stage of `pnpm rtx website build` (generate).

import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {die, note, reportCliError} from '../lib/proc.mjs';
import {createStaticServer, hasBuild, publicRoot} from './serve.mjs';

const contentDir = (site) => join(REPO_ROOT, 'container/website/sites', site, 'content');

// ── page discovery ───────────────────────────────────────────────────────────

// The benchmarks section dir, found by name so renumbering it (07.benchmarks ->
// 09.benchmarks) doesn't silently disable the whole check.
function benchmarksDir(contentRoot) {
  const match = readdirSync(contentRoot, {withFileTypes: true}).find((entry) => entry.isDirectory() && /^\d+\.benchmarks$/.test(entry.name));
  if (!match) die(`check-static: no '<N>.benchmarks' directory under ${contentRoot} - has the section moved?`);
  return match.name;
}

// Nuxt Content drops the numeric ordering prefix from every path segment:
// content/07.benchmarks/05.serialization.md -> /benchmarks/serialization.
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

function benchmarkPages(contentRoot) {
  const dir = benchmarksDir(contentRoot);
  const pages = [];
  for (const file of readdirSync(join(contentRoot, dir)).sort()) {
    if (!file.endsWith('.md')) continue;
    const markdown = readFileSync(join(contentRoot, dir, file), 'utf8');
    pages.push({source: `${dir}/${file}`, route: `/${routeSegment(dir)}/${routeSegment(file)}`, tables: benchTables(markdown)});
  }
  if (pages.length === 0) die(`check-static: no .md pages under ${join(contentRoot, dir)}`);
  return pages;
}

// ── the mion gate: every content page in the tree, and the charts it declares ──

/** Every .md page in a content tree, as {source, route, charts}. `index.md` is the
 *  landing page at `/`; every other file/dir contributes one prefix-stripped segment. */
function allPages(contentRoot) {
  const pages = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.md')) continue;
      const source = relative(contentRoot, full);
      const route = source === 'index.md' ? '/' : `/${source.split('/').map(routeSegment).join('/')}`;
      const markdown = readFileSync(full, 'utf8');
      // `:bench-chart{bench="x" metric="y" section="z"}` and
      // `:server-bench-table{bench="x" section="z"}` — inline MDC, either quote style.
      // Both fetch /bench-data/<bench>/index.json at runtime, so the datasets they name
      // are what this gate has to prove actually shipped.
      const charts = [...markdown.matchAll(/:bench-chart\{([^}]*)\}/g)].map((match) => ({
        bench: /bench=['"]([^'"]+)['"]/.exec(match[1])?.[1],
        metric: /metric=['"]([^'"]+)['"]/.exec(match[1])?.[1],
        section: /section=['"]([^'"]+)['"]/.exec(match[1])?.[1],
      }));
      const tables = [...markdown.matchAll(/:server-bench-table\{([^}]*)\}/g)].map((match) => ({
        bench: /bench=['"]([^'"]+)['"]/.exec(match[1])?.[1],
        section: /section=['"]([^'"]+)['"]/.exec(match[1])?.[1],
      }));
      pages.push({source, route, charts, tables});
    }
  };
  walk(contentRoot);
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

/** runtypes: bench-table pages, their datasets and their hover-panel details. */
async function checkRuntypes(base, contentRoot) {
  const pages = benchmarkPages(contentRoot);
  note(`check-static: checking ${pages.length} benchmark pages`);
  let failures = 0;
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
  return {failures, summary: `every benchmark page renders its benchmark (${pages.length} pages)`};
}

/**
 * mion: every page prerendered, every declared chart in the HTML, AND every dataset
 * those charts and tables fetch actually present with rows in it.
 *
 * The data half is what makes this a real gate. The charts used to import committed
 * JSON at build time, so a missing dataset broke the build; now they fetch it at
 * runtime, which fails silently in the browser and would ship a benchmarks page whose
 * every chart says "not generated yet" while the deploy stays green.
 */
async function checkMion(base, contentRoot) {
  const pages = allPages(contentRoot);
  if (pages.length === 0) die(`check-static: no .md pages under ${contentRoot}`);
  note(`check-static: checking ${pages.length} pages`);
  let failures = 0;
  let charts = 0;
  const datasets = new Map(); // bench -> the sections its components ask for

  for (const page of pages) {
    const res = await get(base, page.route);
    if (!res.ok) {
      failures += fail(`${page.route}: HTTP ${res.status}${res.error ? ` (${res.error})` : ''} - page missing from the build (${page.source})`);
      continue;
    }
    // Billboard draws each chart client-side into the div BenchChart.vue mounts, so
    // the prerendered HTML carries that div (id `benchmark-chart-<bench>-<metric>`,
    // kept in sync with the component) and not the chart itself. A missing div means
    // the component never made it into the page: an unregistered or renamed
    // component, or an MDC typo.
    const missing = page.charts.filter((chart) => {
      if (!chart.bench || !chart.metric) return true;
      const id = `benchmark-chart-${chart.bench}-${chart.metric}${chart.section ? `-${chart.section}` : ''}`;
      return !res.body.includes(`id="${id}"`);
    });
    if (missing.length > 0) {
      failures += fail(`${page.route}: :bench-chart ${missing.map((c) => `${c.bench ?? '?'}/${c.metric ?? '?'}`).join(', ')} not in the prerendered HTML (${page.source})`);
      continue;
    }
    for (const component of [...page.charts, ...page.tables]) {
      if (!component.bench) continue;
      if (!datasets.has(component.bench)) datasets.set(component.bench, new Set());
      if (component.section) datasets.get(component.bench).add(component.section);
    }
    charts += page.charts.length;
    pass(`${page.route}: prerendered${page.charts.length ? ` with ${page.charts.length} chart${page.charts.length === 1 ? '' : 's'}` : ''}`);
  }

  for (const [bench, sections] of datasets) {
    const path = `/bench-data/${bench}/index.json`;
    const index = await getJson(base, path);
    if (!index.ok) {
      failures += fail(`${path}: ${index.reason} - every chart and table reading it renders "not generated yet"`);
      continue;
    }
    const data = index.data;
    if (sections.size > 0) {
      // A sectioned dataset (the payload sweep): each named section must exist and
      // carry rows, or that one heading on the page is silently blank.
      const have = new Map((data.sections ?? []).map((section) => [section.key, section]));
      const bad = [...sections].filter((key) => !(have.get(key)?.rows ?? []).length);
      if (bad.length > 0) {
        failures += fail(`${path}: section${bad.length === 1 ? '' : 's'} ${bad.join(', ')} missing or empty (has: ${[...have.keys()].join(', ') || 'none'})`);
        continue;
      }
      pass(`${path}: ${have.size} sections, all ${sections.size} referenced ones populated`);
      continue;
    }
    if (!(data.rows ?? []).length) {
      failures += fail(`${path}: no rows - the table and charts would render empty`);
      continue;
    }
    pass(`${path}: ${data.rows.length} rows`);
  }

  return {failures, summary: `every page prerendered (${pages.length} pages, ${charts} charts, ${datasets.size} datasets)`};
}

const CHECKS = {runtypes: checkRuntypes, mion: checkMion};

export async function main(args) {
  let site = process.env.MION_SITE || 'runtypes';
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--site') site = args[++i];
    else if (args[i].startsWith('--site=')) site = args[i].slice('--site='.length);
    else if (!args[i].startsWith('-')) positional.push(args[i]);
  }
  const check = CHECKS[site];
  if (!check) die(`check-static: unknown site '${site}' (want: ${Object.keys(CHECKS).join(' | ')})`, 2);

  const root = positional[0] ?? publicRoot(site);
  if (!hasBuild(root)) die(`check-static: no prerendered ${site} site at ${root} - run 'pnpm rtx website build --site ${site}' first.`);
  const contentRoot = contentDir(site);
  if (!existsSync(contentRoot)) die(`check-static: no content tree at ${contentRoot}`);

  const server = createStaticServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  note(`check-static: serving ${root} (${site})`);

  let result;
  try {
    result = await check(base, contentRoot);
  } finally {
    // close() alone leaves fetch's keep-alive sockets open, which would hold the
    // process (and the CI step) past the last check.
    server.close();
    server.closeAllConnections();
  }

  if (result.failures > 0) {
    die(`check-static: FAIL - ${result.failures} check${result.failures === 1 ? '' : 's'} failed on the ${site} site. The built site would ship pages that render nothing; do NOT deploy it.`);
  }
  note(`check-static: PASS (${site}) - ${result.summary}`);
}

if (import.meta.main) {
  loadEnv();
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
