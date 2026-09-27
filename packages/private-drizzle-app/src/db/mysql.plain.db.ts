import {drizzle} from 'drizzle-orm/mysql-proxy';
import {datetime, int, mysqlTable, serial, varchar} from 'drizzle-orm/mysql-core';
import {answer} from './fakeDriver.ts';

// mysql.schema.ts + mysql.db.ts on plain drizzle: the cost baseline, never served.

export const devicesDb = mysqlTable('devices', {
  id: serial('id').primaryKey(),
  serialNo: varchar('serial_no', {length: 12}).notNull(),
  views: int('views', {unsigned: true}).notNull(),
  builtAt: datetime('built_at').notNull(),
});

export const db = drizzle(answer);

export type Device = typeof devicesDb.$inferSelect;
export type NewDevice = typeof devicesDb.$inferInsert;
