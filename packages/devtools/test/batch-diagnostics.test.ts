// Request-batch call-site reading, end to end through the build: every shape
// of `batch([...])` the build can read (the report carries the ordered route
// ids, the `inputFrom()` mappings and the injected `b_` id, and the transform
// splices that id into the call) and every shape it cannot (the build halts
// with a BAT00x diagnostic that names the file and the line of the offending
// element, and the report carries no site for that batch).
//
// Like batch-report.test.ts this drives the SHARED unplugin factory through
// the Rollup adapter against a self-contained on-disk fixture: an ambient
// `@mionjs/client` stand-in whose markers come from the real
// `@mionjs/run-types` package, an `api.ts` that calls `initClient<Api>()`, and
// one `case.ts` per scenario.
//
// Positions: the Go side reports `node.Pos()`, which INCLUDES leading trivia,
// so an element written on its own line is reported at the end of the line
// before it. Every fixture below keeps the offending element on the same line
// as the token before it, and one probe pins the multi-line posture explicitly.
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import runtypesRollup from '../src/runtypes/rollup.ts';
import type {BatchMapping, BatchSite} from '../src/core/protocol.ts';
import {BIN, hasBinary, writeMarkerPackage} from './helpers/inline.ts';

let FIXTURE_DIR = '';

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    skipLibCheck: true,
    types: [],
  },
  include: ['*.ts'],
});

// The same ambient `@mionjs/client` surface batch-report.test.ts declares.
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

// The route map plus the one client every case file imports its routes from.
const API = `import {initClient} from '@mionjs/client';
export type Api = {
  users: {
    getById: (id: number) => {id: number; name: string};
    list: () => {id: number}[];
  };
  orders: {
    list: (userId: number) => string[];
    getById: (id: number) => {id: number; userId: number};
    between: (from: number, to: number) => string[];
  };
  reports: {summary: (orderIds: string[]) => string};
};
export const {routes} = initClient<Api>();
`;

// Every case file starts with the client import; the route map comes from api.ts.
const IMPORTS = `import {initClient, batch, inputFrom, type RouteSubRequest} from '@mionjs/client';
import {routes, type Api} from './api';
`;

const BATCH_ID = /^b_[A-Za-z0-9_-]{14}$/;

const callHook = (hook: any, thisArg: unknown, ...args: unknown[]): unknown =>
  typeof hook === 'function' ? hook.apply(thisArg, args) : hook.handler.apply(thisArg, args);

interface BuildRun {
  // The last report the callback delivered, and the phases it fired with.
  sites: BatchSite[];
  phases: string[];
  // Every `ctx.warn` line (the formatted diagnostics) and the buildStart error, if any.
  warns: string[];
  error: Error | null;
  // Runs the transform hook over a fixture file; null when the file was left alone.
  transform: (file: string) => Promise<string | null>;
  // The shared incremental-update leaf (Vite's handleHotUpdate / the Next broker), if the adapter exposes it.
  hotUpdate: ((updates: {file: string; content?: string}[]) => Promise<void>) | undefined;
}

// withBuild writes the case files next to the shared fixture, runs buildStart
// under a capturing plugin context and hands the outcome to `fn` while the
// resolver is still alive (so the transform can run), then closes it.
async function withBuild(
  files: Record<string, string>,
  extra: Record<string, unknown>,
  fn: (run: BuildRun) => Promise<void>
): Promise<void> {
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(FIXTURE_DIR, name), content);
  const warns: string[] = [];
  const ctx = {
    warn: (message: unknown) => {
      warns.push(String(message));
    },
    error(message: unknown): never {
      throw new Error(String(message));
    },
  };
  const run: BuildRun = {
    sites: [],
    phases: [],
    warns,
    error: null,
    transform: async (file) => {
      const abs = path.join(FIXTURE_DIR, file);
      const result = (await callHook(plugin.transform, ctx, fs.readFileSync(abs, 'utf8'), abs)) as {code?: string} | null;
      return typeof result?.code === 'string' ? result.code : null;
    },
    hotUpdate: undefined,
  };
  const plugin = runtypesRollup({
    binary: BIN,
    cwd: FIXTURE_DIR,
    tsconfig: 'tsconfig.json',
    genDir: path.join(FIXTURE_DIR, '.mion'),
    onBatchReport: (sites: BatchSite[], phase: 'build' | 'update') => {
      run.sites = sites;
      run.phases.push(phase);
    },
    ...extra,
  }) as any;
  if (typeof plugin.rtHotUpdate === 'function') run.hotUpdate = (updates) => plugin.rtHotUpdate(ctx, updates);
  try {
    try {
      await callHook(plugin.buildStart, ctx);
    } catch (error) {
      run.error = error as Error;
    }
    await fn(run);
  } finally {
    try {
      await callHook(plugin.buildEnd, ctx);
    } catch {
      // best-effort
    }
  }
}

// lineOf returns the 1-based line of the first occurrence of `needle`.
function lineOf(source: string, needle: string): number {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`fixture does not contain ${JSON.stringify(needle)}`);
  return source.slice(0, index).split('\n').length;
}

// A site's file always ends with the fixture-relative name; the diagnostics
// name the same file in tsc's `<path>(<line>,<col>)` format.
const fileTail = (file: string): string => `${path.basename(FIXTURE_DIR)}/${file}`;

// expectClean asserts a build that read every batch: no error, no BAT
// diagnostic, and returns the sites reported for `file` in source order.
function expectClean(run: BuildRun, file: string, count = 1): BatchSite[] {
  expect(run.error, `build must not halt:\n${run.warns.join('\n')}`).toBeNull();
  expect(
    run.warns.filter((w) => /\bBAT\d{3}\b/.test(w)),
    'no BAT diagnostic expected'
  ).toEqual([]);
  expect(run.phases).toEqual(['build']);
  const sites = run.sites.filter((s) => s.file.endsWith(file));
  expect(sites.length, `${count} batch site(s) in ${file}, got ${JSON.stringify(run.sites)}`).toBe(count);
  for (const site of sites) {
    expect(site.batchId).toMatch(BATCH_ID);
    expect(site.calleeName).toBe('batch');
    expect(site.calleeModule).toBe('@mionjs/client');
  }
  return sites;
}

// expectInjected asserts the transform spliced every reported id of `file`
// into its call site, once per site, as the trailing argument.
async function expectInjected(run: BuildRun, file: string, sites: BatchSite[]): Promise<string> {
  const code = await run.transform(file);
  expect(code, `${file} must be transformed`).not.toBeNull();
  for (const site of sites) {
    const occurrences = code!.split(`'${site.batchId}'`).length - 1;
    const expected = sites.filter((s) => s.batchId === site.batchId).length;
    expect(occurrences, `${site.batchId} spliced ${expected}x into ${file}:\n${code}`).toBe(expected);
    // The id lands as the argument AFTER the routes array, not somewhere else.
    expect(code, `id follows the routes array:\n${code}`).toMatch(new RegExp(`\\][^\\]]*?,\\s*'${site.batchId}'\\)`));
  }
  return code!;
}

// expectHalted asserts the build stopped on `code` reported at `file`, on the
// line of `needle`, with the report carrying no site for that file. `reason`
// (when given) must appear rendered in the headline (never a raw `{0}`).
function expectHalted(
  run: BuildRun,
  code: string,
  file: string,
  source: string,
  needle: string,
  reason?: string | RegExp
): string {
  expect(run.error, `build must halt on ${code}:\n${run.warns.join('\n')}`).not.toBeNull();
  expect(run.error!.message).toMatch(/build halted/);
  const hits = run.warns.filter((w) => w.includes(`error ${code}:`));
  expect(hits.length, `exactly one ${code}, got:\n${run.warns.join('\n')}`).toBe(1);
  const hit = hits[0];
  expect(hit).toContain(`${fileTail(file)}(${lineOf(source, needle)},`);
  expect(hit).not.toContain('{0}');
  if (typeof reason === 'string') expect(hit).toContain(reason);
  else if (reason) expect(hit).toMatch(reason);
  expect(run.phases).toEqual(['build']);
  expect(
    run.sites.filter((s) => s.file.endsWith(file)),
    'a rejected batch yields no site'
  ).toEqual([]);
  return hit;
}

const mapping = (fromId: string, toId: string, paramIndex: number, mapperKey: string | RegExp): BatchMapping =>
  ({
    fromId,
    toId,
    paramIndex,
    mapperKey: typeof mapperKey === 'string' ? mapperKey : expect.stringMatching(mapperKey),
  }) as BatchMapping;
const INLINE_KEY = /^rt::[A-Za-z0-9_-]+$/;

describe('request-batch diagnostics and readable shapes', () => {
  const register = hasBinary() ? it : it.skip;

  beforeEach(() => {
    FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-batch-diag-'));
    fs.writeFileSync(path.join(FIXTURE_DIR, 'tsconfig.json'), TSCONFIG);
    writeMarkerPackage(FIXTURE_DIR);
    fs.writeFileSync(path.join(FIXTURE_DIR, 'client.d.ts'), CLIENT_DTS);
    fs.writeFileSync(path.join(FIXTURE_DIR, 'api.ts'), API);
  });
  afterEach(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  describe('readable batches: reported and injected', () => {
    // Every entry: the case body (after IMPORTS) and the route ids it must report.
    const legit: Record<string, {body: string; routeIds: string[]}> = {
      'inline route calls (routes imported from api.ts)': {
        body: `export const b = batch([routes.users.getById(1), routes.orders.list(1)]);\n`,
        routeIds: ['users/getById', 'orders/list'],
      },
      'const-bound route calls': {
        body: `const user = routes.users.getById(1);\nconst orders = routes.orders.list(1);\nexport const b = batch([user, orders]);\n`,
        routeIds: ['users/getById', 'orders/list'],
      },
      'let with a route-call initializer': {
        body: `let user = routes.users.getById(1);\nexport const b = batch([user, routes.orders.list(1)]);\n`,
        routeIds: ['users/getById', 'orders/list'],
      },
      'locally destructured routes': {
        body: `const {routes: local} = initClient<Api>();\nexport const b = batch([local.users.getById(1)]);\n`,
        routeIds: ['users/getById'],
      },
      'renamed destructuring': {
        body: `const {routes: r} = initClient<Api>();\nexport const b = batch([r.users.getById(1), r.orders.getById(2)]);\n`,
        routeIds: ['users/getById', 'orders/getById'],
      },
      'client.routes on the whole client object': {
        body: `const client = initClient<Api>();\nexport const b = batch([client.routes.users.getById(1), client.routes.orders.list(1)]);\n`,
        routeIds: ['users/getById', 'orders/list'],
      },
      'sub-proxy bound to a const': {
        body: `const users = routes.users;\nconst orders = routes.orders;\nexport const b = batch([users.getById(1), orders.list(1)]);\n`,
        routeIds: ['users/getById', 'orders/list'],
      },
      'element access with a string literal': {
        body: `export const b = batch([routes['users'].getById(1), routes.orders['list'](1)]);\n`,
        routeIds: ['users/getById', 'orders/list'],
      },
      'nested destructuring of the routes proxy': {
        body: `const {routes: {users}} = initClient<Api>();\nexport const b = batch([users.getById(1)]);\n`,
        routeIds: ['users/getById'],
      },
      'inside an async function, route arguments from its parameters': {
        body: `export async function load(id: number, userId: number) {\n  const user = routes.users.getById(id);\n  return batch([user, routes.orders.list(userId)]);\n}\n`,
        routeIds: ['users/getById', 'orders/list'],
      },
      'parenthesised and `as`-wrapped elements': {
        body: `const user = routes.users.getById(1);\nexport const b = batch([(user), routes.orders.list(1) as RouteSubRequest<any>]);\n`,
        routeIds: ['users/getById', 'orders/list'],
      },
      'non-null-asserted and `satisfies`-wrapped elements': {
        body: `const user = routes.users.getById(1);\nexport const b = batch([user!, routes.orders.list(1) satisfies RouteSubRequest<any>]);\n`,
        routeIds: ['users/getById', 'orders/list'],
      },
    };
    for (const [name, {body, routeIds}] of Object.entries(legit)) {
      register(name, async () => {
        const source = IMPORTS + body;
        await withBuild({'case.ts': source}, {}, async (run) => {
          const [site] = expectClean(run, 'case.ts');
          expect(site.routeIds).toEqual(routeIds);
          expect(site.mappings ?? []).toEqual([]);
          await expectInjected(run, 'case.ts', [site]);
        });
      });
    }

    register('routes reached through a namespace import of api.ts', async () => {
      const source = `import {batch} from '@mionjs/client';\nimport * as api from './api';\nexport const b = batch([api.routes.users.getById(1), api.routes.orders.list(1)]);\n`;
      await withBuild({'case.ts': source}, {}, async (run) => {
        const [site] = expectClean(run, 'case.ts');
        expect(site.routeIds).toEqual(['users/getById', 'orders/list']);
        await expectInjected(run, 'case.ts', [site]);
      });
    });

    register('the same batch shape gives the same id whether inline or bound, and order changes it', async () => {
      const files = {
        'inline.ts': IMPORTS + `export const b = batch([routes.users.getById(1), routes.orders.list(1)]);\n`,
        'bound.ts':
          IMPORTS +
          `const user = routes.users.getById(7);\nlet orders = routes.orders.list(9);\nexport const b = batch([user, orders]);\n`,
        'reversed.ts': IMPORTS + `export const b = batch([routes.orders.list(1), routes.users.getById(1)]);\n`,
      };
      await withBuild(files, {}, async (run) => {
        const [inline] = expectClean(run, 'inline.ts');
        const [bound] = expectClean(run, 'bound.ts');
        const [reversed] = expectClean(run, 'reversed.ts');
        expect(bound.batchId).toBe(inline.batchId);
        expect(reversed.batchId).not.toBe(inline.batchId);
      });
    });
  });

  describe('readable mappings', () => {
    const PRELUDE = IMPORTS + `const user = routes.users.getById(1);\n`;
    const mapped: Record<string, {body: string; mapperKey: string | RegExp}> = {
      'inline mapper with .asArg()': {
        body: `export const b = batch([user, routes.orders.list(inputFrom(user, (u: {id: number}) => u.id).asArg())]);\n`,
        mapperKey: INLINE_KEY,
      },
      'inline mapper passed bare': {
        body: `export const b = batch([user, routes.orders.list(inputFrom(user, (u: {id: number}) => u.id))]);\n`,
        mapperKey: INLINE_KEY,
      },
      'inline mapper bound to a const': {
        body: `const ref = inputFrom(user, (u: {id: number}) => u.id);\nexport const b = batch([user, routes.orders.list(ref)]);\n`,
        mapperKey: INLINE_KEY,
      },
      'inline mapper .asArg() bound to a const': {
        body: `const ref = inputFrom(user, (u: {id: number}) => u.id).asArg();\nexport const b = batch([user, routes.orders.list(ref)]);\n`,
        mapperKey: INLINE_KEY,
      },
      'name lane with a string literal': {
        body: `export const b = batch([user, routes.orders.list(inputFrom(user, 'toUserId'))]);\n`,
        mapperKey: 'mionjs::toUserId',
      },
      'name lane with .asArg()': {
        body: `export const b = batch([user, routes.orders.list(inputFrom(user, 'toUserId').asArg())]);\n`,
        mapperKey: 'mionjs::toUserId',
      },
      'name lane through a const name': {
        body: `const name = 'toUserId';\nexport const b = batch([user, routes.orders.list(inputFrom(user, name))]);\n`,
        mapperKey: 'mionjs::toUserId',
      },
    };
    for (const [name, {body, mapperKey}] of Object.entries(mapped)) {
      register(name, async () => {
        const source = PRELUDE + body;
        await withBuild({'case.ts': source}, {}, async (run) => {
          const [site] = expectClean(run, 'case.ts');
          expect(site.routeIds).toEqual(['users/getById', 'orders/list']);
          expect(site.mappings).toEqual([mapping('users/getById', 'orders/list', 0, mapperKey)]);
          const code = await expectInjected(run, 'case.ts', [site]);
          // An inline mapper keeps its own rt:: hash injection at the inputFrom call.
          if (mapperKey === INLINE_KEY) expect(code).toContain(`'${site.mappings![0].mapperKey}'`);
          else expect(code).not.toContain(`'${mapperKey}'`);
        });
      });
    }

    register('two mappings into one route (both parameters)', async () => {
      const source =
        PRELUDE +
        `const order = routes.orders.getById(2);\n` +
        `export const b = batch([user, order, routes.orders.between(inputFrom(user, 'lo'), inputFrom(order, (o: {id: number}) => o.id).asArg())]);\n`;
      await withBuild({'case.ts': source}, {}, async (run) => {
        const [site] = expectClean(run, 'case.ts');
        expect(site.routeIds).toEqual(['users/getById', 'orders/getById', 'orders/between']);
        expect(site.mappings).toEqual([
          mapping('users/getById', 'orders/between', 0, 'mionjs::lo'),
          mapping('orders/getById', 'orders/between', 1, INLINE_KEY),
        ]);
        await expectInjected(run, 'case.ts', [site]);
      });
    });

    register('a chain of three routes, each fed by the one before', async () => {
      const source =
        PRELUDE +
        `const orders = routes.orders.list(inputFrom(user, 'toUserId'));\n` +
        `export const b = batch([user, orders, routes.reports.summary(inputFrom(orders, (ids: string[]) => ids).asArg())]);\n`;
      await withBuild({'case.ts': source}, {}, async (run) => {
        const [site] = expectClean(run, 'case.ts');
        expect(site.routeIds).toEqual(['users/getById', 'orders/list', 'reports/summary']);
        // Canonical (toId, paramIndex) order: orders/list sorts before reports/summary.
        expect(site.mappings).toEqual([
          mapping('users/getById', 'orders/list', 0, 'mionjs::toUserId'),
          mapping('orders/list', 'reports/summary', 0, INLINE_KEY),
        ]);
        await expectInjected(run, 'case.ts', [site]);
      });
    });

    register('a plain argument next to a mapping is not a mapping', async () => {
      const source =
        PRELUDE + `const id = 7;\nexport const b = batch([user, routes.orders.between(id, inputFrom(user, 'hi'))]);\n`;
      await withBuild({'case.ts': source}, {}, async (run) => {
        const [site] = expectClean(run, 'case.ts');
        expect(site.mappings).toEqual([mapping('users/getById', 'orders/between', 1, 'mionjs::hi')]);
      });
    });

    register('the same batch in two files: one id, one report entry per file, no BAT003', async () => {
      const body = `const user = routes.users.getById(1);\nexport const b = batch([user, routes.orders.list(inputFrom(user, 'toUserId'))]);\n`;
      await withBuild({'one.ts': IMPORTS + body, 'two.ts': IMPORTS + body}, {}, async (run) => {
        const [one] = expectClean(run, 'one.ts');
        const [two] = expectClean(run, 'two.ts');
        expect(run.sites.length, 'one entry per call site').toBe(2);
        expect(two.batchId).toBe(one.batchId);
        expect(two.routeIds).toEqual(one.routeIds);
        expect(two.mappings).toEqual(one.mappings);
        await expectInjected(run, 'one.ts', [one]);
        await expectInjected(run, 'two.ts', [two]);
      });
    });

    register('same routes, different mappings: two batches with two ids', async () => {
      const source =
        PRELUDE +
        `export const byName = batch([user, routes.orders.list(inputFrom(user, 'toUserId'))]);\n` +
        `export const byFn = batch([user, routes.orders.list(inputFrom(user, (u: {id: number}) => u.id).asArg())]);\n` +
        `export const plain = batch([user, routes.orders.list(1)]);\n`;
      await withBuild({'case.ts': source}, {}, async (run) => {
        const sites = expectClean(run, 'case.ts', 3);
        const ids = new Set(sites.map((s) => s.batchId));
        expect(ids.size, 'three distinct ids').toBe(3);
        for (const site of sites) expect(site.routeIds).toEqual(['users/getById', 'orders/list']);
        expect(sites[0].mappings![0].mapperKey).toBe('mionjs::toUserId');
        expect(sites[1].mappings![0].mapperKey).toMatch(INLINE_KEY);
        expect(sites[2].mappings ?? []).toEqual([]);
        await expectInjected(run, 'case.ts', sites);
      });
    });
  });

  describe('BAT001: element not readable', () => {
    // Every entry: the case body, the substring that starts the offending
    // element (its line is asserted), and the reason the headline must render.
    const rejected: Record<string, {body: string; needle: string; reason?: string | RegExp}> = {
      'spread element': {
        body: `const prepared = [routes.users.getById(1)];\nexport const b = batch([...prepared, routes.orders.list(1)]);\n`,
        needle: '...prepared',
        reason: 'spread element',
      },
      'routes array held in a variable': {
        body: `const list = [routes.users.getById(1)];\nexport const b = batch(list);\n`,
        needle: 'list);',
        reason: 'not an inline array literal',
      },
      'routes array built by .map': {
        body: `const ids = [1, 2];\nexport const b = batch(ids.map((id) => routes.users.getById(id)));\n`,
        needle: 'ids.map',
        reason: 'not an inline array literal',
      },
      'ternary element': {
        body: `declare const flag: boolean;\nexport const b = batch([flag ? routes.users.getById(1) : routes.users.getById(2)]);\n`,
        needle: 'flag ?',
        reason: 'not a route call',
      },
      'helper call returning a route sub-request': {
        body: `function makeUser(id: number) { return routes.users.getById(id); }\nexport const b = batch([makeUser(1), routes.orders.list(1)]);\n`,
        needle: 'makeUser(1)',
      },
      'element taken out of a .map result': {
        body: `export const b = batch([[1, 2].map((id) => routes.users.getById(id))[0]]);\n`,
        needle: '[1, 2].map',
        reason: 'not a route call',
      },
      'let assigned after its declaration': {
        body: `let user: RouteSubRequest<any>;\nuser = routes.users.getById(1);\nexport const b = batch([user, routes.orders.list(1)]);\n`,
        needle: 'user, routes.orders',
        reason: /binding is not a const\/let|reassigned/,
      },
      'let reassigned after its route-call initializer': {
        // The initializer is not what the batch sees at runtime.
        body: `let user = routes.users.getById(1);\nuser = routes.users.getById(2);\nexport const b = batch([user, routes.orders.list(1)]);\n`,
        needle: 'user, routes.orders',
        reason: /reassigned|binding is not a const\/let/,
      },
      'object property': {
        body: `const holder = {user: routes.users.getById(1)};\nexport const b = batch([holder.user]);\n`,
        needle: 'holder.user]',
        reason: 'not a route call',
      },
      'routes from a function parameter': {
        body: `export function load(api: typeof routes) { return batch([api.users.getById(1)]); }\n`,
        needle: 'api.users.getById(1)',
        reason: 'not the client routes proxy',
      },
      'this.routes inside a class': {
        body: `export class Loader {\n  routes = routes;\n  load() { return batch([this.routes.users.getById(1)]); }\n}\n`,
        needle: 'this.routes.users',
        reason: /not a route call|does not start at an identifier/,
      },
      'computed member with a const key': {
        body: `const key = 'users';\nexport const b = batch([routes[key].getById(1)]);\n`,
        needle: 'routes[key]',
        reason: /not a route call|computed member/,
      },
      'a same-shaped object that is not the client': {
        body: `const fake = {routes: {users: {getById: (id: number): RouteSubRequest<any> => ({id: String(id)})}}};\nexport const b = batch([fake.routes.users.getById(1)]);\n`,
        needle: 'fake.routes.users.getById(1)',
        reason: 'not the client routes proxy',
      },
      'var binding': {
        body: `var user = routes.users.getById(1);\nexport const b = batch([user]);\n`,
        needle: 'user]);',
        reason: 'binding is not a const/let',
      },
    };
    for (const [name, {body, needle, reason}] of Object.entries(rejected)) {
      register(name, async () => {
        const source = IMPORTS + body;
        await withBuild({'case.ts': source}, {}, async (run) => {
          expectHalted(run, 'BAT001', 'case.ts', source, needle, reason);
        });
      });
    }

    register('optional chaining on the routes proxy', async () => {
      const source = IMPORTS + `export const b = batch([routes.users?.getById(1), routes.orders.list(1)]);\n`;
      await withBuild({'case.ts': source}, {}, async (run) => {
        expectHalted(run, 'BAT001', 'case.ts', source, 'routes.users?.getById(1)', /optional chaining|not a route call/);
      });
    });

    register('one BAT001 per unreadable element, all reported before the halt', async () => {
      const source =
        IMPORTS +
        `const prepared = [routes.users.getById(1)];\ndeclare const flag: boolean;\nexport const b = batch([...prepared, flag ? routes.users.getById(1) : routes.users.getById(2), routes.orders.list(1)]);\n`;
      await withBuild({'case.ts': source}, {}, async (run) => {
        expect(run.error).not.toBeNull();
        expect(run.error!.message).toMatch(/2 unsupported-type errors/);
        const hits = run.warns.filter((w) => w.includes('error BAT001:'));
        expect(hits.length).toBe(2);
        expect(hits[0]).toContain('spread element');
        expect(hits[1]).toContain('not a route call');
        expect(run.sites).toEqual([]);
      });
    });

    register('an element on its own line is reported at the line before it (trivia-inclusive position)', async () => {
      // Pins the position the build reports for a multi-line call: `node.Pos()`
      // starts at the leading trivia, so the newline after the `,` counts.
      const source =
        IMPORTS +
        `const prepared = [routes.users.getById(1)];\nexport const b = batch([\n  routes.orders.list(1),\n  ...prepared,\n]);\n`;
      await withBuild({'case.ts': source}, {}, async (run) => {
        expect(run.error).not.toBeNull();
        const hit = run.warns.find((w) => w.includes('error BAT001:'))!;
        expect(hit).toBeDefined();
        const spreadLine = lineOf(source, '...prepared');
        expect(hit).toContain(`${fileTail('case.ts')}(${spreadLine - 1},`);
      });
    });
  });

  describe('BAT002: mapping source not in the batch or after its target', () => {
    const PRELUDE = IMPORTS + `const user = routes.users.getById(1);\n`;

    register('source route is not an element of the batch', async () => {
      const source =
        PRELUDE + `export const b = batch([routes.orders.getById(2), routes.orders.list(inputFrom(user, 'toUserId'))]);\n`;
      await withBuild({'case.ts': source}, {}, async (run) => {
        const hit = expectHalted(run, 'BAT002', 'case.ts', source, "inputFrom(user, 'toUserId')");
        expect(hit).toContain('`users/getById`');
        expect(hit).toContain('`orders/list`');
      });
    });

    register('source route listed after the route it feeds', async () => {
      const source = PRELUDE + `export const b = batch([routes.orders.list(inputFrom(user, 'toUserId')), user]);\n`;
      await withBuild({'case.ts': source}, {}, async (run) => {
        const hit = expectHalted(run, 'BAT002', 'case.ts', source, "inputFrom(user, 'toUserId')");
        expect(hit).toContain('`users/getById`');
        expect(hit).toContain('`orders/list`');
      });
    });

    register('a route feeding itself', async () => {
      const source =
        PRELUDE + `export const b = batch([user, routes.orders.list(inputFrom(routes.orders.list(1), 'toUserId'))]);\n`;
      await withBuild({'case.ts': source}, {}, async (run) => {
        expectHalted(run, 'BAT002', 'case.ts', source, 'inputFrom(routes.orders.list(1)');
      });
    });
  });

  describe('BAT004: mapper not readable', () => {
    const PRELUDE = IMPORTS + `const user = routes.users.getById(1);\n`;

    register('mapper passed as an identifier', async () => {
      const source =
        PRELUDE +
        `const pickId = (u: {id: number}) => u.id;\nexport const b = batch([user, routes.orders.list(inputFrom(user, pickId))]);\n`;
      await withBuild({'case.ts': source}, {}, async (run) => {
        expectHalted(run, 'BAT004', 'case.ts', source, 'pickId))');
      });
    });

    register('mapper name from a function parameter', async () => {
      const source =
        PRELUDE + `export function load(name: string) { return batch([user, routes.orders.list(inputFrom(user, name))]); }\n`;
      await withBuild({'case.ts': source}, {}, async (run) => {
        expectHalted(run, 'BAT004', 'case.ts', source, 'name))]');
      });
    });

    register('mapper name computed from a template literal', async () => {
      const source =
        PRELUDE +
        'const suffix = "UserId";\nexport const b = batch([user, routes.orders.list(inputFrom(user, `to${suffix}`))]);\n';
      await withBuild({'case.ts': source}, {}, async (run) => {
        expectHalted(run, 'BAT004', 'case.ts', source, '`to${suffix}`');
      });
    });

    register('mapping source that is not a readable route (a parameter)', async () => {
      const source =
        IMPORTS +
        `export function load(u: RouteSubRequest<any>) { return batch([routes.users.getById(1), routes.orders.list(inputFrom(u, 'toUserId'))]); }\n`;
      await withBuild({'case.ts': source}, {}, async (run) => {
        const hit = expectHalted(run, 'BAT004', 'case.ts', source, "u, 'toUserId'");
        expect(hit).toContain('source is not a route call');
      });
    });
  });

  describe('BAT005 duplicate route / BAT006 mapping index', () => {
    register('BAT005: the same route twice in one batch', async () => {
      const source = IMPORTS + `export const b = batch([routes.users.getById(1), routes.users.getById(2)]);\n`;
      await withBuild({'case.ts': source}, {}, async (run) => {
        expectHalted(run, 'BAT005', 'case.ts', source, 'routes.users.getById(2)');
      });
    });

    register('BAT006: a mapping at a parameter index the route does not declare', async () => {
      const source =
        IMPORTS +
        `const user = routes.users.getById(1);\nexport const b = batch([user, routes.users.list(inputFrom(user, 'toUserId'))]);\n`;
      await withBuild({'case.ts': source}, {}, async (run) => {
        expectHalted(run, 'BAT006', 'case.ts', source, "inputFrom(user, 'toUserId')");
      });
    });
  });

  describe('failOnError: false', () => {
    register('the build goes on, the report lacks the unreadable batch, and its call gets no id', async () => {
      const bad =
        IMPORTS + `const prepared = [routes.users.getById(1)];\nexport const b = batch([...prepared, routes.orders.list(1)]);\n`;
      const good = IMPORTS + `export const b = batch([routes.users.getById(1)]);\n`;
      await withBuild({'bad.ts': bad, 'good.ts': good}, {failOnError: false}, async (run) => {
        expect(run.error, 'a BAT001 must not halt under failOnError: false').toBeNull();
        const hits = run.warns.filter((w) => w.includes('error BAT001:'));
        expect(hits.length, 'the diagnostic still surfaces as a warning').toBe(1);
        expect(hits[0]).toContain(`${fileTail('bad.ts')}(${lineOf(bad, '...prepared')},`);
        expect(run.sites.map((s) => path.basename(s.file))).toEqual(['good.ts']);
        const [goodSite] = expectClean({...run, warns: []}, 'good.ts');
        await expectInjected(run, 'good.ts', [goodSite]);
        const badCode = await run.transform('bad.ts');
        expect(badCode === null || !badCode.includes("'b_"), `the unreadable batch must ship without an id:\n${badCode}`).toBe(
          true
        );
      });
    });
  });

  describe("'update' phase", () => {
    register('an edit re-reports the changed file with its new routes and id', async () => {
      const before = IMPORTS + `export const b = batch([routes.users.getById(1)]);\n`;
      const after = IMPORTS + `export const b = batch([routes.users.getById(1), routes.orders.list(1)]);\n`;
      await withBuild({'case.ts': before}, {}, async (run) => {
        const [initial] = expectClean(run, 'case.ts');
        expect(initial.routeIds).toEqual(['users/getById']);
        // The Rollup adapter carries the shared leaf as the non-hook `rtHotUpdate`
        // member; a host with no HMR hook of its own (the Next broker) calls it
        // the same way. If a future adapter strips it, this pins the loss.
        expect(run.hotUpdate, 'the adapter must expose rtHotUpdate').toBeDefined();
        const abs = path.join(FIXTURE_DIR, 'case.ts');
        fs.writeFileSync(abs, after);
        await run.hotUpdate!([{file: abs, content: after}]);
        expect(run.phases).toEqual(['build', 'update']);
        const updated = run.sites.filter((s) => s.file.endsWith('case.ts'));
        expect(updated.length).toBe(1);
        expect(updated[0].routeIds).toEqual(['users/getById', 'orders/list']);
        expect(updated[0].batchId).toMatch(BATCH_ID);
        expect(updated[0].batchId).not.toBe(initial.batchId);
      });
    });

    // PINNED GAP (src/core/unplugin.ts, not the extractor): applyHotUpdate
    // rebuilds the transform gate from `scanFiles().sites` (runtype marker
    // sites) only, so a file whose only marker sites are `batch()` calls drops
    // out of `siteFiles` on its first edit; the textual fallback then skips it
    // too (it imports `@mionjs/client`, never `@mionjs/run-types`), and the
    // edited call ships WITHOUT its id. Flip to `register` when the gate
    // counts batch sites (`batchSites`) as well.
    register('an edited batch-only file still transforms with its new id', async () => {
      const before = IMPORTS + `export const b = batch([routes.users.getById(1)]);\n`;
      const after = IMPORTS + `export const b = batch([routes.users.getById(1), routes.orders.list(1)]);\n`;
      await withBuild({'case.ts': before}, {}, async (run) => {
        const [initial] = expectClean(run, 'case.ts');
        await expectInjected(run, 'case.ts', [initial]);
        const abs = path.join(FIXTURE_DIR, 'case.ts');
        fs.writeFileSync(abs, after);
        await run.hotUpdate!([{file: abs, content: after}]);
        const updated = run.sites.filter((s) => s.file.endsWith('case.ts'));
        expect(updated.length).toBe(1);
        await expectInjected(run, 'case.ts', updated);
      });
    });

    register('an edit that breaks a batch warns without tearing the build down', async () => {
      const before = IMPORTS + `export const b = batch([routes.users.getById(1)]);\n`;
      const after = IMPORTS + `const prepared = [routes.users.getById(1)];\nexport const b = batch([...prepared]);\n`;
      await withBuild({'case.ts': before}, {}, async (run) => {
        expectClean(run, 'case.ts');
        const abs = path.join(FIXTURE_DIR, 'case.ts');
        fs.writeFileSync(abs, after);
        await run.hotUpdate!([{file: abs, content: after}]);
        expect(run.error).toBeNull();
        const hits = run.warns.filter((w) => w.includes('error BAT001:'));
        expect(hits.length).toBe(1);
        expect(hits[0]).toContain(`${fileTail('case.ts')}(${lineOf(after, '...prepared')},`);
      });
    });

    // PINNED GAP (src/core/unplugin.ts, not the extractor): the update lane
    // fires onBatchReport only when `result.batchSites` is present, and the
    // wire omits an empty list, so an edit that removes (or breaks) the last
    // batch of a file never reaches the consumer: it keeps the stale plan.
    // Flip to `register` when the update lane reports an empty list too.
    register('an edit that breaks the only batch re-reports it as gone', async () => {
      const before = IMPORTS + `export const b = batch([routes.users.getById(1)]);\n`;
      const after = IMPORTS + `const prepared = [routes.users.getById(1)];\nexport const b = batch([...prepared]);\n`;
      await withBuild({'case.ts': before}, {}, async (run) => {
        expectClean(run, 'case.ts');
        const abs = path.join(FIXTURE_DIR, 'case.ts');
        fs.writeFileSync(abs, after);
        await run.hotUpdate!([{file: abs, content: after}]);
        expect(run.phases).toEqual(['build', 'update']);
        expect(run.sites.filter((s) => s.file.endsWith('case.ts'))).toEqual([]);
      });
    });
  });
});
