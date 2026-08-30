/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// mion routes on workerd, backed by the two Cloudflare storage drivers.
//
// The sibling spec (cloudflareHandler.workers.spec.ts) proves the ADAPTER: a
// request in, a response out. This one proves the whole stack a Cloudflare app
// actually runs — a table declared with @mionjs/drizzle-orm-sqlite-core, refined,
// materialized with toDrizzle(), and queried through `drizzle-orm/d1` against a
// real D1 and through `drizzle-orm/durable-sqlite` inside a real Durable Object.
//
// Three things are checked on BOTH drivers, because all three are generated from
// the table's derived types and none of them is hand-written anywhere:
//   - the refined bound is rejected BEFORE the handler runs
//   - a row round-trips
//   - a Date survives the wire in both directions, from an integer timestamp
//
// This is a modules worker, not the service worker the other spec loads: a
// service worker cannot export a class, so it cannot host a Durable Object.
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {Miniflare} from 'miniflare';
import {resolve} from 'path';
import {MION_ROUTES, StatusCodes, type PublicRpcError} from '@mionjs/core';

/** The pre-built modules bundle (all deps inlined + AOT caches), rebuilt every run. */
const STORAGE_BUNDLE_PATH = resolve(__dirname, '../../test-server/build/test-server-cloudflare-storage.js');

let mf: Miniflare;

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: STORAGE_BUNDLE_PATH,
    // useSQLite is what makes it a SQL-backed Durable Object, which is the only
    // kind drizzle-orm/durable-sqlite can drive.
    durableObjects: {NOTES_DO: {className: 'NotesDurableObject', useSQLite: true}},
    d1Databases: {DB: 'mion-notes'},
    compatibilityDate: '2024-11-12',
    compatibilityFlags: ['nodejs_compat'],
  });
  // Force the runtime up before the first test, so a boot failure reads as a
  // boot failure rather than as every test timing out.
  await mf.ready;
});

afterAll(async () => {
  await mf?.dispose();
});

/** Calls one mion route by its id and returns its parsed body. A nested route's
 *  id is slash-separated (`d1/insert`), and the id is both the path and the key
 *  the params and the result travel under. */
async function call(id: string, params: unknown[]): Promise<any> {
  const response = await mf.dispatchFetch(`http://localhost/api/${id}`, {
    method: 'POST',
    body: JSON.stringify({[id]: params}),
    headers: {'content-type': 'application/json'},
  });
  return JSON.parse(await response.text());
}

/** A route whose return type is a union arrives as `[branchIndex, value]`. Which
 *  index means which branch is the router's business; the tests only need the
 *  value, so this unwraps it either way. */
function branch(result: unknown): any {
  return Array.isArray(result) ? result[1] : result;
}

// The same three checks against each driver: the routes differ only in where the
// row is stored, so a table that works on one and not the other is exactly what
// this is here to catch.
describe.each([
  ['D1', 'd1'],
  ['Durable Objects SQLite', 'durable'],
])('%s', (_label, ns) => {
  it('stores a row and gives back a real Date', async () => {
    // Whole seconds: a sqlite `integer` timestamp stores unix SECONDS, so a Date
    // carrying milliseconds would come back rounded and the assertion below would
    // be testing sqlite's storage width rather than the round trip.
    const createdAt = new Date('2026-02-03T04:05:06.000Z');
    const inserted = await call(`${ns}/insert`, [{title: 'first note', createdAt}]);
    const row = inserted[`${ns}/insert`];
    expect(row.title).toBe('first note');
    expect(typeof row.id).toBe('number');

    const selected = await call(`${ns}/select`, [row.id]);
    const found = branch(selected[`${ns}/select`]);
    expect(found.title).toBe('first note');
    // The integer timestamp column comes back as the exact instant it went in.
    expect(new Date(found.createdAt).getTime()).toBe(createdAt.getTime());
  });

  it('rejects the refined bound before the handler runs', async () => {
    // `title` is refined to minLength 3, so this never reaches the database: the
    // failure is a thrown validation error, not a route result.
    const result = await call(`${ns}/insert`, [{title: 'no', createdAt: new Date()}]);
    const error = result[MION_ROUTES.thrownErrors][`${ns}/insert`] as PublicRpcError<'validation-error'>;
    expect(error.type).toBe('validation-error');
    expect(error.statusCode).toBe(StatusCodes.UNEXPECTED_ERROR);
    // And it names the refined bound, not just the column.
    expect(JSON.stringify(error.errorData)).toContain('minLength');
  });

  it('returns the declared route error for a missing row', async () => {
    const result = await call(`${ns}/select`, [987654]);
    // A RETURNED error is a branch of the route's union return, not a throw.
    const error = branch(result[`${ns}/select`]) as PublicRpcError<'note-not-found'>;
    expect(error.type).toBe('note-not-found');
  });
});
