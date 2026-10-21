import {getTableConfig as pgConfig} from 'drizzle-orm/pg-core';
import {getTableConfig as mysqlConfig} from 'drizzle-orm/mysql-core';
import {getTableConfig as sqliteConfig} from 'drizzle-orm/sqlite-core';
import * as pgBuilders from '../src/db/pg.builders.db.ts';
import * as pgTypes from '../src/db/pg.types.db.ts';
import * as pgDrizzle from '../src/db/pg.drizzle.ts';
import * as mysqlBuilders from '../src/db/mysql.builders.db.ts';
import * as mysqlTypes from '../src/db/mysql.types.db.ts';
import * as mysqlDrizzle from '../src/db/mysql.drizzle.ts';
import * as sqliteBuilders from '../src/db/sqlite.builders.db.ts';
import * as sqliteTypes from '../src/db/sqlite.types.db.ts';
import * as sqliteDrizzle from '../src/db/sqlite.drizzle.ts';

type Config = (table: never) => {
  name: string;
  columns: {name: string; notNull: boolean; primary: boolean; hasDefault: boolean}[];
  foreignKeys: {reference(): {columns: {name: string}[]; foreignColumns: {name: string; table: unknown}[]}}[];
};

// what drizzle-kit reads from a table: the three files of a dialect must build the same database
const shape = (config: Config, table: unknown) => {
  const built = config(table as never);
  return {
    name: built.name,
    columns: built.columns.map(({name, notNull, primary, hasDefault}) => ({name, notNull, primary, hasDefault})),
    foreignKeys: built.foreignKeys.map((key) => {
      const ref = key.reference();
      return {columns: ref.columns.map((col) => col.name), foreignColumns: ref.foreignColumns.map((col) => col.name)};
    }),
  };
};

describe.each([
  ['pg', pgConfig as unknown as Config, pgBuilders, pgTypes, pgDrizzle],
  ['mysql', mysqlConfig as unknown as Config, mysqlBuilders, mysqlTypes, mysqlDrizzle],
  ['sqlite', sqliteConfig as unknown as Config, sqliteBuilders, sqliteTypes, sqliteDrizzle],
] as const)('%s', (_dialect, config, builders, types, plain) => {
  it.each(['usersDb', 'postsDb'] as const)('%s is the same table in all three files', (table) => {
    const expected = shape(config, plain[table]);
    expect(shape(config, builders[table])).toEqual(expected);
    expect(shape(config, types[table])).toEqual(expected);
  });

  it('posts references users in all three files', () => {
    expect(shape(config, types.postsDb).foreignKeys).toEqual([{columns: ['author_id'], foreignColumns: ['id']}]);
  });
});
