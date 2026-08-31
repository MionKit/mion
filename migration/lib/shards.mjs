// Reading and writing the shard decision files.
//
// A shard holds DECISIONS, never sites. `apply` re-derives every occurrence's key from
// the tree with the same kind/area functions `scan` used and looks the decision up, which
// is what keeps all eight files around 60 KB instead of megabytes of file paths.

import {readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TRANSFORM_NAMES} from './transforms.mjs';

export const MIGRATION_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const SHARD_DIR = join(MIGRATION_DIR, 'shards');
export const REPO_ROOT = dirname(MIGRATION_DIR);

const HEADER_NOTES = [
  'Mark every row by setting "t" to one of the values in "transforms".',
  'An empty "t" means undecided; check.mjs fails while any row is empty.',
  '"eg" is a sample line, shown only for undecided rows. "n" is the site count.',
  'rt$* and rt:: are kept on purpose: rt$* is a PUBLIC DATA FORMAT (consumers commit',
  'enrichment files keyed by it) and rt:: is in the CACHE WIRE FORMAT.',
];

export function writeShard(name, rows) {
  if (!existsSync(SHARD_DIR)) mkdirSync(SHARD_DIR, {recursive: true});

  // One row per line keeps the file diffable and reviewable: a mark shows up in `git
  // blame` as a one-line change rather than a reflowed block.
  const lines = rows.map((row) => `    ${JSON.stringify(row)}`).join(',\n');
  const body =
    `{\n` +
    `  "shard": ${JSON.stringify(name)},\n` +
    `  "notes": ${JSON.stringify(HEADER_NOTES, null, 0)},\n` +
    `  "transforms": ${JSON.stringify(TRANSFORM_NAMES, null, 0)},\n` +
    `  "rows": [\n${lines}\n  ]\n` +
    `}\n`;

  writeFileSync(join(SHARD_DIR, `${name}.json`), body);
}

export function readShards() {
  if (!existsSync(SHARD_DIR)) return [];
  return readdirSync(SHARD_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(SHARD_DIR, f), 'utf8')));
}

// All rows across all shards, keyed by row id, for O(1) lookup during apply/check.
export function readDecisions() {
  const decisions = new Map();
  for (const shard of readShards()) {
    for (const row of shard.rows) decisions.set(row.id, row);
  }
  return decisions;
}
