/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Join every results/<suite>/<app>.json into one table per suite, sorted fastest
// first, with the mion rows marked. Runs on the HOST (it only reads JSON), so it
// needs nothing from the image.

import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = process.env.MION_BENCH_RESULTS_DIR || join(ROOT, 'results');

const readResults = (dir) =>
  readdirSync(dir, {withFileTypes: true})
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => JSON.parse(readFileSync(join(dir, entry.name), 'utf8')));

const num = (value, digits = 0) => (Number.isFinite(value) ? value.toFixed(digits) : '-');

function printTable(title, rows) {
  if (rows.length === 0) return;
  console.log(`\n== ${title} ==`);
  const header = ['', 'Req (R/s)', 'Latency (ms)', 'Output (Mb/s)', 'Max Mem (MB)', 'Max Cpu (%)'];
  const body = rows
    .sort((a, b) => b.requests.mean - a.requests.mean)
    .map((row) => [
      row.family === 'mion' ? `* ${row.label}` : row.label,
      num(row.requests.mean, 1),
      num(row.latency.mean, 2),
      num(row.throughput.mean / 1e6 * 8, 2),
      num(row.maxMem, 0),
      num(row.maxCpu, 0),
    ]);
  const widths = header.map((_, i) => Math.max(header[i].length, ...body.map((row) => row[i].length)));
  const line = (cells) => console.log(cells.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('  '));
  line(header);
  line(widths.map((w) => '-'.repeat(w)));
  body.forEach(line);
}

/** Every result in a results dir keyed by `<suite>/<app>` (`payload-sizes/<size>/<app>` for the sweep). */
function collect(root) {
  const out = new Map();
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    const groups = entry.name === 'payload-sizes'
      ? readdirSync(dir, {withFileTypes: true}).filter((d) => d.isDirectory()).map((d) => [`${entry.name}/${d.name}`, join(dir, d.name)])
      : [[entry.name, dir]];
    for (const [key, groupDir] of groups) {
      for (const row of readResults(groupDir)) out.set(`${key}/${row.label}`, row);
    }
  }
  return out;
}

// `--compare <before> <after>`: one table per suite with the change in requests per second and in
// mean latency for every lane present in BOTH dirs, so a code change is read against its own
// baseline rather than against another machine's numbers.
function compare(beforeDir, afterDir) {
  const before = collect(beforeDir);
  const after = collect(afterDir);
  const keys = [...before.keys()].filter((key) => after.has(key)).sort();
  if (keys.length === 0) return console.log('mion-bench: no lane is present in both results dirs');
  const pct = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? `${a >= b ? '+' : ''}${(((a - b) / b) * 100).toFixed(1)}%` : '-');
  let suite = '';
  let rows = [];
  const flush = () => {
    if (rows.length === 0) return;
    console.log(`\n== ${suite} ==`);
    const header = ['', 'Req/s before', 'Req/s after', 'Δ req/s', 'Latency before', 'Latency after', 'Δ latency', 'Max Mem before', 'Max Mem after'];
    const widths = header.map((_, i) => Math.max(header[i].length, ...rows.map((row) => row[i].length)));
    const line = (cells) => console.log(cells.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('  '));
    line(header);
    line(widths.map((w) => '-'.repeat(w)));
    rows.forEach(line);
    rows = [];
  };
  for (const key of keys) {
    const [group, label] = [key.slice(0, key.lastIndexOf('/')), key.slice(key.lastIndexOf('/') + 1)];
    if (group !== suite) {
      flush();
      suite = group;
    }
    const a = before.get(key);
    const b = after.get(key);
    rows.push([
      a.family === 'mion' ? `* ${label}` : label,
      num(a.requests.mean, 1),
      num(b.requests.mean, 1),
      pct(b.requests.mean, a.requests.mean),
      num(a.latency.mean, 2),
      num(b.latency.mean, 2),
      pct(b.latency.mean, a.latency.mean),
      num(a.maxMem, 0),
      num(b.maxMem, 0),
    ]);
  }
  flush();
  console.log('\n(* = mion; Δ is after against before, a positive Δ req/s is faster)');
}

function main() {
  const compareAt = process.argv.indexOf('--compare');
  if (compareAt >= 0) {
    const [beforeDir, afterDir] = process.argv.slice(compareAt + 1, compareAt + 3);
    if (!beforeDir || !afterDir) return console.log('usage: aggregate.mjs --compare <before-results-dir> <after-results-dir>');
    return compare(beforeDir, afterDir);
  }
  if (!existsSync(RESULTS_DIR)) return console.log('mion-bench: no results yet');
  let printed = 0;
  for (const entry of readdirSync(RESULTS_DIR, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const dir = join(RESULTS_DIR, entry.name);
    if (entry.name === 'payload-sizes') {
      // One table per size, so the uws zero-copy step above 512 KiB is visible.
      for (const size of readdirSync(dir, {withFileTypes: true}).filter((d) => d.isDirectory())) {
        const rows = readResults(join(dir, size.name));
        printTable(`payload-sizes · ${rows[0]?.size?.label ?? size.name}`, rows);
        printed += rows.length;
      }
      continue;
    }
    const rows = readResults(dir);
    printTable(entry.name, rows);
    printed += rows.length;
  }
  if (printed === 0) console.log('mion-bench: no results yet');
  else console.log('\n(* = mion)');
}

main();
