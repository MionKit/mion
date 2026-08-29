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
import {skipTests} from '~/common';
import {tests} from './pg-common';
import skipList from './skip-list.json' with {type: 'json'};

let client: Client;
let db: ReturnType<typeof drizzle>;

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

// Every skipped test is named with a reason in skip-list.json. A failure that is
// NOT on that list is a real recorder bug.
skipTests(skipList.pg.map((entry) => entry.test));

tests();
