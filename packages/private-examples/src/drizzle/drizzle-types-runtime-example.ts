import * as DZ from '@mionjs/drizzle-orm-pg-core';
import type {InferInsertModel} from '@mionjs/drizzle-orm';

export type JobsTable = DZ.PgTable<
  'jobs',
  {
    id: DZ.Uuid<{primaryKey: true}>;
    slug: DZ.Varchar<{length: 80; notNull: true; $defaultFn: true}>;
    updatedAt: DZ.Timestamp<{mode: 'string'; $onUpdate: true}>;
  },
  [],
  {updatedAt: 'updated_at'}
>;

// a missing or extra callback throws at startup, naming the column
export const jobs = DZ.tableFromType<JobsTable>({
  runtime: {
    slug: {$defaultFn: () => crypto.randomUUID().slice(0, 8)},
    updatedAt: {$onUpdate: () => new Date().toISOString()},
  },
});

// slug is notNull, but the $defaultFn flag makes it optional on insert
export type NewJob = InferInsertModel<JobsTable>;
export const minimalInsert: NewJob = {id: crypto.randomUUID()};
