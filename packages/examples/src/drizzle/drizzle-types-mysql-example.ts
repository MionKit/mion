// The MySQL devices table as a pure type: the twin of
// drizzle-proxy-mysql-example.ts. Params drizzle's own types erase (varchar
// length, unsigned) live in the type itself and reach the validators.
import * as DB from '@mionjs/drizzle-orm-mysql-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {createValidateFn, getRunType} from '@ts-runtypes/core';

export type DevicesRT = DB.MysqlTable<
  'devices',
  {
    serialNo: DB.Varchar<'serial_no', {length: 12}> & DB.NotNull;
    views: DB.Int<'views', {unsigned: true}> & DB.NotNull; // UInt32: 0 to 4294967295
    offsetC: DB.Tinyint<'offset_c'> & DB.NotNull; // Int8: -128 to 127
    builtIn: DB.Year<'built_in'> & DB.NotNull; // 1901 to 2155
  }
>;

// The recorded table back from the type: toDrizzle works on it unchanged.
export const devicesRT = DB.tableFromType<DevicesRT>(getRunType<DevicesRT>());

export type Device = InferSelectModel<DevicesRT>;

export const validateDevice = createValidateFn<Device>();

// false: views is negative and offsetC is beyond Int8
export const check = validateDevice({serialNo: 'SN-1', views: -1, offsetC: 200, builtIn: 2020});
