// check-static.mjs — post-build gate for the docs site: serve the PRERENDERED
// artifact (container/website/.output/public) and prove it is not hollow.
//
// Every content page must have prerendered, and every benchmark component on it must
// have the data it fetches at runtime:
//
//   `::bench-table` (the runtypes benchmark pages) fetches /bench-data/<bench>/*.json
//     on mount and renders a tidy "Benchmark data not generated yet" notice when the
//     file is missing. Right for a fresh clone, wrong for a deploy: a benchmark stage
//     that dies mid-run ships a green build whose pages are empty (exactly what happened
//     to the serialization pages). Prerendered HTML can't reveal it either, since the
//     table only appears after hydration. So the gate replays what the browser does,
//     over HTTP, against the real artifact: the component shell is in the HTML, the
//     index.json holds real, renderable numbers (mirroring BenchTable's own cell logic,
//     so a dataset that would paint every cell `n-a` fails here), and one hover-panel
//     detail file per section is present.
//   `:bench-chart` / `:server-bench-table` (the rpc benchmark pages and the landings)
//     fetch /bench-data/<bench>/index.json the same way: the chart div is in the HTML
//     and the dataset (or each named section of it) has rows.
//   `:home-bench-table` (the root landing, the about pages, the benchmarks page) reads a
//     server dataset (checked like a chart's, rows present) and/or the validation one
//     (checked like a ::bench-table's, cells renderable), and its shell must be in the HTML.
//
// Every page also proves its PICTURES shipped: every same-origin <img> must answer from
// the artifact. Nuxt Image routes markdown pictures and <nuxt-img> through its
// transformer (/_ipx/...), and the prerender only materialises those files when the
// transformer works, so a broken one ships pages with broken pictures while the build
// stays green. That happened: the site pinned an @nuxt/image whose sharp had no usable
// binary in the container.
//
// Usage:  node scripts/website/check-static.mjs [publicDir]
//         pnpm miondevx website check --static
// Runs automatically as the last stage of `pnpm miondevx website build` (generate).

import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {die, note, reportCliError} from '../lib/proc.mjs';
import {createStaticServer, hasBuild, publicRoot} from './serve.mjs';
import {columnProblems} from './bench-data/columns.mjs';

const CONTENT_DIR = join(REPO_ROOT, 'container/website/content');

// ── page discovery ───────────────────────────────────────────────────────────

// Nuxt Content drops the numeric ordering prefix from every path segment:
// content/03.benchmarks/02.runtypes/05.serialization.md -> /benchmarks/runtypes/serialization.
const routeSegment = (name) => name.replace(/^\d+\./, '').replace(/\.md$/, '');

/** The route of a content file: `index.md` is the landing page of its dir (`/` at the
 *  root; a subsite home is its about page, a docs page); every other file/dir contributes one
 *  prefix-stripped segment. */
function routeOf(source) {
  const segments = source.split('/').map(routeSegment);
  if (segments[segments.length - 1] === 'index') segments.pop();
  return `/${segments.join('/')}`;
}

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

/** Every .md page in the content tree, as {source, route, tables, charts, serverTables}. */
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
      const serverTables = [...markdown.matchAll(/:server-bench-table\{([^}]*)\}/g)].map((match) => ({
        bench: /bench=['"]([^'"]+)['"]/.exec(match[1])?.[1],
        section: /section=['"]([^'"]+)['"]/.exec(match[1])?.[1],
      }));
      // `:home-bench-table{servers="x" validation="y"}`: the HTML bars, a server
      // dataset and/or a validation dataset.
      const homeTables = [...markdown.matchAll(/:home-bench-table\{([^}]*)\}/g)].map((match) => ({
        servers: /servers=['"]([^'"]+)['"]/.exec(match[1])?.[1],
        validation: /validation=['"]([^'"]+)['"]/.exec(match[1])?.[1],
      }));
      pages.push({source, route: routeOf(source), tables: benchTables(markdown), charts, serverTables, homeTables});
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

// ── images: every picture a page references must ship with the build ─────────

/** The same-origin image URLs a prerendered page references: every `<img src>` plus
 *  every `srcset` candidate, deduplicated, in document order. External and inline
 *  (`data:`) sources are not the build's to ship, so they are left out. */
export function imageSources(html) {
  const sources = new Set();
  const add = (url) => {
    const clean = url.replace(/&amp;/g, '&').trim();
    if (clean.startsWith('/') && !clean.startsWith('//')) sources.add(clean);
  };
  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = /\ssrc=["']([^"']+)["']/i.exec(tag[0])?.[1];
    if (src) add(src);
    const srcset = /\ssrcset=["']([^"']+)["']/i.exec(tag[0])?.[1];
    if (srcset) for (const candidate of srcset.split(',')) add(candidate.trim().split(/\s+/)[0] ?? '');
  }
  return [...sources];
}

/** Every picture on the page answers from the artifact. A `/_ipx/` source that 404s
 *  means the transformer never produced the file at prerender time (sharp missing or
 *  broken in the container): the page shows a broken image where the picture was. */
async function checkImages(base, page, html) {
  const sources = imageSources(html);
  if (sources.length === 0) return 0;
  const missing = [];
  for (const src of sources) {
    const res = await get(base, src);
    if (!res.ok) missing.push(`${src} (HTTP ${res.status}${res.error ? `, ${res.error}` : ''})`);
  }
  if (missing.length > 0) {
    const hint = missing.some((entry) => entry.startsWith('/_ipx/')) ? ' - a /_ipx/ source that is missing means Nuxt Image could not transform it at build time (is sharp loadable in the container?)' : '';
    return fail(`${page.route}: ${missing.length} of ${sources.length} picture${sources.length === 1 ? '' : 's'} missing from the build: ${missing.join(', ')}${hint}`);
  }
  pass(`${page.route}: all ${sources.length} picture${sources.length === 1 ? '' : 's'} shipped`);
  return 0;
}

/** The dataset a ::bench-table fetches: present, well-formed and actually populated. */
async function checkBenchTable(base, page, props) {
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
  // The columns are exactly the dataset's list (columns.mjs): nothing extra, nothing
  // twice, nothing missing. Stale result files once shipped a library twice and two
  // empty form columns on the validation pages.
  const badColumns = columnProblems(bench, competitors, {requireAll: true});
  if (badColumns.length > 0) return badColumns.reduce((count, problem) => count + fail(`${page.route}: ${indexPath} ${problem}`), 0);

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
    // And every column paints at least one number, unless every case says the library
    // declines the metric on purpose (status "not-supported": zod has no is-valid path).
    // A column with no data at all is a competitor whose run produced nothing, not a
    // comparison; it once shipped as n-a all the way down.
    const declined = (comp) => cases.every((kase) => kase.results?.[comp]?.[metric.key]?.status === 'not-supported');
    const emptyColumns = competitors.filter((comp) => !declined(comp) && !cases.some((kase) => rendersValue(kase.results?.[comp], metric.key, metric)));
    if (emptyColumns.length > 0) {
      failures += fail(`${page.route}: metric '${metric.key}' renders n-a in every case for column${emptyColumns.length === 1 ? '' : 's'} ${emptyColumns.join(', ')}`);
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

/** The datasets the charts and server tables fetch: present, with rows (or with every
 *  named section populated). Checked once per dataset across the whole site. */
async function checkChartDatasets(base, datasets) {
  let failures = 0;
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
  return failures;
}

/** Every page prerendered with its pictures and its benchmark components; every
 *  dataset those components read actually shipped with rows in it. */
async function checkSite(base, contentRoot) {
  const pages = allPages(contentRoot);
  if (pages.length === 0) die(`check-static: no .md pages under ${contentRoot}`);
  note(`check-static: checking ${pages.length} pages`);
  let failures = 0;
  let charts = 0;
  let tables = 0;
  const datasets = new Map(); // bench -> the sections its chart components ask for

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
    const missingCharts = page.charts.filter((chart) => {
      if (!chart.bench || !chart.metric) return true;
      const id = `benchmark-chart-${chart.bench}-${chart.metric}${chart.section ? `-${chart.section}` : ''}`;
      return !res.body.includes(`id="${id}"`);
    });
    if (missingCharts.length > 0) {
      failures += fail(`${page.route}: :bench-chart ${missingCharts.map((c) => `${c.bench ?? '?'}/${c.metric ?? '?'}`).join(', ')} not in the prerendered HTML (${page.source})`);
      continue;
    }
    // The table is client-rendered, so the prerendered HTML carries the component's
    // shell (and its loading notice), not the rows. A missing shell means the page
    // shipped without the component at all (unregistered / renamed / MDC typo).
    if (page.tables.length > 0 && !res.body.includes('bench-table')) {
      failures += fail(`${page.route}: no bench-table markup in the prerendered HTML (${page.source})`);
      continue;
    }
    if (page.homeTables.length > 0 && !res.body.includes('home-bench')) {
      failures += fail(`${page.route}: no home-bench-table markup in the prerendered HTML (${page.source})`);
      continue;
    }
    for (const component of [...page.charts, ...page.serverTables]) {
      if (!component.bench) continue;
      if (!datasets.has(component.bench)) datasets.set(component.bench, new Set());
      if (component.section) datasets.get(component.bench).add(component.section);
    }
    // The home summary's server half is a chart-style dataset (rows); its validation
    // half is checked below with the ::bench-table logic on the metric it quotes.
    for (const component of page.homeTables) {
      if (!component.servers && !component.validation) {
        failures += fail(`${page.route}: a :home-bench-table in ${page.source} names no dataset (servers="…" and/or validation="…")`);
        continue;
      }
      if (component.servers && !datasets.has(component.servers)) datasets.set(component.servers, new Set());
      // It never opens a hover panel, so the per-case detail files are not required here.
      if (component.validation) failures += await checkBenchTable(base, page, {bench: component.validation, metric: 'validate', 'show-code': 'false'});
    }
    charts += page.charts.length;
    tables += page.tables.length;
    const parts = [];
    if (page.charts.length) parts.push(`${page.charts.length} chart${page.charts.length === 1 ? '' : 's'}`);
    if (page.tables.length) parts.push(`${page.tables.length} bench-table${page.tables.length === 1 ? '' : 's'}`);
    pass(`${page.route}: prerendered${parts.length ? ` with ${parts.join(' + ')}` : ''}`);
    failures += await checkImages(base, page, res.body);
    for (const props of page.tables) {
      if (!props.bench) {
        failures += fail(`${page.route}: a ::bench-table in ${page.source} has no bench="…" prop`);
        continue;
      }
      failures += await checkBenchTable(base, page, props);
    }
  }

  failures += await checkChartDatasets(base, datasets);
  return {failures, summary: `every page prerendered (${pages.length} pages, ${tables} bench-tables, ${charts} charts, ${datasets.size} chart datasets)`};
}

export async function main(args) {
  const positional = args.filter((arg) => !arg.startsWith('-'));
  const root = positional[0] ?? publicRoot();
  if (!hasBuild(root)) die(`check-static: no prerendered site at ${root} - run 'pnpm miondevx website build' first.`);
  if (!existsSync(CONTENT_DIR)) die(`check-static: no content tree at ${CONTENT_DIR}`);

  const server = createStaticServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  note(`check-static: serving ${root}`);

  let result;
  try {
    result = await checkSite(base, CONTENT_DIR);
  } finally {
    // close() alone leaves fetch's keep-alive sockets open, which would hold the
    // process (and the CI step) past the last check.
    server.close();
    server.closeAllConnections();
  }

  if (result.failures > 0) {
    die(`check-static: FAIL - ${result.failures} check${result.failures === 1 ? '' : 's'} failed. The built site would ship pages that render nothing; do NOT deploy it.`);
  }
  note(`check-static: PASS - ${result.summary}`);
}

if (import.meta.main) {
  loadEnv();
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
