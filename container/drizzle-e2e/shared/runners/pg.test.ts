// The pg lane's runner, copied into the TRANSLATED tree beside pg-common.ts
// AFTER the translation (it talks to drizzle directly, so it must not be
// rewritten itself).
//
// We write our own rather than vendoring drizzle's node-postgres.test.ts: that
// one carries top-level migrator tests, which skipTests cannot reach (it only
// skips inside the `common` describe), and pulls in a per-dialect cache suite
// this lane does not vendor.
import {Client} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {afterAll, beforeAll, beforeEach} from 'vitest';
import {tests} from './pg-common';
import skipList from './skip-list.json' with {type: 'json'};
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core';

let client: Client;
// The type the suite's own TestContext declares, so ctx assignment lines up.
let db: PgDatabase<PgQueryResultHKT>;

beforeAll(async () => {
  const connectionString = process.env['PG_CONNECTION_STRING'];
  if (!connectionString) throw new Error('drizzle-e2e: PG_CONNECTION_STRING is not set; the lane always points at the container postgres');
  client = new Client(connectionString);
  await client.connect();
  db = drizzle(client, {logger: false});
});

afterAll(async () => {
  await client?.end();
});

beforeEach((ctx) => {
  ctx.pg = {db};
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
skipListed(skipList.pg as {test: string; reason: string}[]);

tests();
