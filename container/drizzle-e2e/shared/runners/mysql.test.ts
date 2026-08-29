// The mysql lane's runner, copied into the TRANSLATED tree beside
// mysql-common.ts AFTER the translation (it talks to drizzle directly, so it
// must not be rewritten itself). See runners/pg.test.ts for why the lane writes
// its own runners instead of vendoring drizzle's.
import {createConnection, type Connection} from 'mysql2/promise';
import {drizzle} from 'drizzle-orm/mysql2';
import {afterAll, beforeAll, beforeEach} from 'vitest';
import {tests} from './mysql-common';
import skipList from './skip-list.json' with {type: 'json'};
import type {MySqlDatabase} from 'drizzle-orm/mysql-core';

let connection: Connection;
// The type the suite's own TestContext declares, so ctx assignment lines up.
let db: MySqlDatabase<any, any>;

beforeAll(async () => {
  const connectionString = process.env['MYSQL_CONNECTION_STRING'];
  if (!connectionString) throw new Error('drizzle-e2e: MYSQL_CONNECTION_STRING is not set; the lane always points at the container mysql');
  // The suites create and drop tables constantly and read back multi-statement
  // results, which is what drizzle's own runner configures too.
  connection = await createConnection({uri: connectionString, supportBigNumbers: true, multipleStatements: true});
  db = drizzle(connection, {logger: false});
});

afterAll(async () => {
  await connection?.end();
});

beforeEach((ctx) => {
  ctx.mysql = {db};
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
skipListed(skipList.mysql as {test: string; reason: string}[]);

tests();
