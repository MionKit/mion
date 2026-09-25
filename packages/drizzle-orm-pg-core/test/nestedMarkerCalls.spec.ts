/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A tableFromType<T>() nested inside toDrizzle<T>()'s options must get its own injected id.

import {describe, it, expect} from 'vitest';
import {getTableConfig} from 'drizzle-orm/pg-core';
import type {Integer, PgTable} from '../src/index.ts';
import {tableFromType} from '../src/index.ts';
import {toDrizzle} from '../src/drizzle.ts';

type Parents = PgTable<'parents', {id: Integer<'id', {primaryKey: true}>}>;
type Children = PgTable<'children', {pid: Integer<'pid', {references: [{table: 'parents'; column: 'id'}]}>}>;

describe('a marker call nested in toDrizzle options', () => {
  it('nested in an arrow', () => {
    const children = toDrizzle<Children>({tables: {parents: () => tableFromType<Parents>()}});
    // Reading the foreign key is what runs the arrow.
    expect(getTableConfig(children).foreignKeys[0]!.reference().foreignTable).toBeTruthy();
  });

  it('nested directly', () => {
    const children = toDrizzle<Children>({tables: {parents: tableFromType<Parents>()}});
    expect(getTableConfig(children).foreignKeys[0]!.reference().foreignTable).toBeTruthy();
  });

  it('hoisted, as the control', () => {
    const parents = tableFromType<Parents>();
    const children = toDrizzle<Children>({tables: {parents: () => parents}});
    expect(getTableConfig(children).foreignKeys[0]!.reference().foreignTable).toBeTruthy();
  });
});
