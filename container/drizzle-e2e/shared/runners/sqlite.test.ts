// The sqlite lane's runner, copied into the TRANSLATED tree beside
// sqlite-common.ts AFTER the translation (it talks to drizzle directly, so it
// must not be rewritten itself). See runners/pg.test.ts for why the lane writes
// its own runners instead of vendoring drizzle's.
import Database from 'better-sqlite3';
import {drizzle} from 'drizzle-orm/better-sqlite3';
import {afterAll, beforeAll, beforeEach} from 'vitest';
import {skipTests} from '~/common';
import {tests} from './sqlite-common';
import skipList from './skip-list.json' with {type: 'json'};

let client: Database.Database;
let db: ReturnType<typeof drizzle>;

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

skipTests(skipList.sqlite.map((entry) => entry.test));

tests();
