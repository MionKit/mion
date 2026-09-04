// gen-servers-docs.mjs — turn the mion server-benchmark results into the JSON the
// docs site fetches.
//
// The twin of gen-docs.mjs for the OTHER benchmark family. One file per suite at
// container/website/public/bench-data/servers-<suite>/index.json, holding the rows
// AND the run metadata (machine, runtime versions, load settings). The pages render
// both from it, so nothing about a benchmark run is transcribed into markdown by
// hand - which is exactly how the previous numbers came to claim mion 0.6.2 forever.

import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT} from '../../lib/env.mjs';
import {note} from '../../lib/proc.mjs';

const RESULTS_DIR = process.env.MION_BENCH_RESULTS_DIR || join(REPO_ROOT, 'container/mion-bench/results');
const OUT_ROOT = join(REPO_ROOT, 'container/website/public/bench-data');

// Suite key -> the page-facing label and blurb. Kept here rather than in the content
// tree so a renamed suite cannot leave a page titled after the old one.
const SUITE_META = {
  'hello-world': {label: 'Hello World', description: 'Routing and framework overhead only, with no validation.'},
  'light-validation': {label: 'Light Validation', description: 'A ~100 byte user: four fields, one of them a date.'},
  'heavy-validation': {label: 'Heavy Validation', description: 'A ~1 KB user: nested objects, a discriminated union and three dates.'},
  'payload-sizes': {label: 'Payload Sizes', description: 'The heavy-validation route across four payload sizes.'},
};

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function readRows(dir) {
  return readdirSync(dir, {withFileTypes: true})
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readJson(join(dir, entry.name)))
    .sort((a, b) => b.requests.mean - a.requests.mean);
}

/** One row as the site renders it: bytes/sec becomes megabits/sec, the table's unit. */
const toRow = (result) => ({
  app: result.app,
  label: result.label,
  family: result.family,
  runtime: result.runtime,
  version: result.version,
  runtimeVersion: result.runtimeVersion,
  router: result.router,
  validation: result.validation,
  description: result.description,
  requests: Math.round(result.requests.mean * 10) / 10,
  latency: Math.round(result.latency.mean * 100) / 100,
  throughput: Math.round((result.throughput.mean / 1e6) * 8 * 100) / 100,
  maxMem: Math.round(result.maxMem),
  maxCpu: Math.round(result.maxCpu),
  memSeries: result.memSeries ?? [],
});

/**
 * The run metadata every page prints. Taken from the results themselves (each lane
 * records the box it ran on), so it cannot describe a different run than the numbers.
 */
function metaFrom(rows) {
  const first = rows[0];
  if (!first) return null;
  return {
    generatedAt: first.env?.generatedAt ?? null,
    os: first.env?.os ?? null,
    cpu: first.env?.cpu ?? null,
    cores: first.env?.cores ?? null,
    node: first.env?.node ?? null,
    connections: first.connections,
    threads: first.threads ?? null,
    pipelining: first.pipelining,
    duration: first.duration,
    // What two runs of a lane are expected to agree within, so a reader can tell a real
    // gap between two servers from noise. The harness records it; nobody types it.
    tolerance: first.tolerance ?? null,
    // The line the pages used to hardcode, assembled from what actually ran. It names
    // wrk because wrk is what ran: the upstream benchmarks repo kept printing
    // `autocannon ...` after it switched, which is how a method line stops being true.
    // Pipelining is not a wrk flag (the request script batches), so it is only mentioned
    // when it is actually more than one.
    // The thread count is dropped rather than printed as `-tundefined` when a result
    // predates wrk: a half-regenerated dataset should say less, never say nonsense.
    method: [
      'wrk',
      first.threads ? `-t${first.threads}` : null,
      `-c${first.connections}`,
      `-d${first.duration}s`,
      `--timeout ${first.timeout}s`,
      'localhost:3000',
      first.pipelining > 1 ? `(${first.pipelining} requests pipelined per connection)` : null,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function emit(bench, payload) {
  const dir = join(OUT_ROOT, bench);
  rmSync(dir, {recursive: true, force: true});
  mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, 'index.json'), `${JSON.stringify(payload, null, 2)}\n`);
  note(`bench-data/${bench}/index.json (${payload.sections ? payload.sections.length + ' sections' : payload.rows.length + ' rows'})`);
}

export function main() {
  if (!existsSync(RESULTS_DIR)) {
    note(`gen-servers-docs: no results at ${RESULTS_DIR} - nothing to generate`);
    return;
  }
  let emitted = 0;

  for (const entry of readdirSync(RESULTS_DIR, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const suite = entry.name;
    const dir = join(RESULTS_DIR, suite);
    const meta = SUITE_META[suite] ?? {label: suite, description: ''};

    // The sweep is nested one level deeper (one dir per size) and renders as several
    // tables on one page, so it emits sections rather than a single row list.
    if (suite === 'payload-sizes') {
      const sections = readdirSync(dir, {withFileTypes: true})
        .filter((size) => size.isDirectory())
        .map((size) => {
          const results = readRows(join(dir, size.name));
          return {
            key: size.name,
            label: results[0]?.size?.label ?? size.name,
            bytes: results[0]?.size?.bytes ?? 0,
            actualBytes: results[0]?.size?.actualBytes ?? 0,
            // Per section, because the sweep caps concurrency on the big sizes: one
            // dataset-level "wrk -c N" line would misdescribe every section
            // whose payload forced a smaller N.
            meta: metaFrom(results),
            rows: results.map(toRow),
          };
        })
        .sort((a, b) => a.bytes - b.bytes);
      const all = sections.flatMap((section) => section.rows);
      if (all.length === 0) continue;
      emit(`servers-${suite}`, {bench: `servers-${suite}`, ...meta, meta: metaFrom(readRows(join(dir, sections[0].key))), sections});
      emitted++;
      continue;
    }

    const results = readRows(dir);
    if (results.length === 0) continue;
    emit(`servers-${suite}`, {bench: `servers-${suite}`, ...meta, meta: metaFrom(results), rows: results.map(toRow)});
    emitted++;
  }

  if (emitted === 0) note('gen-servers-docs: no suite produced any result');
}

if (import.meta.main) main();
