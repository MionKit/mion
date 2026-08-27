// MySQL proxy builders: params drizzle's own types erase (varchar length,
// unsigned) are captured at declaration time and reach the validators.
import {mysqlTable, varchar, int, tinyint, year} from '@mionjs/drizzle/mysql';
import type {InferSelectModel} from 'drizzle-orm';
import {createValidateFn} from '@ts-runtypes/core';

export const devices = mysqlTable('devices', {
  serialNo: varchar('serial_no', {length: 12}).notNull(),
  views: int('views', {unsigned: true}).notNull(), // UInt32: 0 to 4294967295
  offsetC: tinyint('offset_c').notNull(), // Int8: -128 to 127
  builtIn: year('built_in').notNull(), // 1901 to 2155
});

export type Device = InferSelectModel<typeof devices>;

export const validateDevice = createValidateFn<Device>();

// false: views is negative and offsetC is beyond Int8
export const check = validateDevice({serialNo: 'SN-1', views: -1, offsetC: 200, builtIn: 2020});
