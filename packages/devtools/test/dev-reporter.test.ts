// A real vite dev server prints only what breaks running code, once per session, without clearing the terminal.
// A RuntimeError added by an edit used to be lost: the edit handler read only the scan, not the regenerated program.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createLogger, createServer, type ViteDevServer} from 'vite';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {mionVitePlugin} from '../src/vite/index.ts';
import {BIN, hasBinary, waitFor, writeMarkerPackage} from './helpers/inline.ts';

const register = hasBinary() ? describe : describe.skip;

const TSCONFIG = JSON.stringify({
  compilerOptions: {target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true},
  include: ['src'],
});

// marker-calls-function-for-type (a function called only to read its return type) is a Warning; both getRunTypeId shapes resolve.
const A_TS = `import {getRunTypeId} from '@mionjs/run-types';
function load(): {name: string} {
  return {name: 'x'};
}
export const fromCall = getRunTypeId(load());
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`;
// validate-symbol-root (a root `symbol`) is a RuntimeError: the dev server reports it and keeps running.
const B_TS = `import {createValidateFn} from '@mionjs/run-types';
export const isSymbol = createValidateFn<symbol>();
`;
// validate-function-root (a root function type), added while the dev server runs.
const FUNCTION_ROOT_LINE = 'export const isFn = createValidateFn<(a: number) => void>();\n';
// marker-in-generic-function (a marker in a generic function) is a fatal Error: no code is produced for it.
const FATAL_TS = `import {createValidateFn} from '@mionjs/run-types';
export function makeValidator<T>() {
  return createValidateFn<T>();
}
`;

interface Logged {
  message: string;
  clear: boolean | undefined;
}

register('the dev server prints only what breaks running code, once', () => {
  let dir = '';
  let vite: ViteDevServer | undefined;
  const logged: Logged[] = [];
  const lines = (): string[] => logged.flatMap((entry) => entry.message.split('\n'));
  const count = (needle: string): number => lines().filter((line) => line.includes(needle)).length;

  beforeEach(async () => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mion-dev-reporter-')));
    fs.mkdirSync(path.join(dir, 'src'));
    writeMarkerPackage(dir);
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), A_TS);
    fs.writeFileSync(path.join(dir, 'src', 'b.ts'), B_TS);
    logged.length = 0;
    const logger = createLogger('silent');
    logger.warn = (message: string, options?: {clear?: boolean}) => void logged.push({message, clear: options?.clear});
    vite = await createServer({
      root: dir,
      configFile: false,
      customLogger: logger,
      server: {middlewareMode: true},
      plugins: mionVitePlugin({
        tsConfig: path.join(dir, 'tsconfig.json'),
        runTypes: {binary: BIN, genDir: path.join(dir, '.mion')},
      }),
    });
    await waitFor(() => count('error validate-symbol-root') > 0, 'the start-up report');
  });

  afterEach(async () => {
    await vite?.close();
    vite = undefined;
    fs.rmSync(dir, {recursive: true, force: true});
  });

  const edit = async (rel: string, content: string): Promise<void> => {
    const file = path.join(dir, 'src', rel);
    fs.writeFileSync(file, content);
    vite!.watcher.emit('change', file);
  };

  it('reports the RuntimeError once and the warning as one count line, never clearing the terminal', async () => {
    expect(count('error validate-symbol-root')).toBe(1);
    expect(count('marker-calls-function-for-type')).toBe(0);
    expect(lines()).toContain('mion: 1 warning (1 new). Your editor shows them through the mion lint rules.');
    expect(logged.every((entry) => entry.clear === false)).toBe(true);
  }, 60_000);

  it('reports a RuntimeError added by an edit, once, and again after it was fixed and comes back', async () => {
    await edit('b.ts', B_TS + FUNCTION_ROOT_LINE);
    await waitFor(() => count('error validate-function-root') === 1, 'validate-function-root after the edit');
    // An edit that brings nothing new prints nothing.
    const before = logged.length;
    await edit('b.ts', B_TS + FUNCTION_ROOT_LINE);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(logged.length).toBe(before);
    expect(count('error validate-symbol-root')).toBe(1);

    await edit('b.ts', B_TS);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await edit('b.ts', B_TS + FUNCTION_ROOT_LINE);
    await waitFor(() => count('error validate-function-root') === 2, 'validate-function-root printed again once it came back');
  }, 90_000);

  it('prints a fatal Error once and throws it from the transform, without printing it again', async () => {
    await edit('fatal.ts', FATAL_TS);
    await waitFor(() => count('error marker-in-generic-function') === 1, 'marker-in-generic-function after the edit');
    await expect(vite!.transformRequest('/src/fatal.ts')).rejects.toThrow(
      /build stopped on 1 mion error\. First: .*error marker-in-generic-function: /
    );
    expect(count('marker-in-generic-function')).toBe(1);
  }, 60_000);

  it("prints a failed regenerate and the edit's own findings, and keeps running", async () => {
    // A file where the generated folder should be makes every write under it fail.
    const typesDir = path.join(dir, '.mion', 'types');
    fs.rmSync(typesDir, {recursive: true, force: true});
    fs.writeFileSync(typesDir, '');
    await edit('fatal.ts', FATAL_TS);
    await waitFor(() => count('regenerating after an edit failed') > 0, 'the regenerate failure');
    await waitFor(() => count('error marker-in-generic-function') === 1, 'marker-in-generic-function from the edit scan');
  }, 60_000);
});

// The client half of `@mionjs/client` the checker reads; the dispatch method carries the real marker.
const CLIENT_DTS = `declare module '@mionjs/client' {
  import type {InjectApiMetadata, InjectBuildVersion} from '@mionjs/run-types';
  export interface RouteSubRequest<PH, Id extends string = string, RA = any> {
    id: Id;
    call(setup?: unknown, apiMetadata?: InjectApiMetadata<RA, Id>): Promise<unknown>;
  }
  type Handler = (...args: any[]) => any;
  export type ClientRoutes<RA, Prefix extends string = '', Root = RA> = {
    [K in keyof RA as RA[K] extends {type: 1} ? K : RA[K] extends {type: number} ? never : K]: RA[K] extends {type: 1; handler: infer H extends Handler}
      ? (...params: Parameters<H>) => RouteSubRequest<H, \`\${Prefix}\${K & string}\`, Root>
      : ClientRoutes<RA[K], \`\${Prefix}\${K & string}/\`, Root>;
  };
  export function initClient<RA>(o?: unknown, buildVersion?: InjectBuildVersion<RA>): {routes: ClientRoutes<RA>};
  export function setApiBundled(): void;
}
`;
const API_TS = `type RouteOpts = {alwaysRun: false; description: undefined; parser: {params: 'clone'; return: 'clone'}; isMutation: undefined; sanitizeParams: undefined};
export type Api = {
  users: {
    getById: {type: 1; handler: (id: number) => Promise<{id: number}>; options: RouteOpts; types?: {params: [id: number]; return: {id: number}; headers: never; isAsync: true}};
  };
};
`;
// rpc-client-route-not-declared (a dispatch site names a route the API does not declare) is an Error only the whole-program pass finds.
const GHOST_CLIENT_TS = `import {initClient} from '@mionjs/client';
import type {Api} from './api.ts';
import type {InjectApiMetadata} from '@mionjs/run-types';
export const {routes} = initClient<Api>({baseURL: 'http://x'});
declare const ghost: {call(setup?: unknown, apiMetadata?: InjectApiMetadata<Api, 'users/ghost'>): Promise<unknown>};
export const a = ghost.call();
export const b = routes.users.getById(1).call();
`;

register('the dev server fails the file holding a whole-program Error', () => {
  let dir = '';
  let vite: ViteDevServer | undefined;

  afterEach(async () => {
    await vite?.close();
    vite = undefined;
    fs.rmSync(dir, {recursive: true, force: true});
  });

  it('prints rpc-client-route-not-declared once and throws it from the transform of its file', async () => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mion-dev-whole-program-')));
    fs.mkdirSync(path.join(dir, 'src'));
    writeMarkerPackage(dir);
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
    fs.writeFileSync(path.join(dir, 'src', 'client.d.ts'), CLIENT_DTS);
    fs.writeFileSync(path.join(dir, 'src', 'api.ts'), API_TS);
    fs.writeFileSync(path.join(dir, 'src', 'client.ts'), GHOST_CLIENT_TS);
    fs.writeFileSync(
      path.join(dir, 'client-stub.js'),
      'export const initClient = () => ({routes: {}});\nexport const setApiBundled = () => {};\n'
    );
    const printed: string[] = [];
    const logger = createLogger('silent');
    logger.warn = (message: string) => void printed.push(message);
    vite = await createServer({
      root: dir,
      configFile: false,
      customLogger: logger,
      server: {middlewareMode: true},
      resolve: {alias: {'@mionjs/client': path.join(dir, 'client-stub.js')}},
      plugins: mionVitePlugin({
        tsConfig: path.join(dir, 'tsconfig.json'),
        runTypes: {binary: BIN, genDir: path.join(dir, '.mion')},
        client: {routes: 'bundle'},
      }),
    });
    await waitFor(
      () => printed.some((block) => block.includes('error rpc-client-route-not-declared')),
      'rpc-client-route-not-declared in the start-up report'
    );
    await expect(vite.transformRequest('/src/client.ts')).rejects.toThrow(
      /build stopped on 1 mion error\. First: .*error rpc-client-route-not-declared: /
    );
  }, 60_000);
});
