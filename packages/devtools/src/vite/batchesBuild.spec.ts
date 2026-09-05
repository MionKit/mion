/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import {existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {build} from 'vite';
// vite 8 stopped re-exporting rollup's RollupOutput; derive it from build() itself so
// this cannot drift with the vite version again.
type RollupOutput = Extract<Awaited<ReturnType<typeof build>>, {output: unknown}>;
import {mionVitePlugin} from './mionVitePlugin.ts';
import {BIN, hasBinary, writeMarkerPackage} from '../../test/helpers/inline.ts';

// The batch transport through a REAL vite build over a REAL program: the resolver generates
// `<genDir>/rpc/` (the table plus the inline mapper modules, relative imports only) and appends the
// table's import to the router-init module, and rollup inlines all of it into a self-contained
// artifact. Nothing is configured on either side; client and server are one program here (the
// separate-project pair is proven by the Go tests and the end-to-end suite).
//
// `@mionjs/router` and `@mionjs/core` resolve to ambient declarations for the compiler (the
// factory's declaring module is what the router-init detector reads) and to runtime stubs for
// rollup, so the test needs no built framework packages.

const CLIENT_DTS = `declare module '@mionjs/client' {
  import type {PureFunction, InjectPureFnHash, InjectBatchId} from '@mionjs/run-types';
  export interface RouteSubRequest<PH> { id: string }
  export type ClientRoutes<RA> = { [K in keyof RA]: RA[K] extends (...a: infer P) => infer R ? (...p: P) => RouteSubRequest<RA[K]> : ClientRoutes<RA[K]> };
  export function initClient<RA>(o?: unknown): {client: unknown; routes: ClientRoutes<RA>};
  export interface InputFromRef<F> { asArg(): ReturnType<F> }
  export function inputFrom<S extends RouteSubRequest<any>, M = any>(source: S, name: string): InputFromRef<(v: any) => M>;
  export function inputFrom<S extends RouteSubRequest<any>, M = any>(source: S, mapper: PureFunction<(v: any) => M>, hash?: InjectPureFnHash<(v: any) => M>): InputFromRef<(v: any) => M>;
  export function batch<R extends RouteSubRequest<any>[]>(routes: [...R], batchId?: InjectBatchId<R>): unknown;
}
`;
const ROUTER_DTS = `declare module '@mionjs/router' {
  export function createMionRouter(opts?: unknown): {initRoutes: (routes: unknown) => unknown};
  export function replaceBatches(table: unknown): void;
}
declare module '@mionjs/core' {
  export function registerInputMapperTuple(key: string, tuple: unknown): void;
}
`;
const ROUTES = `import {initClient} from '@mionjs/client';
export type Routes = {
  users: {getById: (id: number) => {id: number; name: string}};
  orders: {getById: (id: number) => {id: number}};
};
export const {routes} = initClient<Routes>();
`;
const MAPPER_BODY = 'u.idFromClientCode';
const CLIENT = `import {batch, inputFrom} from '@mionjs/client';
import {routes} from './routes.ts';
const user = routes.users.getById(1);
export const b = batch([user, routes.orders.getById(inputFrom(user, (u: {idFromClientCode: number}) => ${MAPPER_BODY}))]);
`;
const SERVER = `import {createMionRouter} from '@mionjs/router';
export const mion = createMionRouter();
export const api = mion.initRoutes({});
`;
const ROUTER_STUB = `export const createMionRouter = () => ({initRoutes: () => ({})});
export const replaceBatches = (table) => { globalThis.__table = table; };
`;
const CORE_STUB = `export const registerInputMapperTuple = (key, tuple) => { (globalThis.__mappers ??= {})[key] = tuple; };
`;
const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "noEmit": true, "allowImportingTsExtensions": true
  },
  "include": ["src"]
}
`;

const register = hasBinary() ? describe : describe.skip;

register('batch transport through a real vite build', () => {
  let root: string;

  beforeEach(() => {
    // real path: vite resolves module ids through symlinks (macOS keeps tmp under /private), and
    // the transform gate compares them against the resolver's program paths
    root = realpathSync(mkdtempSync(path.join(tmpdir(), 'mion-batches-build-')));
    writeMarkerPackage(root);
    mkdirSync(path.join(root, 'src'), {recursive: true});
    writeFileSync(path.join(root, 'tsconfig.json'), TSCONFIG);
    writeFileSync(path.join(root, 'src', 'client.d.ts'), CLIENT_DTS);
    writeFileSync(path.join(root, 'src', 'router.d.ts'), ROUTER_DTS);
    writeFileSync(path.join(root, 'src', 'routes.ts'), ROUTES);
    writeFileSync(path.join(root, 'src', 'a.ts'), CLIENT);
    writeFileSync(path.join(root, 'src', 'server.ts'), SERVER);
    writeFileSync(path.join(root, 'router-stub.js'), ROUTER_STUB);
    writeFileSync(path.join(root, 'core-stub.js'), CORE_STUB);
  });
  afterEach(() => rmSync(root, {recursive: true, force: true}));

  /** Builds the fixture server through the real preset and returns the single emitted chunk. */
  async function buildServer(): Promise<string> {
    const result = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: mionVitePlugin({
        runTypes: {tsConfig: path.join(root, 'tsconfig.json'), binary: BIN, genDir: path.join(root, '.mion')},
      }),
      resolve: {alias: {'@mionjs/router': path.join(root, 'router-stub.js'), '@mionjs/core': path.join(root, 'core-stub.js')}},
      build: {
        write: false,
        minify: false,
        lib: {entry: path.join(root, 'src', 'server.ts'), formats: ['es'], fileName: 'server'},
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]) as RollupOutput[];
    const chunk = outputs.flatMap((out) => out.output ?? []).find((o) => o.type === 'chunk');
    if (!chunk || chunk.type !== 'chunk') throw new Error('no chunk emitted');
    return chunk.code;
  }

  it('generates the table and the mapper module under the gen dir, relative imports only', async () => {
    await buildServer();
    const rpc = path.join(root, '.mion', 'rpc');
    const table = readFileSync(path.join(rpc, 'batches.generated.js'), 'utf8');
    expect(table).toMatch(/^\/\/ GENERATED by mion/);
    expect(table).toMatch(/import \{__rt_pf\$2Frt\$2F[A-Za-z0-9_$]+\} from '\.\/pf\/rt\/[^']+\.js';/);
    expect(table).toContain('replaceBatches({');
    for (const [, specifier] of table.matchAll(/from '([^']+)'/g)) {
      expect(specifier.startsWith('./') || specifier.startsWith('@mionjs/'), specifier).toBe(true);
    }
    expect(table).not.toContain(root);
    const mappers = readdirSync(path.join(rpc, 'pf', 'rt'));
    expect(mappers).toHaveLength(1);
    expect(readFileSync(path.join(rpc, 'pf', 'rt', mappers[0]), 'utf8')).toContain(MAPPER_BODY);
  });

  it('inlines the table and the mapper into a self-contained artifact, with no option', async () => {
    const code = await buildServer();
    // the mapper body is in the artifact: rollup followed the relative import the table carries
    expect(code).toContain(MAPPER_BODY);
    expect(code).toContain('registerInputMapperTuple');
    expect(code).toContain('replaceBatches');
    expect(code).toMatch(/"b_[A-Za-z0-9_-]+"/);
    // the batch table rides as static data next to the mappers; nothing is read off disk at boot
    expect(code).not.toContain('node:fs');
    expect(code).not.toContain('readFileSync');
    // no path into any project in the CODE (rolldown's own `//#region` comments name the source
    // files, which is the bundler's business), and no leftover virtual specifier
    expect(code.replace(/^\/\/#(end)?region.*$/gm, '')).not.toContain(root);
    expect(code).not.toContain('rtrpc:');
    expect(code).not.toContain('rtmod:');
  });

  it('runs: the artifact registers the batch table and the mapper', async () => {
    const code = await buildServer();
    const runtime = `${root}/artifact.mjs`;
    writeFileSync(runtime, code);
    const globals = globalThis as {__table?: Record<string, unknown>; __mappers?: Record<string, unknown[]>};
    delete globals.__table;
    delete globals.__mappers;
    await import(runtime);
    expect(Object.keys(globals.__table ?? {})).toHaveLength(1);
    const registered: Record<string, unknown[]> = globals.__mappers ?? {};
    const [tuple] = Object.values(registered);
    expect(tuple).toBeDefined();
    // the registered value is the generated pure-fn tuple, key in its key slot
    expect(String(tuple[3])).toMatch(/^rt::/);
    expect(String(tuple[6])).toContain(MAPPER_BODY);
  });

  it('builds a server without batches when the program has none, and generates no rpc/', async () => {
    rmSync(path.join(root, 'src', 'a.ts'));
    const code = await buildServer();
    expect(code).not.toContain('replaceBatches');
    expect(existsSync(path.join(root, '.mion', 'rpc'))).toBe(false);
  });
});
