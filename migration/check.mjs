// The gate. `apply` is only safe because this ran first and passed.
//
// Three ways to fail, and all three are the same underlying promise: every occurrence in
// the tree has an explicit, known decision behind it.
//
//   1. a row is still undecided        -> somebody has to look at it
//   2. a row carries an unknown mark   -> a typo would otherwise silently skip an edit
//   3. the tree has a key no shard has -> the classifier moved under the shards
//
// Case 3 is the one that matters most: it means kind.mjs or area.mjs changed since the
// scan, so the shards are describing a different tree than the one on disk. Hard-failing
// here is what makes it impossible to mis-apply a stale decision.

import {walk} from './lib/walk.mjs';
import {readDecisions, readShards} from './lib/shards.mjs';
import {isKnownTransform} from './lib/transforms.mjs';

const shards = readShards();
if (shards.length === 0) {
  console.error('no shards found — run `node migration/scan.mjs` first');
  process.exit(2);
}

const decisions = readDecisions();

const undecided = [];
const unknown = [];
for (const row of decisions.values()) {
  if (!row.t) undecided.push(row);
  else if (!isKnownTransform(row.t)) unknown.push(row);
}

// Re-derive every key from the tree and confirm the shards cover it.
const missing = new Map();
const seen = new Set();
walk((hit) => {
  seen.add(hit.id);
  if (!decisions.has(hit.id)) {
    const at = missing.get(hit.id) || {n: 0, where: `${hit.file}:${hit.lineNumber + 1}`};
    at.n++;
    missing.set(hit.id, at);
  }
});

// A row nothing in the tree matches any more. Not fatal (the code moved on), but it means
// the shards carry dead decisions, so say so.
const stale = [...decisions.keys()].filter((id) => !seen.has(id));

let failed = false;

if (missing.size) {
  failed = true;
  console.error(`FAIL  ${missing.size} key(s) in the tree have no row in any shard`);
  console.error('      the classifier changed since the scan — re-run scan.mjs');
  for (const [id, at] of [...missing].slice(0, 10)) console.error(`        ${id}  (${at.where})`);
}

if (unknown.length) {
  failed = true;
  console.error(`FAIL  ${unknown.length} row(s) carry an unknown transform`);
  for (const row of unknown.slice(0, 10)) console.error(`        ${row.id}  t=${JSON.stringify(row.t)}`);
}

if (undecided.length) {
  failed = true;
  const perShard = new Map();
  for (const shard of shards) {
    const open = shard.rows.filter((r) => !r.t).length;
    if (open) perShard.set(shard.shard, open);
  }
  console.error(`FAIL  ${undecided.length} row(s) still undecided`);
  for (const [name, count] of [...perShard].sort()) console.error(`        ${name}  ${count}`);
  console.error('      set "t" on each; the legal values are in each shard\'s "transforms".');
}

if (stale.length) console.error(`note  ${stale.length} row(s) match nothing in the tree any more`);

if (failed) process.exit(1);
console.log(`OK  ${decisions.size} rows, all decided, all keys present in the tree`);
