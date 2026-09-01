// MySQL recorder builders: params drizzle's own types erase (varchar length,
// unsigned) are captured at declaration time and reach the validators.
import * as DZ from '@mionjs/drizzle-orm-mysql-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {createValidateFn} from '@mionjs/run-types';

// A recorded table, NOT drizzle's MySqlTable type: toDrizzle() builds that on demand.
export const devices = DZ.mysqlTable('devices', {
  serialNo: DZ.varchar('serial_no', {length: 12}).notNull(),
  views: DZ.int('views', {unsigned: true}).notNull(), // UInt32: 0 to 4294967295
  offsetC: DZ.tinyint('offset_c').notNull(), // Int8: -128 to 127
  builtIn: DZ.year('built_in').notNull(), // 1901 to 2155
});

export type Device = InferSelectModel<typeof devices>;

export const validateDevice = createValidateFn<Device>();

// false: views is negative and offsetC is beyond Int8
export const check = validateDevice({serialNo: 'SN-1', views: -1, offsetC: 200, builtIn: 2020});
