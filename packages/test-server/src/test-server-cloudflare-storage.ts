/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The Cloudflare STORAGE worker: mion routes whose data comes from a real D1
// database and a real Durable Object, both queried through one slim sqlite table.
//
// Why a second cloudflare bundle rather than routes added to the first: that one
// is a SERVICE WORKER (`addEventListener('fetch')`), and a service worker cannot
// export a class, so it cannot host a Durable Object at all. This one is a
// modules worker, which is also what a consumer writes today.
//
// What it is here to prove, end to end on workerd:
//   - a table declared with @mionjs/drizzle-orm-sqlite-core, refined, and handed
//     to BOTH Cloudflare drivers through toDrizzle()
//   - mion validating the refined bounds BEFORE the handler runs
//   - a Date surviving the wire in both directions, from an integer timestamp
//     column, with no hand-written serialization anywhere
import {DurableObject} from 'cloudflare:workers';
import {eq} from 'drizzle-orm';
import {drizzle as d1Drizzle} from 'drizzle-orm/d1';
import {drizzle as doDrizzle} from 'drizzle-orm/durable-sqlite';
import type {DrizzleD1Database} from 'drizzle-orm/d1';
import type {DrizzleSqliteDODatabase} from 'drizzle-orm/durable-sqlite';
import {RpcError} from '@mionjs/core';
import {createMionRouter, resetRouter} from '@mionjs/router';
import type {CallContext, Route, Routes} from '@mionjs/router';
import {createCloudflareHandler, resetCloudflareHandlerOpts} from '@mionjs/platform-cloudflare';
import {integer, sqliteTable, text} from '@mionjs/drizzle-orm-sqlite-core';
import {toDrizzle} from '@mionjs/drizzle-orm-sqlite-core/drizzle';
import {refineTableType} from '@mionjs/drizzle-orm';
import type {InferInsertModel, InferSelectModel} from '@mionjs/drizzle-orm';

// ############# The table #############

const notesTable = sqliteTable('notes', {
  id: integer('id').primaryKey({autoIncrement: true}),
  title: text('title', {length: 120}).notNull(),
  // An integer timestamp: its model is a Date, which is the interesting half of
  // the round trip.
  createdAt: integer('created_at', {mode: 'timestamp'}).notNull(),
});
const apiNotes = refineTableType(notesTable, {title: {minLength: 3}});
const notesDb = toDrizzle(apiNotes);

export type Note = InferSelectModel<typeof apiNotes>;
export type NewNote = InferInsertModel<typeof apiNotes>;

// The one schema both drivers create. sqlite spells it the same either side, so
// the two storage backends really are running the same table.
const CREATE_NOTES =
  'CREATE TABLE IF NOT EXISTS notes (id integer PRIMARY KEY AUTOINCREMENT, title text NOT NULL, created_at integer NOT NULL)';

// ############# The Durable Object #############

/** Holds its own SQLite storage and its own drizzle db, and exposes the two
 *  operations the routes need as RPC methods. This is drizzle-orm/durable-sqlite
 *  used the way its docs describe: `drizzle(ctx.storage)` inside the object. */
export class NotesDurableObject extends DurableObject {
  private readonly db: DrizzleSqliteDODatabase;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.db = doDrizzle(ctx.storage, {logger: false});
    ctx.storage.sql.exec(CREATE_NOTES);
  }

  async insertNote(note: NewNote): Promise<Note> {
    const [row] = await this.db.insert(notesDb).values(note).returning();
    return row as Note;
  }

  async getNote(id: number): Promise<Note | undefined> {
    const [row] = await this.db.select().from(notesDb).where(eq(notesDb.id, id));
    return row as Note | undefined;
  }
}

// ############# Routes #############

interface StorageEnv {
  DB: never;
  NOTES_DO: {idFromName(name: string): unknown; get(id: unknown): NotesDurableObject};
}

type SharedData = {d1: DrizzleD1Database | null; notes: NotesDurableObject | null};
type Context = CallContext<SharedData>;

const getSharedData = (): SharedData => ({d1: null, notes: null});
const mion = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});

/** A raw middleFn is how a route reaches the platform's own context: the
 *  cloudflare adapter passes `{env, ctx}` as the raw response, so this is where
 *  the bindings become a drizzle db the typed routes below can use. */
const withStorage = mion.rawMiddleFn(async (ctx: Context, _request: unknown, platform: {env: StorageEnv}): Promise<void> => {
  const db = d1Drizzle(platform.env.DB, {logger: false});
  await db.run(CREATE_NOTES as never);
  ctx.shared.d1 = db;
  ctx.shared.notes = platform.env.NOTES_DO.get(platform.env.NOTES_DO.idFromName('notes'));
});

const noteNotFound = (): RpcError<'note-not-found'> => new RpcError({publicMessage: 'Note not found', type: 'note-not-found'});

const d1Insert: Route = mion.route(async (ctx: Context, note: NewNote): Promise<Note> => {
  const [row] = await ctx.shared.d1!.insert(notesDb).values(note).returning();
  return row as Note;
});

const d1Select: Route = mion.route(async (ctx: Context, id: number): Promise<Note | RpcError<'note-not-found'>> => {
  const [row] = await ctx.shared.d1!.select().from(notesDb).where(eq(notesDb.id, id));
  return (row as Note | undefined) ?? noteNotFound();
});

const doInsert: Route = mion.route(async (ctx: Context, note: NewNote): Promise<Note> => ctx.shared.notes!.insertNote(note));

const doSelect: Route = mion.route(async (ctx: Context, id: number): Promise<Note | RpcError<'note-not-found'>> => {
  return (await ctx.shared.notes!.getNote(id)) ?? noteNotFound();
});

const storageRoutes = {
  withStorage,
  d1: {insert: d1Insert, select: d1Select},
  durable: {insert: doInsert, select: doSelect},
} satisfies Routes;

export type StorageApi = typeof storageRoutes;

// ############# Worker #############

let handler: ReturnType<typeof createCloudflareHandler> | undefined;

async function ensureHandler(): Promise<ReturnType<typeof createCloudflareHandler>> {
  if (handler) return handler;
  resetCloudflareHandlerOpts();
  resetRouter();
  mion.initRoutes(storageRoutes);
  handler = createCloudflareHandler({basePath: '', defaultResponseHeaders: {}});
  return handler;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    const worker = await ensureHandler();
    return worker.fetch(request, env, ctx as never);
  },
};
