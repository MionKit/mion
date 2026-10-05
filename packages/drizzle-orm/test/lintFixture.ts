import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ResolverClient} from '../../devtools/src/core/resolver-client.ts';

const root = path.resolve(__dirname, '../../..');
const BIN = path.join(root, 'mion-bin/mion');
const router = `declare module '@mionjs/router' {
 export interface RouteHelper { <F extends (...args: any[]) => any>(handler: F): F }
 export interface MiddlewareHelper { <F extends (...args: any[]) => any>(handler: F): F }
 export interface HeadersMiddlewareHelper { <F extends (...args: any[]) => any>(handler: F): F }
 export type Handler = (ctx: unknown, ...args: any[]) => any;
 export const route: RouteHelper;
 export const query: RouteHelper;
 export const middleware: MiddlewareHelper;
 export const headersMiddleware: HeadersMiddlewareHelper;
}`;
export const TYPE_CODE = 'rpc-handler-drizzle-type';
export const SCHEMA_CODE = 'rpc-handler-drizzle-import';
export const dialects = [
  {name: 'pg', module: 'pg', table: 'pgTable', type: 'PgTable'},
  {name: 'mysql', module: 'mysql', table: 'mysqlTable', type: 'MysqlTable'},
  {name: 'sqlite', module: 'sqlite', table: 'sqliteTable', type: 'SqliteTable'},
] as const;
export function tables(dialect: (typeof dialects)[number] = dialects[0]) {
  return `import {${dialect.table}, ${dialect.name === 'mysql' ? 'int' : 'integer'} as integer, text} from '@mionjs/drizzle-orm-${dialect.module}-core';
 export const users = ${dialect.table}('users', {id: integer('id', {notNull: true}), name: text('name', {notNull: true})});
 export type User = import('@mionjs/drizzle-orm').InferSelectModel<typeof users>;`;
}
export function database(dialect: (typeof dialects)[number] = dialects[0]) {
  return `import {users} from './schema.ts';
 import {toDrizzle} from '@mionjs/drizzle-orm-${dialect.module}-core/drizzle';
 export const usersDb = toDrizzle(users);
 export type DbUser = typeof usersDb.$inferSelect;`;
}
export async function fixture(sources: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mion-drizzle-lint-'));
  let client: ResolverClient | undefined;
  try {
    fs.mkdirSync(path.join(dir, 'node_modules/@mionjs'), {recursive: true});
    for (const name of ['drizzle-orm', 'drizzle-orm-pg-core', 'drizzle-orm-mysql-core', 'drizzle-orm-sqlite-core', 'run-types']) {
      fs.symlinkSync(path.join(root, 'packages', name), path.join(dir, 'node_modules/@mionjs', name), 'dir');
    }
    fs.symlinkSync(path.join(root, 'node_modules/drizzle-orm'), path.join(dir, 'node_modules/drizzle-orm'), 'dir');
    fs.symlinkSync(path.join(root, 'node_modules/vitest'), path.join(dir, 'node_modules/vitest'), 'dir');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: 'lint-consumer', type: 'module'}));
    const tsconfig = path.join(dir, 'tsconfig.json');
    fs.writeFileSync(
      tsconfig,
      JSON.stringify({
        compilerOptions: {
          target: 'ESNext',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          customConditions: ['source'],
          allowImportingTsExtensions: true,
          noEmit: true,
          strict: true,
          skipLibCheck: true,
          types: [],
        },
        include: ['**/*.ts'],
      })
    );
    sources = {'router.d.ts': router, ...sources};
    for (const [file, source] of Object.entries(sources)) {
      const target = path.join(dir, file);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.writeFileSync(target, source);
    }
    client = new ResolverClient(BIN, dir, tsconfig, {serverMode: true, emitMode: 'both', genDir: path.join(dir, '.mion')});
    await client.setSources(Object.fromEntries(Object.entries(sources).map(([file, source]) => [path.join(dir, file), source])));
    return {
      client,
      files: Object.keys(sources)
        .filter((file) => !file.endsWith('.d.ts'))
        .map((file) => path.join(dir, file)),
      path: (file: string) => path.join(dir, file),
      close() {
        client!.close();
        fs.rmSync(dir, {recursive: true, force: true});
      },
    };
  } catch (error) {
    client?.close();
    fs.rmSync(dir, {recursive: true, force: true});
    throw error;
  }
}
export async function scan(sources: Record<string, string>, file = 'routes.ts') {
  const f = await fixture(sources);
  try {
    return (await f.client.scanFiles([f.path(file)])).diagnostics ?? [];
  } finally {
    f.close();
  }
}
