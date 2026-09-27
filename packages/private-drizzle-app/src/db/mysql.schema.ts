import * as DZ from '@mionjs/drizzle-orm-mysql-core';
import type {InferInsertModel, InferSelectModel} from '@mionjs/drizzle-orm';

// mysql has no `returning`: an insert hands back only the generated ids.
export const devices = DZ.mysqlTable('devices', {
  id: DZ.serial('id', {primaryKey: true}),
  serialNo: DZ.varchar('serial_no', {length: 12, notNull: true}),
  views: DZ.int('views', {unsigned: true, notNull: true}),
  builtAt: DZ.datetime('built_at', {notNull: true}),
});

export type Device = InferSelectModel<typeof devices>;
export type NewDevice = InferInsertModel<typeof devices>;
