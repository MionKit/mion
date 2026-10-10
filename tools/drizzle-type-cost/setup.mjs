// Builds everything under .work/: tsgo, mion packages as .d.ts, and the fixtures.
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, readdirSync, cpSync} from 'node:fs';
import {join} from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const REPO = join(HERE, '../..');
const WORK = join(HERE, '.work');
const APP_DB = join(REPO, 'packages/private-drizzle-example-app/src/db');
const ts = createRequire(join(REPO, 'package.json'))('typescript');
const LIBS = ['drizzle-orm', 'drizzle-orm-pg-core', 'drizzle-orm-mysql-core', 'drizzle-orm-sqlite-core', 'run-types', 'core'];

rmSync(WORK, {recursive: true, force: true});
mkdirSync(WORK, {recursive: true});

// 1. tsgo, the native compiler, from the pinned submodule
execFileSync('go', ['build', '-o', join(WORK, 'tsgo'), './cmd/tsgo'], {
  cwd: join(REPO, 'ts-go-runtypes/third_party/tsgolint/typescript-go'),
  stdio: 'inherit',
});

// 2. mion packages as .d.ts only, like an installed package
const entries = LIBS.flatMap((p) =>
  Object.values(JSON.parse(readFileSync(join(REPO, 'packages', p, 'package.json'), 'utf8')).exports).map((e) => join(REPO, 'packages', p, e.source))
);
writeFileSync(
  join(WORK, 'tsconfig.libs.json'),
  JSON.stringify({
    extends: join(REPO, 'tsconfig.json'),
    compilerOptions: {
      composite: false, incremental: false, declaration: true, emitDeclarationOnly: true, declarationMap: false,
      sourceMap: false, noEmit: false, outDir: join(WORK, 'libdts'), rootDir: join(REPO, 'packages'),
      types: ['node'], typeRoots: [join(REPO, 'node_modules/@types')],
    },
    files: entries,
  })
);
execFileSync(join(WORK, 'tsgo'), ['-p', join(WORK, 'tsconfig.libs.json')], {stdio: 'inherit'});
for (const p of LIBS) {
  const pkg = JSON.parse(readFileSync(join(REPO, 'packages', p, 'package.json'), 'utf8'));
  const exports = Object.fromEntries(Object.entries(pkg.exports).map(([k, e]) => [k, {types: e.source.replace(/\.ts$/, '.d.ts')}]));
  writeFileSync(join(WORK, 'libdts', p, 'package.json'), JSON.stringify({name: pkg.name, type: 'module', exports}));
}

// 3. node_modules for the type checks (.d.ts) and for the bundles (sources)
mkdirSync(join(WORK, 'node_modules/@mionjs'), {recursive: true});
mkdirSync(join(WORK, 'bundle/node_modules/@mionjs'), {recursive: true});
for (const p of LIBS) {
  symlinkSync(join(WORK, 'libdts', p), join(WORK, 'node_modules/@mionjs', p));
  symlinkSync(join(REPO, 'packages', p), join(WORK, 'bundle/node_modules/@mionjs', p));
}
symlinkSync(join(REPO, 'node_modules/drizzle-orm'), join(WORK, 'node_modules/drizzle-orm'));
symlinkSync(join(REPO, 'node_modules/drizzle-orm'), join(WORK, 'bundle/node_modules/drizzle-orm'));

// 4. example-app fixtures: split (schema.ts + db.ts), mixed (one file), mixedQueries (one file + queries)
const QUERIES = `
import {eq as qEq, gt as qGt} from 'drizzle-orm';
export async function listAdults() { return db.select().from(usersDb).where(qGt(usersDb.age, 18)); }
export async function usersWithPosts() { return db.query.users.findMany({with: {posts: true}}); }
export async function joined() {
  return db.select({name: usersDb.name, title: postsDb.title}).from(usersDb).innerJoin(postsDb, qEq(usersDb.id, postsDb.authorId));
}
export async function busy() { return db.select().from(busyAuthorsDb); }
`;
const CLIENTS = {
  typeOnly: (m) => `import type {User, Post, NewUser} from './${m}';
export function label(u: User, p: Post): string { return u.name + ' ' + p.title + ' ' + u.age; }
export const draft: Partial<NewUser> = {name: 'a'};
`,
  valueImport: (m) => `import {users} from './${m}';
import type {User} from './${m}';
export const table = users;
export type Row = typeof users.$inferSelect;
export function label(u: User): string { return u.name; }
`,
};
const COMPILER_OPTIONS = {
  module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'],
  types: ['node'], typeRoots: [join(REPO, 'node_modules/@types')], allowImportingTsExtensions: true, rewriteRelativeImportExtensions: true,
  esModuleInterop: true, skipLibCheck: true, strict: true, noImplicitAny: false, target: ts.ScriptTarget.ES2023,
};
const fixtures = [];
for (const dialect of ['pg', 'mysql', 'sqlite'])
  for (const form of ['builders', 'types']) {
    const name = `${dialect}.${form}`;
    const dir = join(WORK, 'fx', name);
    mkdirSync(dir, {recursive: true});
    const schema = readFileSync(join(APP_DB, `${name}.ts`), 'utf8');
    const db = readFileSync(join(APP_DB, `${name}.db.ts`), 'utf8');
    const selfImport = new RegExp(`^import .* from '\\./${dialect}\\.${form}\\.ts';\\n`, 'gm');
    const mixed = `${schema}\n// ---- database side, same file ----\n${db.replace(selfImport, '')}`;
    writeFileSync(join(dir, 'fakeDriver.ts'), readFileSync(join(APP_DB, 'fakeDriver.ts'), 'utf8'));
    writeFileSync(join(dir, 'schema.ts'), schema);
    writeFileSync(join(dir, 'db.ts'), db.replaceAll(`./${name}.ts`, './schema.ts'));
    writeFileSync(join(dir, 'mixed.ts'), mixed);
    writeFileSync(join(dir, 'mixedQueries.ts'), mixed + QUERIES);
    // the same modules as compiled .d.ts, as a published package or built project reference would ship them
    const program = ts.createProgram(['schema.ts', 'mixed.ts', 'mixedQueries.ts'].map((f) => join(dir, f)), {
      ...COMPILER_OPTIONS, declaration: true, emitDeclarationOnly: true, outDir: join(dir, 'dts'), rootDir: dir,
    });
    if (program.emit().emitSkipped) throw new Error(`declaration emit failed for ${name}`);
    for (const [client, make] of Object.entries(CLIENTS))
      for (const [layout, mod] of [['split', 'schema.ts'], ['mixed', 'mixed.ts'], ['mixedQueries', 'mixedQueries.ts'],
        ['splitDts', 'dts/schema.ts'], ['mixedDts', 'dts/mixed.ts'], ['mixedQueriesDts', 'dts/mixedQueries.ts']])
        writeFileSync(join(dir, `client.${client}.${layout}.ts`), make(mod));
    fixtures.push(name);
  }
writeFileSync(join(WORK, 'fixtures.json'), JSON.stringify(fixtures));

// 5. scaling fixtures: N generated pg tables, one toDrizzle and one query per table
for (const n of [1, 10, 30, 60]) {
  const dir = join(WORK, 'scale', `n${n}`);
  mkdirSync(dir, {recursive: true});
  let schema = `import * as DZ from '@mionjs/drizzle-orm-pg-core';\n`;
  for (let i = 0; i < n; i++)
    schema += `export const t${i} = DZ.pgTable('t${i}', {
  id: DZ.uuid('id', {defaultRandom: true, primaryKey: true}),
  name: DZ.varchar('name', {length: 100, notNull: true}),
  age: DZ.integer('age', {notNull: true}),
  active: DZ.boolean('active', {notNull: true}),
  createdAt: DZ.timestamp('created_at', {defaultNow: true, notNull: true}),
});
export type T${i} = typeof t${i}.$inferSelect;\n`;
  let db = `import {drizzle} from 'drizzle-orm/pg-proxy';
import {eq} from 'drizzle-orm';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
const answer = async (_s: string, _p: unknown[], _m: string) => ({rows: [] as unknown[]});\n`;
  for (let i = 0; i < n; i++) db += `export const t${i}Db = toDrizzle(t${i});\n`;
  db += `export const schema = {${Array.from({length: n}, (_, i) => `t${i}: t${i}Db`).join(', ')}};\nexport const db = drizzle(answer, {schema});\n`;
  for (let i = 0; i < n; i++) db += `export const q${i} = () => db.select().from(t${i}Db).where(eq(t${i}Db.age, 1));\n`;
  writeFileSync(join(dir, 'schema.ts'), schema);
  writeFileSync(join(dir, 'mixed.ts'), schema + db);
  for (const [layout, mod] of [['split', 'schema.ts'], ['mixed', 'mixed.ts']])
    writeFileSync(join(dir, `client.${layout}.ts`), `import type {T0} from './${mod}';\nexport const label = (u: T0): string => u.name;\n`);
}

// 6. bundle fixtures: the pg builders value-import clients, resolved against the package sources
cpSync(join(WORK, 'fx/pg.builders'), join(WORK, 'bundle/pg.builders'), {recursive: true});
console.log(`ready: ${readdirSync(join(WORK, 'fx')).length} fixtures in ${WORK}`);
