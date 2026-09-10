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
type RollupOutput = Extract<Awaited<ReturnType<typeof build>>, {output: unknown}>;
import {mionVitePlugin} from './mionVitePlugin.ts';
import {BIN, hasBinary, writeMarkerPackage} from '../../test/helpers/inline.ts';

// The bundled-API lane through a REAL vite build over a REAL program: with `bundleApi` on, the
// resolver writes `<genDir>/api/` (one module per route or middleFn the program calls, the site
// modules, the manifest), the transform injects the lane at initClient and each site's module at
// its dispatch call, and rollup inlines it all into a self-contained artifact that carries live
// functions and no code string, so it runs where dynamic code is forbidden.
//
// `@mionjs/client` resolves to an ambient declaration for the compiler (the dispatch methods carry
// the real marker) and to a runtime stub for rollup that records what the build injected, so the
// test needs no built framework package.

const CLIENT_DTS = `declare module '@mionjs/client' {
  import type {InjectApiMetadata} from '@mionjs/run-types';
  export interface RouteSubRequest<PH, Id extends string = string, RA = any> {
    id: Id;
    call(setup?: unknown, apiMetadata?: InjectApiMetadata<RA, Id>): Promise<unknown>;
  }
  export interface MiddlewareSubRequest<PH, Id extends string = string, RA = any> {
    id: Id;
    prefill(apiMetadata?: InjectApiMetadata<RA, Id>): unknown;
  }
  type Handler = (...args: any[]) => any;
  export type ClientRoutes<RA, Prefix extends string = '', Root = RA> = {
    [K in keyof RA as RA[K] extends {type: 1} ? K : RA[K] extends {type: number} ? never : K]: RA[K] extends {type: 1; handler: infer H extends Handler}
      ? (...params: Parameters<H>) => RouteSubRequest<H, \`\${Prefix}\${K & string}\`, Root>
      : ClientRoutes<RA[K], \`\${Prefix}\${K & string}/\`, Root>;
  };
  export type ClientMiddleFns<RA, Prefix extends string = '', Root = RA> = {
    [K in keyof RA as RA[K] extends {type: 2 | 3} ? K : RA[K] extends {type: number} ? never : K]: RA[K] extends {type: 2 | 3; handler: infer H extends Handler}
      ? (...params: Parameters<H>) => MiddlewareSubRequest<H, \`\${Prefix}\${K & string}\`, Root>
      : ClientMiddleFns<RA[K], \`\${Prefix}\${K & string}/\`, Root>;
  };
  export function initClient<RA>(o?: unknown, mode?: InjectApiMetadata<RA>): {routes: ClientRoutes<RA>; middleFns: ClientMiddleFns<RA>};
}
`;
// The client's view of the API (PublicApi<typeof routes>): a headers middleFn, a called route and
// a route nothing calls.
const API_TS = `type Headers = {headers: {authorization: string}};
type MfOpts = {alwaysRun: false; validateParams: true; validateReturn: false; description: undefined; encoder: {params: 'clone'; return: 'clone'}; strictTypes: undefined; sanitizeParams: undefined};
type RouteOpts = {alwaysRun: false; validateParams: true; validateReturn: false; description: undefined; encoder: {params: 'clone'; return: 'clone'}; isMutation: undefined; strictTypes: undefined; sanitizeParams: undefined};
export type Api = {
  auth: {type: 3; handler: (h: Headers) => Promise<void>; options: MfOpts; types?: {params: []; return: void; headers: Headers; isAsync: false}};
  users: {
    getById: {type: 1; handler: (id: number) => Promise<{id: number; name: string}>; options: RouteOpts; types?: {params: [id: number]; return: {id: number; name: string}; headers: never; isAsync: true}};
    remove: {type: 1; handler: (id: number) => Promise<boolean>; options: RouteOpts; types?: {params: [id: number]; return: boolean; headers: never; isAsync: false}};
  };
};
`;
const CLIENT = `import {initClient} from '@mionjs/client';
import type {Api} from './api.ts';
export const {routes, middleFns} = initClient<Api>({baseURL: 'http://x'});
export const a = routes.users.getById(1).call();
export const b = middleFns.auth({headers: {authorization: 'x'}}).prefill();
`;
// Records the lane injected at initClient and the module injected at each dispatch point.
const CLIENT_STUB = `export function initClient(options, mode) {
  globalThis.__mode = mode;
  const make = (id) => ({
    id,
    call: (setup, bundle) => { (globalThis.__bundles ??= {})[id] = bundle; return Promise.resolve(); },
    prefill: (bundle) => { (globalThis.__bundles ??= {})[id] = bundle; },
  });
  const node = (pathId) => new Proxy(function () {}, {
    get: (_, key) => (typeof key === 'string' ? node(pathId ? pathId + '/' + key : key) : undefined),
    apply: () => make(pathId),
  });
  return {routes: node(''), middleFns: node('')};
}
`;
const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "noEmit": true, "allowImportingTsExtensions": true
  },
  "include": ["src"]
}
`;

type Bundle = {methods: {id: string; type: number; middleFnIds?: string[]; rtFns: Record<string, unknown>}[]};
type Globals = {__mode?: string; __bundles?: Record<string, Bundle>};

const register = hasBinary() ? describe : describe.skip;

register('bundled API through a real vite build', () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(path.join(tmpdir(), 'mion-bundled-api-build-')));
    writeMarkerPackage(root);
    mkdirSync(path.join(root, 'src'), {recursive: true});
    writeFileSync(path.join(root, 'tsconfig.json'), TSCONFIG);
    writeFileSync(path.join(root, 'src', 'client.d.ts'), CLIENT_DTS);
    writeFileSync(path.join(root, 'src', 'api.ts'), API_TS);
    writeFileSync(path.join(root, 'src', 'a.ts'), CLIENT);
    writeFileSync(path.join(root, 'client-stub.js'), CLIENT_STUB);
  });
  afterEach(() => rmSync(root, {recursive: true, force: true}));

  /** Builds the fixture client through the real preset and returns the single emitted chunk. */
  async function buildClient(bundleApi?: 'bundled' | 'mixed'): Promise<string> {
    const result = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: mionVitePlugin({
        runTypes: {tsConfig: path.join(root, 'tsconfig.json'), binary: BIN, genDir: path.join(root, '.mion')},
        bundleApi,
      }),
      resolve: {alias: {'@mionjs/client': path.join(root, 'client-stub.js')}},
      build: {
        write: false,
        minify: false,
        lib: {entry: path.join(root, 'src', 'a.ts'), formats: ['es'], fileName: 'client'},
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]) as RollupOutput[];
    const chunk = outputs.flatMap((out) => out.output ?? []).find((o) => o.type === 'chunk');
    if (!chunk || chunk.type !== 'chunk') throw new Error('no chunk emitted');
    return chunk.code;
  }

  /** Imports the artifact with `Function` replaced by a thrower and returns what it registered. */
  async function runArtifact(code: string): Promise<Globals> {
    const runtime = `${root}/artifact.mjs`;
    writeFileSync(runtime, code);
    const globals = globalThis as Globals;
    delete globals.__mode;
    delete globals.__bundles;
    const realFunction = globalThis.Function;
    globalThis.Function = function () {
      throw new Error('new Function is disabled by the policy');
    } as unknown as FunctionConstructor;
    try {
      await import(runtime);
    } finally {
      globalThis.Function = realFunction;
    }
    return globals;
  }

  /** Every file under dir, as paths relative to it. */
  function walk(dir: string, base = dir): string[] {
    return readdirSync(dir, {withFileTypes: true})
      .flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(dir, entry.name), base) : [path.relative(base, path.join(dir, entry.name))]
      )
      .sort();
  }

  it('writes api/ under the gen dir: the called methods with their chains, the site modules, the manifest', async () => {
    await buildClient('bundled');
    const api = path.join(root, '.mion', 'api');
    const files = walk(api);
    expect(files.filter((file) => file.startsWith('m/'))).toEqual(['m/auth.js', 'm/users/getById.js']);
    expect(files.filter((file) => file.startsWith('s/'))).toEqual(['s/auth.js', 's/users/getById.js']);
    expect(files.some((file) => file.startsWith('types/'))).toBe(true);
    const manifest = JSON.parse(readFileSync(path.join(api, 'manifest.json'), 'utf8')) as {
      kind: string;
      mode: string;
      methods: Record<string, unknown>;
    };
    expect(manifest.kind).toBe('client');
    expect(manifest.mode).toBe('bundled');
    expect(Object.keys(manifest.methods).sort()).toEqual(['auth', 'users/getById']);
    // relative imports only, nothing from any project path
    for (const file of ['m/auth.js', 'm/users/getById.js', 's/users/getById.js']) {
      const source = readFileSync(path.join(api, file), 'utf8');
      for (const [, specifier] of source.matchAll(/from '([^']+)'/g)) expect(specifier.startsWith('../'), specifier).toBe(true);
      expect(source).not.toContain(root);
    }
  });

  it('inlines the bundle into a self-contained artifact: live factories, no code string, nothing for the uncalled route', async () => {
    const code = await buildClient('bundled');
    expect(code).toMatch(/['"]bundled['"]/);
    expect(code).toContain('"users/getById"');
    expect(code).not.toContain('users/remove');
    expect(code).not.toContain('new Function');
    // the built-in pure fns a validator needs ride as live factories too, never as a code string
    expect(code).toContain('_err(');
    expect(code).not.toMatch(/['"]return function/);
    expect(code).not.toContain('rtapi:');
    expect(code).not.toContain('rtmod:');
    expect(code.replace(/^\/\/#(end)?region.*$/gm, '')).not.toContain(root);
  });

  it('runs with dynamic code disabled: the artifact hands each dispatch point its bundle', async () => {
    const globals = await runArtifact(await buildClient('bundled'));
    expect(globals.__mode).toBe('bundled');
    const bundles = globals.__bundles ?? {};
    expect(Object.keys(bundles).sort()).toEqual(['auth', 'users/getById']);
    // the route's payload: the route plus the middleFn of its chain, in tree order
    const getById = bundles['users/getById'];
    expect(getById.methods.map((method) => method.id)).toEqual(['auth', 'users/getById']);
    const route = getById.methods[1];
    expect(route.type).toBe(1);
    expect(route.middleFnIds).toEqual(['auth']);
    // the marker payload is made of entry tuples carrying live factories, never a code string
    const paramsFns = route.rtFns.paramsFns as unknown[][];
    expect(Array.isArray(paramsFns)).toBe(true);
    expect(paramsFns.length).toBeGreaterThan(0);
    expect(paramsFns.some((tuple) => tuple.some((slot) => typeof slot === 'function'))).toBe(true);
    for (const tuple of paramsFns)
      expect(tuple.filter((slot) => typeof slot === 'string' && slot.includes('return '))).toEqual([]);
    expect(Array.isArray(route.rtFns.paramsId)).toBe(true);
    // the prefilled headers middleFn carries its headers type too
    const auth = bundles['auth'].methods[0];
    expect(auth.type).toBe(3);
    expect(Array.isArray(auth.rtFns.headersFns)).toBe(true);
  });

  it('writes nothing and injects nothing without the option', async () => {
    const code = await buildClient();
    expect(existsSync(path.join(root, '.mion', 'api'))).toBe(false);
    expect(code).not.toMatch(/['"]bundled['"]/);
    expect(code).not.toContain('__rt_s$2F');
    const globals = await runArtifact(code);
    expect(globals.__mode).toBeUndefined();
    expect(globals.__bundles?.['users/getById']).toBeUndefined();
  });
});
