import {expect, it, describe, vi} from 'vitest';
vi.setConfig({testTimeout: 60000});
import {database, dialects, scan, tables, SCHEMA_CODE} from './lintFixture.ts';

it('checks schemas importing recursive third-party test helpers without expanding their callable types', async () => {
  const source = tables() + "\nimport {describe, it, expect} from 'vitest';";
  expect((await scan({'schema.ts': source}, 'schema.ts')).filter((d) => d.code === SCHEMA_CODE)).toEqual([]);
}, 10000);

describe.each(dialects)('$name slim schema isolation', (dialect) => {
  it('recognizes locally aliased schema builders', async () => {
    const source = `import {${dialect.table}, ${dialect.name === 'mysql' ? 'int' : 'integer'} as integer} from '@mionjs/drizzle-orm-${dialect.module}-core';
      import type {SQL} from 'drizzle-orm';
      const makeTable = ${dialect.table};
      export const users = makeTable('users', {id: integer('id')});`;
    expect((await scan({'schema.ts': source}, 'schema.ts')).filter((d) => d.code === SCHEMA_CODE)).toHaveLength(1);
  });
  it.each([
    `import {toDrizzle} from '@mionjs/drizzle-orm-${dialect.module}-core/drizzle';`,
    `import * as bridge from '@mionjs/drizzle-orm-${dialect.module}-core/drizzle';`,
    `import type {InferSelectModel} from 'drizzle-orm';`,
    `import {sql} from 'drizzle-orm';`,
  ])('rejects a heavy dependency beside authored tables: %s', async (dependency) => {
    const diagnostics = await scan({'schema.ts': tables(dialect) + '\n' + dependency}, 'schema.ts');
    expect(diagnostics.filter((d) => d.code === SCHEMA_CODE)).toHaveLength(1);
    expect(diagnostics.find((d) => d.code === SCHEMA_CODE)).toMatchObject({level: 2, severity: 1});
  });
  it('allows companion conversion/query files that consume existing schemas', async () => {
    const diagnostics = await scan({'schema.ts': tables(dialect), 'db.ts': database(dialect)}, 'db.ts');
    expect(diagnostics.filter((d) => d.code === SCHEMA_CODE)).toEqual([]);
  });
  it('checks model-only files', async () => {
    const model = `import type {InferSelectModel} from '@mionjs/drizzle-orm';
  import {users} from './schema.ts';
  import type {SQL} from 'drizzle-orm';
  export type User=InferSelectModel<typeof users>;`;
    expect(
      (await scan({'schema.ts': tables(dialect), 'model.ts': model}, 'model.ts')).filter((d) => d.code === SCHEMA_CODE)
    ).toHaveLength(1);
  });
  it('follows converter aliases through local barrels', async () => {
    const diagnostics = await scan(
      {
        'bridge.ts': `export {toDrizzle as convert} from '@mionjs/drizzle-orm-${dialect.module}-core/drizzle';`,
        'schema.ts': tables(dialect) + "\nimport {convert} from './bridge.ts';",
      },
      'schema.ts'
    );
    expect(diagnostics.filter((d) => d.code === SCHEMA_CODE)).toHaveLength(1);
  });
  it('ignores local functions with familiar names', async () => {
    const diagnostics = await scan(
      {
        'local.ts': 'export const toDrizzle = (value:unknown):unknown => value;',
        'schema.ts': tables(dialect) + "\nimport {toDrizzle} from './local.ts';",
      },
      'schema.ts'
    );
    expect(diagnostics.filter((d) => d.code === SCHEMA_CODE)).toEqual([]);
  });
  it('checks type-authored tables', async () => {
    const diagnostics = await scan(
      {
        'schema.ts': `import type {${dialect.type},${dialect.name === 'mysql' ? 'Int' : 'Integer'} as Integer} from '@mionjs/drizzle-orm-${dialect.module}-core';
   import type {SQL} from 'drizzle-orm';
   export type Users=${dialect.type}<'users',{id:Integer}>;`,
      },
      'schema.ts'
    );
    expect(diagnostics.filter((d) => d.code === SCHEMA_CODE)).toHaveLength(1);
  });
});

it('checks import types and Drizzle re-exports in schema files', async () => {
  for (const dependency of ["export type {SQL} from 'drizzle-orm';", "export type Statement = import('drizzle-orm').SQL;"]) {
    expect(
      (await scan({'schema.ts': tables() + '\n' + dependency}, 'schema.ts')).filter((d) => d.code === SCHEMA_CODE)
    ).toHaveLength(1);
  }
});
it.each([
  ["export * from '@mionjs/drizzle-orm-pg-core/drizzle';", 1],
  ["export * from './heavy.ts';", 1],
  ["export * from './clean.ts';", 0],
] as const)('follows star re-export dependencies: %s', async (dependency, count) => {
  const diagnostics = await scan(
    {
      'schema.ts': tables() + '\n' + dependency,
      'heavy.ts': "export * from './cycle.ts'; export {sql} from 'drizzle-orm';",
      'cycle.ts': "export * from './heavy.ts';",
      'clean.ts': "export * from './clean-cycle.ts'; export const id=1;",
      'clean-cycle.ts': "export * from './clean.ts';",
    },
    'schema.ts'
  );
  expect(diagnostics.filter((d) => d.code === SCHEMA_CODE)).toHaveLength(count);
});
it('recognizes models authored through import-type syntax', async () => {
  const source = `import {users} from './schema.ts';
 import type {SQL} from 'drizzle-orm';
 export type User=import('@mionjs/drizzle-orm').InferSelectModel<typeof users>;`;
  expect(
    (await scan({'schema.ts': tables(), 'model.ts': source}, 'model.ts')).filter((d) => d.code === SCHEMA_CODE)
  ).toHaveLength(1);
});
it.each([
  ['InferSelectModel<typeof users>', 1],
  ['User', 0],
] as const)('distinguishes interface model derivation from consumption: %s', async (base, count) => {
  const source = `import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {users, type User} from './schema.ts'; import type {SQL} from 'drizzle-orm';
export interface PublicUser extends ${base} {}`;
  expect(
    (await scan({'schema.ts': tables(), 'model.ts': source}, 'model.ts')).filter((d) => d.code === SCHEMA_CODE)
  ).toHaveLength(count);
});
it.each(['$inferSelect', '$inferInsert'])('recognizes models authored through typeof table.%s', async (property) => {
  const source = `import {users} from './schema.ts';
 import type {SQL} from 'drizzle-orm';
 export type User=typeof users.${property};`;
  expect(
    (await scan({'schema.ts': tables(), 'model.ts': source}, 'model.ts')).filter((d) => d.code === SCHEMA_CODE)
  ).toHaveLength(1);
});
it.each([
  `pgEnum('status', ['active','paused'])`,
  `pgEnum('status', {Active:'active',Paused:'paused'})`,
  `pgSchema('app')`,
  `pgSequence('ids')`,
])('recognizes standalone slim schema helpers: %s', async (expression) => {
  const source = `import {pgEnum,pgSchema,pgSequence} from '@mionjs/drizzle-orm-pg-core';
 import type {SQL} from 'drizzle-orm';
 export const schema=${expression};`;
  expect((await scan({'schema.ts': source}, 'schema.ts')).filter((d) => d.code === SCHEMA_CODE)).toHaveLength(1);
});
it('checks manual slim views without a table declaration', async () => {
  const source = `import {pgView,integer} from '@mionjs/drizzle-orm-pg-core';
 import {sql} from '@mionjs/drizzle-orm';
 import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
 export const view=pgView('users',{id:integer('id')}).as(sql\`select 1 as id\`);`;
  expect((await scan({'schema.ts': source}, 'schema.ts')).filter((d) => d.code === SCHEMA_CODE)).toHaveLength(1);
});
