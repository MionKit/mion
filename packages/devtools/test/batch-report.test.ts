// Request-batch build report — the structured record of every `batch([...])`
// call the build read (ordered route ids, `inputFrom()` mappings, the injected
// batch id), for the server build that registers each plan under the id the
// client bundle carries. Like pure-fn-report.test.ts this drives the SHARED
// unplugin factory through the Rollup adapter (a universal hook, not a
// vite-only one) against a self-contained on-disk fixture, and asserts:
//   - onBatchReport fires once after buildStart with phase 'build', carrying
//     the route ids in call order, the inline-mapper link keyed `rt::<hash>`
//     and the named-mapper link keyed `mionjs::<name>`, and a `b_` id.
//   - the JSON report file round-trips under `pureFnReport: 'file'`.
//   - setting only the callback turns the report data on without a file.
//   - the transform splices the same id into the call site.
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import runtypesRollup from '../src/runtypes/rollup.ts';
import type {BatchSite} from '../src/core/protocol.ts';
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

// An ambient stand-in for the `@mionjs/client` surface the batches lane reads;
// the markers it forwards come from the real `@mionjs/run-types` package the
// fixture mounts, so the brand checks run against the shipped declarations.
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

const CONSUMER = `import {initClient, batch, inputFrom} from '@mionjs/client';
type Routes = {
  users: {getById: (id: number) => {id: number; name: string}};
  orders: {list: (userId: number) => string[]; getById: (id: number) => {id: number}};
};
const {routes} = initClient<Routes>();
const user = routes.users.getById(1);
export const b = batch([
  user,
  routes.orders.list(inputFrom(user, (u: {id: number}) => u.id).asArg()),
  routes.orders.getById(inputFrom(user, 'toUserId')),
]);
`;

const ctx = {
  error(message: string): never {
    throw new Error(message);
  },
  warn(): void {},
};

const callHook = (hook: any, thisArg: unknown, ...args: unknown[]): unknown =>
  typeof hook === 'function' ? hook.apply(thisArg, args) : hook.handler.apply(thisArg, args);

function makePlugin(extra: Record<string, unknown>) {
  return runtypesRollup({
    binary: BIN,
    cwd: FIXTURE_DIR,
    tsconfig: 'tsconfig.json',
    genDir: path.join(FIXTURE_DIR, '.mion'),
    ...extra,
  }) as any;
}

async function runBuildStart(plugin: any): Promise<void> {
  try {
    await callHook(plugin.buildStart, ctx);
  } finally {
    try {
      await callHook(plugin.buildEnd, ctx);
    } catch {
      // best-effort
    }
  }
}

describe('request-batch build report', () => {
  const register = hasBinary() ? it : it.skip;

  beforeEach(() => {
    FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-batch-report-'));
    fs.writeFileSync(path.join(FIXTURE_DIR, 'tsconfig.json'), TSCONFIG);
    writeMarkerPackage(FIXTURE_DIR);
    fs.writeFileSync(path.join(FIXTURE_DIR, 'client.d.ts'), CLIENT_DTS);
    fs.writeFileSync(path.join(FIXTURE_DIR, 'consumer.ts'), CONSUMER);
  });
  afterEach(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  register('onBatchReport fires on the rollup adapter with route ids, mappings and the id; JSON file round-trips', async () => {
    const calls: Array<{phase: string; sites: BatchSite[]}> = [];
    const plugin = makePlugin({
      pureFnReport: 'file',
      onBatchReport: (sites: BatchSite[], phase: 'build' | 'update') => calls.push({phase, sites}),
    });
    await runBuildStart(plugin);

    expect(calls.length, 'onBatchReport must fire on buildStart (universal hook)').toBe(1);
    expect(calls[0].phase).toBe('build');
    const sites = calls[0].sites;
    expect(sites.length, 'one batch() call site').toBe(1);
    const site = sites[0];
    expect(site.routeIds).toEqual(['users/getById', 'orders/list', 'orders/getById']);
    expect(site.batchId).toMatch(/^b_[A-Za-z0-9]+$/);
    expect(site.file.endsWith('consumer.ts')).toBe(true);
    expect(site.calleeName).toBe('batch');
    expect(site.calleeModule).toBe('@mionjs/client');

    // Mappings in canonical (toId, paramIndex) order: the inline mapper keyed by
    // the pure-fn lane's rt:: hash, the named one under the mionjs namespace.
    expect(site.mappings?.length).toBe(2);
    const byTo = new Map(site.mappings!.map((m) => [m.toId, m]));
    expect(byTo.get('orders/list')).toMatchObject({fromId: 'users/getById', paramIndex: 0});
    expect(byTo.get('orders/list')!.mapperKey).toMatch(/^rt::[A-Za-z0-9_-]+$/);
    expect(byTo.get('orders/getById')).toEqual({
      fromId: 'users/getById',
      toId: 'orders/getById',
      paramIndex: 0,
      mapperKey: 'mionjs::toUserId',
    });

    // JSON file round-trips, inside types/ like the pure-fn report.
    const typesDir = path.join(FIXTURE_DIR, '.mion', 'types');
    const reportPath = path.join(typesDir, 'batches-report.json');
    expect(fs.existsSync(reportPath), 'batches-report.json must be written under types/ on generate').toBe(true);
    const fromDisk = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as BatchSite[];
    expect(fromDisk.map((s) => s.batchId)).toEqual(sites.map((s) => s.batchId));
    expect(fs.readdirSync(typesDir)).not.toContain('batches-report.js');
  });

  register('the transform splices the reported id into the call site', async () => {
    let captured: BatchSite[] = [];
    const plugin = makePlugin({onBatchReport: (sites: BatchSite[]) => (captured = sites)});
    try {
      await callHook(plugin.buildStart, ctx);
      const consumerPath = path.join(FIXTURE_DIR, 'consumer.ts');
      const result = (await callHook(plugin.transform, ctx, CONSUMER, consumerPath)) as {code: string} | null;
      expect(result, 'the batch-only consumer must be transformed').not.toBeNull();
      expect(captured.length).toBe(1);
      expect(result!.code).toContain(`'${captured[0].batchId}'`);
      // The nested inline mapper keeps its own rt:: hash injection (the named
      // `mionjs::` link is a lookup key, never spliced into source).
      const inlineLink = captured[0].mappings!.find((m) => m.toId === 'orders/list')!;
      expect(inlineLink.mapperKey).toMatch(/^rt::/);
      expect(result!.code).toContain(`'${inlineLink.mapperKey}'`);
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort
      }
    }
  });

  register('report data flows to the callback even with no JSON file (callback-only)', async () => {
    let captured: BatchSite[] = [];
    const plugin = makePlugin({onBatchReport: (sites: BatchSite[]) => (captured = sites)});
    await runBuildStart(plugin);
    expect(captured.length, 'callback receives records without a file being requested').toBe(1);
    expect(fs.existsSync(path.join(FIXTURE_DIR, '.mion', 'types', 'batches-report.json'))).toBe(false);
    expect(fs.existsSync(path.join(FIXTURE_DIR, '.mion', 'types', 'pure-fns-report.json'))).toBe(false);
  });
});
