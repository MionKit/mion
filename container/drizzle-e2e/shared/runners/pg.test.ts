// The pg lane's runner, copied into the TRANSLATED tree beside pg-common.ts
// AFTER the translation (it talks to drizzle directly, so it must not be
// rewritten itself).
//
// We write our own rather than vendoring drizzle's node-postgres.test.ts: that
// one pulls in a per-dialect cache suite this lane does not vendor.
//
// Nothing is skipped here. The lane runs this suite TWICE against the same
// database — once translated onto the slim packages, once on drizzle's own code
// — and compares the outcomes, so a test drizzle itself cannot pass against this
// driver needs no list to excuse it.
import {Client} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {afterAll, beforeAll, beforeEach} from 'vitest';
import {tests} from './pg-common';
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

tests();
