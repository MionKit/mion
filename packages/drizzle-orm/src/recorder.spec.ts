/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Recorder-core specs run against a FAKE namespace on purpose: this package
// must record and replay without drizzle-orm installed at all (it is an
// optional peer). Real-drizzle equality is pinned in the dialect packages via
// getTableConfig.

import {describe, it, expect} from 'vitest';
import {RtColumnRecorder, RtEntryRecorder, RtValueRecorder, sql, type DrizzleContext, type SqlNamespace} from './recorder.ts';
import {createRtTable, materializeRtTable} from './table.ts';

interface Fake {
  context: DrizzleContext;
  calls: unknown[][];
}

/** Namespace stand-in: every ns.fn(...) logs and returns a chainable proxy
 *  whose method calls log too — the same mutate-and-return-this shape drizzle
 *  builders have. */
function makeFakeContext(): Fake {
  const calls: unknown[][] = [];
  const chain = (label: string) => {
    const self = {label} as Record<string, unknown>;
    const proxy: Record<string, unknown> = new Proxy(self, {
      get(obj, prop) {
        if (typeof prop !== 'string' || prop in obj) return obj[prop as string];
        return (...args: unknown[]) => {
          calls.push([label, prop, ...args]);
          return proxy;
        };
      },
    });
    return proxy as never;
  };
  const ns = new Proxy({} as Record<string, (...args: never[]) => unknown>, {
    get:
      (_obj, fnName) =>
      (...args: unknown[]) => {
        calls.push(['ns', fnName, ...args]);
        return chain(`ns.${String(fnName)}`);
      },
  });
  const sqlNs = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(['sql', 'template', [...strings], ...values]);
    return {sqlOf: values};
  }) as SqlNamespace;
  sqlNs.raw = (query: string) => {
    calls.push(['sql', 'raw', query]);
    return {rawOf: query};
  };
  return {context: {ns, sqlNs}, calls};
}

/** A fake dialect table factory: exposes per-key column markers and runs the
 *  extraConfig replay against fake extra columns that support the index
 *  decorators the way drizzle's ExtraConfigColumn does. */
function fakeBuildTable(calls: unknown[][]) {
  return (
    context: DrizzleContext,
    name: string,
    builders: Record<string, unknown>,
    extraReplay?: (cols: Record<string, unknown>) => unknown[] | Record<string, unknown>
  ) => {
    void context;
    const table: Record<string, unknown> = {tableName: name};
    for (const key of Object.keys(builders)) table[key] = {dzColumn: `${name}.${key}`};
    if (extraReplay) {
      const extraColumns: Record<string, unknown> = {};
      for (const key of Object.keys(builders)) {
        extraColumns[key] = {
          extraColumn: `${name}.${key}`,
          desc() {
            return {descOf: `${name}.${key}`};
          },
        };
      }
      table.extras = extraReplay(extraColumns);
    }
    calls.push(['buildTable', name, Object.keys(builders)]);
    return table;
  };
}

function column(fnName: string, ...args: unknown[]): RtColumnRecorder {
  return new RtColumnRecorder((context) => context.ns[fnName](...(args as never[])));
}

describe('recorder core (fake namespace, no drizzle installed)', () => {
  it('replays init + modifiers in recorded order with the recorded args', () => {
    const fake = makeFakeContext();
    const name = column('varchar', 'name', {length: 100});
    name.notNull().default('x');
    name.toDrizzleColumn(fake.context);
    expect(fake.calls).toEqual([
      ['ns', 'varchar', 'name', {length: 100}],
      ['ns.varchar', 'notNull'],
      ['ns.varchar', 'default', 'x'],
    ]);
  });

  it('$type records nothing and asc()/desc() never touch the column mods', () => {
    const fake = makeFakeContext();
    const age = column('integer', 'age');
    age.$type();
    age.asc();
    age.desc();
    age.toDrizzleColumn(fake.context);
    expect(fake.calls).toEqual([['ns', 'integer', 'age']]);
  });

  it('materializes a table once, memoized, with every column built', () => {
    const fake = makeFakeContext();
    const cols = {name: column('varchar', 'name'), age: column('integer', 'age')};
    const users = createRtTable('users', cols, undefined, fakeBuildTable(fake.calls));
    const dz = materializeRtTable(users, fake.context) as Record<string, unknown>;
    expect(dz.tableName).toBe('users');
    expect(materializeRtTable(users, fake.context)).toBe(dz);
    expect(fake.calls.filter((call) => call[0] === 'buildTable')).toEqual([['buildTable', 'users', ['name', 'age']]]);
  });

  it('rejects a column builder reused across two tables', () => {
    const fake = makeFakeContext();
    const shared = column('integer', 'id');
    createRtTable('a', {id: shared}, undefined, fakeBuildTable(fake.calls));
    expect(() => createRtTable('b', {id: shared}, undefined, fakeBuildTable(fake.calls))).toThrowError(
      /already used in another table/
    );
  });

  it('references replays lazily against the other table materialized on demand', () => {
    const fake = makeFakeContext();
    const otherId = column('integer', 'id');
    createRtTable('others', {id: otherId}, undefined, fakeBuildTable(fake.calls));
    const ref = column('integer', 'other_id');
    ref.references(() => otherId, {onDelete: 'cascade'});
    const mine = createRtTable('mine', {otherId: ref}, undefined, fakeBuildTable(fake.calls));

    expect(fake.calls.find((call) => call[1] === 'references')).toBeUndefined();

    materializeRtTable(mine, fake.context);
    const replayed = fake.calls.find((call) => call[1] === 'references')!;
    expect(replayed[0]).toBe('ns.integer');
    const lazy = replayed[2] as () => unknown;
    expect(lazy()).toEqual({dzColumn: 'others.id'});
    expect(replayed[3]).toEqual({onDelete: 'cascade'});
  });

  it('extraConfig entries resolve same-table columns to the extra columns and map sql + decorators', () => {
    const fake = makeFakeContext();
    const cols = {name: column('varchar', 'name'), age: column('integer', 'age')};
    const users = createRtTable(
      'users',
      cols,
      (self: never) => {
        const t = self as {name: RtColumnRecorder; age: RtColumnRecorder};
        return [new RtEntryRecorder('index', ['users_name_idx']).on(t.name.desc(), t.age).where(sql`${t.age} > ${18}`)];
      },
      fakeBuildTable(fake.calls)
    );
    materializeRtTable(users, fake.context);
    expect(fake.calls).toContainEqual(['ns', 'index', 'users_name_idx']);
    const onCall = fake.calls.find((call) => call[0] === 'ns.index' && call[1] === 'on')!;
    expect(onCall[2]).toEqual({descOf: 'users.name'});
    expect(onCall[3]).toEqual(expect.objectContaining({extraColumn: 'users.age'}));
    const whereCall = fake.calls.find((call) => call[0] === 'ns.index' && call[1] === 'where')!;
    expect(whereCall[2]).toEqual({sqlOf: [expect.objectContaining({extraColumn: 'users.age'}), 18]});
  });

  it('sql.raw and value recorders materialize through the context, memoized', () => {
    const fake = makeFakeContext();
    const raw = sql.raw('now()');
    const enumValue = new RtValueRecorder('pgEnum', ['role', ['admin', 'user']]);
    const first = enumValue.toDrizzleValue(fake.context);
    expect(enumValue.toDrizzleValue(fake.context)).toBe(first);
    const col = column('timestamp', 'created_at');
    col.default(raw);
    col.toDrizzleColumn(fake.context);
    expect(fake.calls).toContainEqual(['ns', 'pgEnum', 'role', ['admin', 'user']]);
    expect(fake.calls).toContainEqual(['sql', 'raw', 'now()']);
    const defaultCall = fake.calls.find((call) => call[1] === 'default')!;
    expect(defaultCall[2]).toEqual({rawOf: 'now()'});
  });
});
