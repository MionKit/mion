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

function main() {
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
