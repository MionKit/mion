// The sqlite lane's runner, copied into the TRANSLATED tree beside
// sqlite-common.ts AFTER the translation (it talks to drizzle directly, so it
// must not be rewritten itself). See runners/pg.test.ts for why the lane writes
// its own runners instead of vendoring drizzle's.
import Database from 'better-sqlite3';
import {drizzle} from 'drizzle-orm/better-sqlite3';
import {afterAll, beforeAll, beforeEach} from 'vitest';
import {tests} from './sqlite-common';
import skipList from './skip-list.json' with {type: 'json'};
import type {BaseSQLiteDatabase} from 'drizzle-orm/sqlite-core';

let client: Database.Database;
// The type the suite's own TestContext declares, so ctx assignment lines up.
let db: BaseSQLiteDatabase<'sync' | 'async', any, Record<string, never>>;

beforeAll(() => {
  // A FILE, not drizzle's :memory: default: closer to what a consumer runs, and
  // a failure leaves something to inspect.
  const dbPath = process.env['SQLITE_DB_PATH'];
  if (!dbPath) throw new Error('drizzle-e2e: SQLITE_DB_PATH is not set; the lane always points at a file');
  client = new Database(dbPath);
  db = drizzle(client, {logger: false});
});

afterAll(() => {
  client?.close();
});

beforeEach((ctx) => {
  ctx.sqlite = {db};
});

// Drizzle's own skipTests() only skips inside its `common` describe, and some of
// what this lane has to skip is outside it (mysql's `use index` hint tests sit in
// their own describe). So the lane skips by task name ANYWHERE — a superset of
// skipTests, and the only mechanism, so there is one place to look.
function skipListed(entries: {test: string; reason: string}[]) {
  const names = new Set(entries.map((entry) => entry.test));
  beforeEach((ctx) => {
    if (names.has(ctx.task.name)) ctx.skip();
  });
}

// Every skipped test is named with a reason in skip-list.json. A failure that is
// NOT on that list is a real recorder bug.
// `as` because the JSON import types an empty dialect array as never[].
skipListed(skipList.sqlite as {test: string; reason: string}[]);

tests();
