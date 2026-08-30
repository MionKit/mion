// The D1 lane's runner, copied into the TRANSLATED tree beside sqlite-common.ts
// AFTER the translation (it talks to drizzle directly, so it must not be
// rewritten itself). See runners/pg.test.ts for why the lane writes its own
// runners instead of vendoring drizzle's.
//
// D1 is a DRIVER, not a dialect: the tables this suite declares come from
// drizzle-orm/sqlite-core, which @mionjs/drizzle-orm-sqlite-core wraps, and the
// only thing that changes here is how the suite reaches storage. So this file is
// the sqlite runner with better-sqlite3 swapped for a real D1 binding.
//
// The D1 comes from miniflare, which is the same workerd a deployed Worker runs
// on, reached from node through getD1Database(). That is what makes it a real
// D1 rather than a sqlite file we have agreed to call one.
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {afterAll, beforeAll, beforeEach} from 'vitest';
import {tests} from './sqlite-common';
import type {BaseSQLiteDatabase} from 'drizzle-orm/sqlite-core';

let mf: Miniflare;
// The type the suite's own TestContext declares, so ctx assignment lines up.
let db: BaseSQLiteDatabase<'sync' | 'async', any, Record<string, never>>;

beforeAll(async () => {
  // A persist DIRECTORY, not miniflare's in-memory default: run-suite.mjs gives
  // each of the three trees its own, which is how this lane gets the isolation
  // the server lanes get from a separate database.
  const persist = process.env['RT_DRIZZLE_MINIFLARE_DIR'];
  if (!persist) throw new Error('drizzle-e2e: RT_DRIZZLE_MINIFLARE_DIR is not set; the lane always points at a persist directory');
  mf = new Miniflare({
    // A do-nothing worker: nothing dispatches to it. The D1 binding is the whole
    // point, and getD1Database() reaches it from node without a fetch.
    modules: true,
    script: 'export default {fetch() {return new Response(null, {status: 404});}};',
    d1Databases: {DB: 'drizzle-e2e'},
    d1Persist: persist,
    compatibilityDate: '2025-07-01',
  });
  db = drizzle(await mf.getD1Database('DB'), {logger: false}) as unknown as typeof db;
});

afterAll(async () => {
  await mf?.dispose();
});

beforeEach((ctx) => {
  ctx.sqlite = {db};
});

tests();
