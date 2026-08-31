// Dry pass. Walks the tree, groups every occurrence into a decision row, lets the rules
// claim what they can, and writes one shard per area. Touches nothing else.
//
//   node migration/scan.mjs            write the shards
//   node migration/scan.mjs --report   coverage + the top unclaimed tokens, write nothing
//
// The report is the working loop: it ranks what no rule claimed by how many sites it
// covers, so the next rule worth writing is always the top line.

import {walk} from './lib/walk.mjs';
import {classify} from './lib/rules.mjs';
import {writeShard} from './lib/shards.mjs';

const reportOnly = process.argv.includes('--report');

const rows = new Map();
let sites = 0;

walk((hit) => {
  sites++;
  let row = rows.get(hit.id);
  if (!row) {
    row = {id: hit.id, n: 0, token: hit.token, kind: hit.kind, area: hit.area, file: hit.file, eg: hit.line.trim().slice(0, 58)};
    rows.set(hit.id, row);
  }
  row.n++;
});

let claimed = 0;
let claimedSites = 0;
const unclaimed = [];
const byRule = new Map();

for (const row of rows.values()) {
  const verdict = classify(row.token, row.kind, row.area, row.file);
  row.t = verdict ? verdict.mark : '';
  row.rule = verdict ? verdict.rule : null;

  if (verdict) {
    claimed++;
    claimedSites += row.n;
    const seen = byRule.get(verdict.rule) || {rows: 0, sites: 0};
    seen.rows++;
    seen.sites += row.n;
    byRule.set(verdict.rule, seen);
  } else {
    unclaimed.push(row);
  }
}

const pct = (part, whole) => `${((part / whole) * 100).toFixed(1)}%`;

console.log(`sites          ${sites}`);
console.log(`rows           ${rows.size}`);
console.log(`auto-marked    ${claimed} rows / ${claimedSites} sites  (${pct(claimed, rows.size)} of rows)`);
console.log(`left to decide ${unclaimed.length} rows / ${sites - claimedSites} sites  (${pct(unclaimed.length, rows.size)})`);

if (reportOnly) {
  console.log('\n--- rules, by rows claimed ---');
  for (const [name, seen] of [...byRule].sort((a, b) => b[1].rows - a[1].rows)) {
    console.log(`${String(seen.rows).padStart(5)} rows ${String(seen.sites).padStart(6)} sites   ${name}`);
  }

  console.log('\n--- unclaimed tokens, by sites (write the next rule from the top) ---');
  const perToken = new Map();
  for (const row of unclaimed) {
    const seen = perToken.get(row.token) || {sites: 0, rows: 0, eg: row.eg};
    seen.sites += row.n;
    seen.rows++;
    perToken.set(row.token, seen);
  }
  for (const [token, seen] of [...perToken].sort((a, b) => b[1].sites - a[1].sites).slice(0, 30)) {
    console.log(`${String(seen.sites).padStart(6)} sites ${String(seen.rows).padStart(4)} rows   ${token}`);
  }

  console.log('\n--- unclaimed rows per shard ---');
  const perArea = new Map();
  for (const row of unclaimed) perArea.set(row.area, (perArea.get(row.area) || 0) + 1);
  for (const [area, count] of [...perArea].sort()) console.log(`   ${area}  ${count}`);
  process.exit(0);
}

// Write one shard per area. `eg` rides along only on undecided rows: a marked row needs
// no sample, and dropping it is most of what keeps the files small.
const perArea = new Map();
for (const row of rows.values()) {
  const list = perArea.get(row.area) || [];
  const out = {id: row.id, n: row.n, t: row.t};
  if (!row.t) out.eg = row.eg;
  else out.by = row.rule;
  list.push(out);
  perArea.set(row.area, list);
}

for (const [area, list] of [...perArea].sort()) {
  list.sort((a, b) => b.n - a.n);
  writeShard(area, list);
  const open = list.filter((r) => !r.t).length;
  console.log(`  ${area}  ${String(list.length).padStart(4)} rows  ${String(open).padStart(4)} undecided`);
}
