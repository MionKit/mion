// Runtime column callbacks on the types road: a callback has no type spelling,
// so the column carries a $ flag ($default, $defaultFn, $onUpdate, $onUpdateFn)
// and the callback itself rides tableFromType's options. Model types stay
// correct even in type-only files: every $ flag counts as a database default,
// so the column turns optional on insert.
import * as DB from '@mionjs/drizzle-orm-pg-core';
import type {InferInsertModel} from '@mionjs/drizzle-orm';

export type JobsTable = DB.PgTable<
  'jobs',
  {
    id: DB.Uuid<'id', {primaryKey: true}>;
    slug: DB.Varchar<'slug', {length: 80; notNull: true; $defaultFn: true}>;
    updatedAt: DB.Timestamp<'updated_at', {mode: 'string'; $onUpdate: true}>;
  }
>;

// The callbacks pair with the flags by column and name; a missing or extra
// callback throws at startup naming the column, never silently.
export const jobs = DB.tableFromType<JobsTable>({
  runtime: {
    slug: {$defaultFn: () => crypto.randomUUID().slice(0, 8)},
    updatedAt: {$onUpdate: () => new Date().toISOString()},
  },
});

// slug is notNull, but the $defaultFn flag makes it optional on insert:
export type NewJob = InferInsertModel<JobsTable>;
export const minimalInsert: NewJob = {id: crypto.randomUUID()};
