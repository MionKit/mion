/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Runtime pins for the @mionjs/drizzle-orm-mysql-core proxy builders: required varchar
// length, unsigned int widths, tinyint Int8 bounds and the year window all
// reach the compiled validators; the marker pair and shared-function
// guarantees hold; wrappers build the exact drizzle column.

import {describe, it, expect} from 'vitest';
import type {InferSelectModel} from 'drizzle-orm';
import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
import {varchar as drizzleVarchar, int as drizzleInt, mysqlTable as drizzleMysqlTable} from 'drizzle-orm/mysql-core';
import {int, mysqlTable, tinyint, varchar, year} from './index.ts';

const devices = mysqlTable('devices', {
  serialNo: varchar('serial_no', {length: 12}).notNull(),
  views: int('views', {unsigned: true}).notNull(),
  offsetC: tinyint('offset_c').notNull(),
  builtIn: year('built_in').notNull(),
});

type DeviceRow = InferSelectModel<typeof devices>;

const fullRow = {serialNo: 'SN-001', views: 4000000000, offsetC: -40, builtIn: 2020};

describe('mysql proxy - captured params reach the compiled validator', () => {
  const validate = createValidateFn<DeviceRow>();

  it('accepts a valid row (unsigned int beyond Int32 range included)', () => {
    expect(validate(fullRow)).toBe(true);
  });

  it('enforces the required varchar length at the boundary', () => {
    expect(validate({...fullRow, serialNo: 'x'.repeat(12)})).toBe(true);
    expect(validate({...fullRow, serialNo: 'x'.repeat(13)})).toBe(false);
  });

  it('enforces unsigned UInt32, tinyint Int8 and the year window', () => {
    expect(validate({...fullRow, views: -1})).toBe(false);
    expect(validate({...fullRow, views: 4294967296})).toBe(false); // beyond UInt32
    expect(validate({...fullRow, offsetC: 127})).toBe(true);
    expect(validate({...fullRow, offsetC: 128})).toBe(false); // beyond Int8
    expect(validate({...fullRow, builtIn: 1900})).toBe(false);
    expect(validate({...fullRow, builtIn: 2156})).toBe(false);
  });
});

// CLAUDE.md marker-coverage rule: both getRunTypeId call shapes over the row.
describe('mysql proxy - marker coverage + shared compiled functions', () => {
  it('static and reflection getRunTypeId shapes resolve the same id', () => {
    const staticId = getRunTypeId<DeviceRow>();
    const sample: DeviceRow = fullRow;
    expect(getRunTypeId(sample)).toBe(staticId);
  });

  it('two call sites naming the same row type share ONE compiled function object', () => {
    const first = createValidateFn<DeviceRow>();
    const second = createValidateFn<DeviceRow>();
    expect(second).toBe(first);
  });
});

describe('mysql proxy - wrappers build the exact drizzle column (stamp is type-only)', () => {
  const rawDevices = drizzleMysqlTable('devices', {
    serialNo: drizzleVarchar('serial_no', {length: 12}).notNull(),
    views: drizzleInt('views', {unsigned: true}).notNull(),
  });

  it('proxy columns match raw drizzle columns config-for-config', () => {
    expect(devices.serialNo.columnType).toBe(rawDevices.serialNo.columnType);
    expect(devices.serialNo.getSQLType()).toBe(rawDevices.serialNo.getSQLType());
    expect(devices.views.columnType).toBe(rawDevices.views.columnType);
    expect(devices.views.getSQLType()).toBe(rawDevices.views.getSQLType());
  });
});
