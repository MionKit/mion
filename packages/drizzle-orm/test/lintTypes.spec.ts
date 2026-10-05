import {describe, expect, it, vi} from 'vitest';
vi.setConfig({testTimeout: 60000});
import {database, dialects, scan, tables, TYPE_CODE} from './lintFixture.ts';

const route = (type: string, parameter = 'number', body = 'throw new Error()') => `import {query} from '@mionjs/router';
 import type {DbUser} from './db.ts';
 import type {User} from './schema.ts';
 export const list = query(async (_ctx: unknown, id: ${parameter}): Promise<${type}> => {${body}});`;

describe.each(dialects)('$name public Drizzle types', (dialect) => {
  const base = () => ({'schema.ts': tables(dialect), 'db.ts': database(dialect)});
  it.each([
    'DbUser',
    'DbUser[]',
    '{item: DbUser}',
    'Map<string, DbUser>',
    '[string, DbUser?]',
    'DbUser | null',
    '{[key:string]: DbUser}',
    "DbUser['id']",
    '{item: {rows: DbUser[]}}',
  ])('reports %s and accepts the slim twin', async (type) => {
    const diagnostics = await scan({...base(), 'routes.ts': route(type)});
    expect(diagnostics.filter((d) => d.code === TYPE_CODE)).toMatchObject([{level: 3, severity: 2}]);
    expect(
      (await scan({...base(), 'routes.ts': route(type.replaceAll('DbUser', 'User'))})).filter((d) => d.code === TYPE_CODE)
    ).toEqual([]);
  });
  it('checks public params and exempts context', async () => {
    expect((await scan({...base(), 'routes.ts': route('User', 'DbUser')})).filter((d) => d.code === TYPE_CODE)).toHaveLength(1);
    expect(
      (await scan({...base(), 'routes.ts': route('User').replace('_ctx: unknown', '_ctx: DbUser')})).filter(
        (d) => d.code === TYPE_CODE
      )
    ).toEqual([]);
  });
  it('follows aliases, namespace imports, barrels and recursive members', async () => {
    const diagnostics = await scan({
      ...base(),
      'barrel.ts': "export type {DbUser as Row} from './db.ts';",
      'routes.ts': `import {query} from '@mionjs/router';
   import type * as Models from './barrel.ts';
   interface Page {next?: Page; row: Models.Row}
   type Answer = Page;
   export const list=query(async (_ctx):Promise<Answer> => {throw new Error()});`,
    });
    expect(diagnostics.filter((d) => d.code === TYPE_CODE)).toHaveLength(1);
  });
  it('accepts Drizzle query bodies behind explicit slim and plain types', async () => {
    const source =
      route('User[]', 'number', `const raw: typeof usersDb.$inferSelect = {id:1,name:'Ada'}; return [raw];`) +
      "\nimport {usersDb} from './db.ts';";
    expect((await scan({...base(), 'routes.ts': source})).filter((d) => d.code === TYPE_CODE)).toEqual([]);
    expect((await scan({...base(), 'routes.ts': route('{id:number;name:string}')})).filter((d) => d.code === TYPE_CODE)).toEqual(
      []
    );
  });
  it('checks model helper types and ignores same-named user types', async () => {
    const source = route("import('drizzle-orm').InferSelectModel<typeof usersDb>") + "\nimport {usersDb} from './db.ts';";
    expect((await scan({...base(), 'routes.ts': source})).filter((d) => d.code === TYPE_CODE)).toHaveLength(1);
    const plain = route('DbUser').replace("import type {DbUser} from './db.ts';", 'interface DbUser {id:number}');
    expect((await scan({...base(), 'routes.ts': plain})).filter((d) => d.code === TYPE_CODE)).toEqual([]);
  });
  it('does not check an inferred handler return twice', async () => {
    const source = route('DbUser').replace(': Promise<DbUser>', '');
    expect((await scan({...base(), 'routes.ts': source})).filter((d) => d.code === TYPE_CODE)).toEqual([]);
  });
});

it('follows typeof query returns without tainting explicitly typed boundaries', async () => {
  const common = {'schema.ts': tables(), 'db.ts': database()};
  const queries = `import {usersDb} from './db.ts';
 export const queryRows = () => Promise.resolve([] as typeof usersDb.$inferSelect[]);
 export const plainRows = ():Promise<{id:number;name:string}[]> => queryRows();
 export const rebuiltRows = () => {const unused = queryRows(); return [{id:1,name:'Ada'}];};`;
  for (const [name, count] of [
    ['queryRows', 1],
    ['plainRows', 0],
    ['rebuiltRows', 0],
  ] as const) {
    const source = `import {query} from '@mionjs/router';import {${name}} from './queries.ts';
  export const list=query(async (_ctx):Promise<Awaited<ReturnType<typeof ${name}>>> => ${name}());`;
    expect(
      (await scan({...common, 'queries.ts': queries, 'routes.ts': source})).filter((d) => d.code === TYPE_CODE),
      name
    ).toHaveLength(count);
  }
});
it('anchors external handler reports at the local route reference', async () => {
  const diagnostics = await scan({
    'schema.ts': tables(),
    'db.ts': database(),
    'handler.ts': `import type {DbUser} from './db.ts'; export function handler(_ctx:unknown):DbUser {throw new Error()}`,
    'routes.ts': `import {query} from '@mionjs/router';
import {handler} from './handler.ts';
export const list=query(handler);`,
  });
  expect(diagnostics.filter((d) => d.code === TYPE_CODE)).toMatchObject([{site: {startLine: 3}}]);
});

it('resolves router helper aliases through a barrel without a router name in the file', async () => {
  const diagnostics = await scan({
    'schema.ts': tables(),
    'db.ts': database(),
    'helpers.ts': "export {query as go} from '@mionjs/router';",
    'routes.ts': `import {go} from './helpers.ts';import type {DbUser} from './db.ts';
 export const list=go(async (_ctx):Promise<DbUser>=>{throw new Error()});`,
  });
  expect(diagnostics.filter((d) => d.code === TYPE_CODE)).toHaveLength(1);
});
it('recognizes ambient Drizzle subpaths and rejects lookalike packages', async () => {
  for (const [module, count] of [
    ['drizzle-orm/pg-core', 1],
    ['unrelated', 0],
  ] as const) {
    const diagnostics = await scan({
      'foreign.d.ts': `declare module '${module}' {export interface Record {id:number}}`,
      'routes.ts': `import {query} from '@mionjs/router';import type {Record} from '${module}';
   export const list=query(async (_ctx):Promise<Record>=>({id:1}));`,
    });
    expect(
      diagnostics.filter((d) => d.code === TYPE_CODE),
      module
    ).toHaveLength(count);
  }
});

it('uses the owning manifest rather than the directory name', async () => {
  for (const [owner, count] of [
    ['drizzle-orm', 1],
    ['lookalike', 0],
  ] as const) {
    const diagnostics = await scan({
      'vendor/drizzle-orm/package.json': JSON.stringify({name: owner}),
      'vendor/drizzle-orm/index.ts': 'export interface DbUser {id:number}',
      'routes.ts': `import {query} from '@mionjs/router';import type {DbUser} from './vendor/drizzle-orm/index.ts';
   export const list=query(async (_ctx):Promise<DbUser>=>({id:1}));`,
    });
    expect(
      diagnostics.filter((d) => d.code === TYPE_CODE),
      owner
    ).toHaveLength(count);
  }
});

it('terminates on growing generic recursion and still reads sibling Drizzle fields', async () => {
  for (const [field, count] of [
    ['number', 0],
    ['DbUser', 1],
  ] as const) {
    const diagnostics = await scan({
      'schema.ts': tables(),
      'db.ts': database(),
      'routes.ts': `import {query} from '@mionjs/router';import type {DbUser} from './db.ts';
   interface Grow<T> {next?:Grow<T[]>; value:T; sibling:${field}}
   export const list=query(async (_ctx):Promise<Grow<string>>=>{throw new Error()});`,
    });
    expect(diagnostics.filter((d) => d.code === TYPE_CODE)).toHaveLength(count);
  }
});
describe.each(dialects)('$name real query return inference', (dialect) => {
  it('checks an inferred query alias and accepts an explicit slim query alias', async () => {
    const driver = dialect.name === 'pg' ? 'pg-proxy' : dialect.name === 'mysql' ? 'mysql-proxy' : 'sqlite-proxy';
    const queries = `import {drizzle} from 'drizzle-orm/${driver}';import {usersDb} from './db.ts';import type {User} from './schema.ts';
   const db=drizzle(async()=>({rows:[]}));
   export const inferred=()=>db.select().from(usersDb);
   export const slim=():Promise<User[]>=>db.select().from(usersDb);`;
    for (const [queryName, count] of [
      ['inferred', 1],
      ['slim', 0],
    ] as const) {
      const source = `import {query} from '@mionjs/router';import {${queryName}} from './queries.ts';
   export const list=query(async (_ctx):Promise<Awaited<ReturnType<typeof ${queryName}>>>=>${queryName}());`;
      expect(
        (
          await scan({'schema.ts': tables(dialect), 'db.ts': database(dialect), 'queries.ts': queries, 'routes.ts': source})
        ).filter((d) => d.code === TYPE_CODE)
      ).toHaveLength(count);
    }
  });
});

describe('handler declaration forms', () => {
  it.each([
    `import {query as alias} from '@mionjs/router';export const list=alias((_ctx):DbUser=>{throw new Error()});`,
    `import * as R from '@mionjs/router';export const list=R.query((_ctx):DbUser=>{throw new Error()});`,
    `import {middleware} from '@mionjs/router';export const list=middleware((_ctx):DbUser=>{throw new Error()});`,
    `import {headersMiddleware} from '@mionjs/router';export const list=headersMiddleware((_ctx:DbUser,headers:DbUser):number=>1);`,
    `import {query} from '@mionjs/router';function read(_ctx:unknown):DbUser {throw new Error()} export const list=query(read);`,
    `import type {Handler} from '@mionjs/router';export const read:Handler=(_ctx):DbUser=>{throw new Error()};`,
    `/** @mion:route */\nexport const read=(_ctx:unknown):DbUser=>{throw new Error()};`,
  ])('finds public annotations through %s', async (source) => {
    const diagnostics = await scan({
      'schema.ts': tables(),
      'db.ts': database(),
      'routes.ts': "import type {DbUser} from './db.ts';\n" + source,
    });
    expect(diagnostics.filter((d) => d.code === TYPE_CODE)).toHaveLength(source.includes('headersMiddleware') ? 0 : 1);
  });
});
it('checks insert model helpers, intersections, generic wrappers and value queries', async () => {
  for (const type of [
    'typeof usersDb.$inferInsert',
    "import('drizzle-orm').InferInsertModel<typeof usersDb>",
    'Box<DbUser>',
    'DbUser & {extra:string}',
    'typeof queryResult',
  ]) {
    const source = `import {query} from '@mionjs/router';import {usersDb} from './db.ts';import type {DbUser} from './db.ts';
  interface Box<T> {value:T} const queryResult=usersDb.$inferSelect;
  export const list=query((_ctx,body:${type}):void=>{});`;
    expect(
      (await scan({'schema.ts': tables(), 'db.ts': database(), 'routes.ts': source})).filter((d) => d.code === TYPE_CODE),
      type
    ).toHaveLength(1);
  }
});
it('accepts a published plain signature and local reconstructed query results', async () => {
  const source = `import {query} from '@mionjs/router';import {read} from './published.js';
 export const list=query(async (_ctx):Promise<Awaited<ReturnType<typeof read>>>=>read());`;
  expect(
    (
      await scan({'published.d.ts': 'export declare function read():Promise<{id:number;name:string}>;', 'routes.ts': source})
    ).filter((d) => d.code === TYPE_CODE)
  ).toEqual([]);
});
it.each([
  ["DbUser['id']", 1],
  ["User['id']", 0],
  ['number', 0],
] as const)('preserves generic type-query arguments: %s', async (type, count) => {
  const diagnostics = await scan({
    'schema.ts': tables(),
    'db.ts': database(),
    'routes.ts': `import {query} from '@mionjs/router';
import type {DbUser} from './db.ts'; import type {User} from './schema.ts';
declare function identity<T>():T;
export const read=query((_ctx):ReturnType<typeof identity<${type}>>=>1);`,
  });
  expect(diagnostics.filter((d) => d.code === TYPE_CODE)).toHaveLength(count);
});

it.each([
  ['constructor(){getTableName(usersDb);}', 0],
  ['static value=getTableName(usersDb); static {getTableName(usersDb);}', 0],
  ['row!:DbUser;', 1],
  ['constructor(public row:DbUser){}', 1],
] as const)('checks class instance types without inspecting internal statements: %s', async (members, count) => {
  const diagnostics = await scan({
    'schema.ts': tables(),
    'db.ts': database(),
    'routes.ts': `import {query} from '@mionjs/router'; import {getTableName} from 'drizzle-orm';
import {usersDb} from './db.ts'; import type {DbUser} from './db.ts';
class PublicRow {id:number=1; ${members}}
export const read=query((_ctx):PublicRow=>{throw new Error()});`,
  });
  expect(diagnostics.filter((d) => d.code === TYPE_CODE)).toHaveLength(count);
});

it('reports the exact written annotation span', async () => {
  const source = `import {query} from '@mionjs/router';import type {DbUser} from './db.ts';
export const list=query((_ctx):DbUser => {throw new Error()});`;
  const diagnostics = await scan({'schema.ts': tables(), 'db.ts': database(), 'routes.ts': source});
  const line = source.split('\n')[1];
  const column = line.indexOf('DbUser') + 1;
  expect(diagnostics.filter((d) => d.code === TYPE_CODE)).toMatchObject([
    {site: {startLine: 2, startCol: column, endLine: 2, endCol: column + 'DbUser'.length}},
  ]);
});
