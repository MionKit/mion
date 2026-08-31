// The shard writer. It hand-rolls its JSON (one row per line, so a mark shows up in
// `git blame` as a one-line change), which means the round-trip is worth pinning rather
// than assuming.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {writeShard, SHARD_DIR} from '../lib/shards.mjs';
import {TRANSFORM_NAMES} from '../lib/transforms.mjs';

const NAME = '99-roundtrip-test';
const PATH = join(SHARD_DIR, `${NAME}.json`);

function cleanup() {
  if (existsSync(PATH)) rmSync(PATH);
}

test('a written shard parses back to the same rows', (t) => {
  t.after(cleanup);
  const rows = [
    {id: 'getRunTypeId@go@05-go', n: 1094, t: 'keep', by: 'keep:concept'},
    {id: 'ts-runtypes@comment@05-go', n: 371, t: '', eg: '// TS_RUNTYPES_DIVERGENT is the surprise'},
    {id: '@ts-runtypes/core@import-spec@02-ts-core', n: 2108, t: 'npm-scope', by: 'npm-scope'},
  ];
  writeShard(NAME, rows);

  const parsed = JSON.parse(readFileSync(PATH, 'utf8'));
  assert.equal(parsed.shard, NAME);
  assert.deepEqual(parsed.rows, rows);
  assert.deepEqual(parsed.transforms, TRANSFORM_NAMES);
  assert.ok(Array.isArray(parsed.notes) && parsed.notes.length > 0);
});

test('one row per line, so marking shows up as a one-line diff', (t) => {
  t.after(cleanup);
  writeShard(NAME, [
    {id: 'a@code@05-go', n: 1, t: 'keep'},
    {id: 'b@code@05-go', n: 2, t: ''},
    {id: 'c@code@05-go', n: 3, t: 'keep'},
  ]);
  const rowLines = readFileSync(PATH, 'utf8')
    .split('\n')
    .filter((l) => l.trim().startsWith('{"id"'));
  assert.equal(rowLines.length, 3);
});

test('tokens with quotes and backslashes survive the round-trip', (t) => {
  t.after(cleanup);
  // Real tokens include quotes from string literals and Windows-ish paths in comments.
  const rows = [
    {id: '"@ts-runtypes/core"@string-lit@05-go', n: 1, t: 'npm-scope'},
    {id: 'a\\b@comment@05-go', n: 1, t: '', eg: 'const s = "a\\b"; // \'quoted\''},
  ];
  writeShard(NAME, rows);
  assert.deepEqual(JSON.parse(readFileSync(PATH, 'utf8')).rows, rows);
});

test('an empty shard is still valid JSON', (t) => {
  t.after(cleanup);
  writeShard(NAME, []);
  const parsed = JSON.parse(readFileSync(PATH, 'utf8'));
  assert.deepEqual(parsed.rows, []);
});
