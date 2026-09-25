import * as DZ from '@mionjs/drizzle-orm-mysql-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {createValidateFn} from '@mionjs/run-types';

export type DevicesTable = DZ.MysqlTable<
  'devices',
  {
    serialNo: DZ.Varchar<'serial_no', {length: 12; notNull: true}>;
    views: DZ.Int<'views', {unsigned: true; notNull: true}>; // UInt32: 0 to 4294967295
    offsetC: DZ.Tinyint<'offset_c', {notNull: true}>; // Int8: -128 to 127
    builtIn: DZ.Year<'built_in', {notNull: true}>; // 1901 to 2155
  }
>;

// the recorded table, ready for toDrizzle
export const devices = DZ.tableFromType<DevicesTable>();

export type Device = InferSelectModel<DevicesTable>;

export const validateDevice = createValidateFn<Device>();

// false: views is negative and offsetC is beyond Int8
export const check = validateDevice({
  serialNo: 'SN-1',
  views: -1,
  offsetC: 200,
  builtIn: 2020,
});
