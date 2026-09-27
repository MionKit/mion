/* eslint-disable @mionjs/strong-typed-routes -- this file is the inferred-return side of the comparison */
import {eq, sql} from 'drizzle-orm';
import {mion} from './mion.ts';
import {db, notesDb} from '../db/sqlite.db.ts';
import type {NewNote} from '../db/sqlite.schema.ts';

export const sqliteRoutes = {
  // case: selectAll
  listNotes: mion.route(async () => db.select().from(notesDb)),

  // case: insertReturning
  createNote: mion.route(async (_ctx, note: NewNote) => {
    const [row] = await db.insert(notesDb).values(note).returning();
    return row;
  }),

  // case: transaction (pg-proxy and mysql-proxy refuse transactions, sqlite-proxy runs them)
  bumpRatings: mion.route(async (_ctx, fromId: number, toId: number) =>
    db.transaction(async (tx) => {
      const [from] = await tx
        .update(notesDb)
        .set({rating: sql`${notesDb.rating} - 1`})
        .where(eq(notesDb.id, fromId))
        .returning({id: notesDb.id, rating: notesDb.rating, createdAt: notesDb.createdAt});
      const [to] = await tx
        .update(notesDb)
        .set({rating: sql`${notesDb.rating} + 1`})
        .where(eq(notesDb.id, toId))
        .returning({id: notesDb.id, rating: notesDb.rating, createdAt: notesDb.createdAt});
      return {from, to};
    })
  ),
};
