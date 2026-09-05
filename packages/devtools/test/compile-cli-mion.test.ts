// The batch transport through `mion compile`, the tsc-like CLI lane, over a real
// client project and a real server project on disk: the server compile writes
// `<genDir>/rpc/` from the client tsconfig and appends the relativized table import
// to its emitted router-init module; the client compile splices the batch id and
// the mapper hash into its emitted `.js`. Both projects declare the mion packages
// ambiently (the pattern of compile-cli.test.ts), so no built framework package
// is needed; the markers come from the real marker package.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {hasBinary, writeMarkerPackage} from './helpers/inline.ts';
import {runCli} from './helpers/cliCrash.ts';

const register = hasBinary() ? it : it.skip;

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
}
`;
const ROUTES_TS = `import {initClient} from '@mionjs/client';
export type Routes = {
  users: {getById: (id: number) => {id: number; name: string}};
  orders: {getById: (id: number) => {id: number}};
};
export const {routes} = initClient<Routes>();
`;
const CLIENT_TS = `import {batch, inputFrom} from '@mionjs/client';
import {routes} from './routes.ts';
const user = routes.users.getById(1);
export const b = batch([user, routes.orders.getById(inputFrom(user, (u: {id: number}) => u.id))]);
`;
const SERVER_TS = `import {createMionRouter} from '@mionjs/router';
export const mion = createMionRouter();
export const api = mion.initRoutes({});
`;
const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "rootDir": "src", "outDir": "dist", "strict": true,
    "allowImportingTsExtensions": true, "rewriteRelativeImportExtensions": true
  },
  "include": ["src"]
}
`;

function writeProject(base: string, name: string, files: Record<string, string>): string {
  const dir = path.join(base, name);
  fs.mkdirSync(path.join(dir, 'src'), {recursive: true});
  writeMarkerPackage(dir);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
  for (const [rel, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'src', rel), content);
  return dir;
}

describe('mion compile — a mion client and a mion server, in two projects', () => {
  register('the server emits rpc/ from --client-tsconfig and imports the table; the client emits its ids', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-compile-mion-'));
    try {
      const client = writeProject(base, 'client', {'client.d.ts': CLIENT_DTS, 'routes.ts': ROUTES_TS, 'a.ts': CLIENT_TS});
      const server = writeProject(base, 'server', {'router.d.ts': ROUTER_DTS, 'server.ts': SERVER_TS});

      const serverRun = runCli(
        [
          'compile',
          '--cwd',
          server,
          '--tsconfig',
          'tsconfig.json',
          '--client-tsconfig',
          path.join(client, 'tsconfig.json'),
          '--gen-dir',
          path.join(server, '.mion'),
        ],
        {label: 'compile-cli-mion-server'}
      );
      expect(serverRun.status, serverRun.report).toBe(0);

      // the transport is under the SERVER's gen dir, relative imports only, nothing from the client tree
      const table = fs.readFileSync(path.join(server, '.mion', 'rpc', 'batches.generated.js'), 'utf8');
      expect(table).toMatch(/import \{__rt_pf\$2Frt\$2F[A-Za-z0-9_$]+\} from '\.\/pf\/rt\/[^']+\.js';/);
      expect(table).toMatch(/replaceBatches\(\{"b_[A-Za-z0-9_-]+":/);
      expect(table).not.toContain(client);
      expect(table).not.toContain(server);
      const mappers = fs.readdirSync(path.join(server, '.mion', 'rpc', 'pf', 'rt'));
      expect(mappers).toHaveLength(1);
      expect(fs.readFileSync(path.join(server, '.mion', 'rpc', 'pf', 'rt', mappers[0]), 'utf8')).toContain('u.id');

      // the emitted router-init module ends with the import, relativized from dist/ to .mion/rpc/
      const serverJs = fs.readFileSync(path.join(server, 'dist', 'server.js'), 'utf8');
      expect(serverJs).not.toContain('rtrpc:');
      expect(serverJs).toContain("import '../.mion/rpc/batches.generated.js';");
      expect(serverJs).toContain('createMionRouter(');

      // the client compile carries the same batch id and mapper hash the table registers
      const clientRun = runCli(
        ['compile', '--cwd', client, '--tsconfig', 'tsconfig.json', '--gen-dir', path.join(client, '.mion')],
        {
          label: 'compile-cli-mion-client',
        }
      );
      expect(clientRun.status, clientRun.report).toBe(0);
      const clientJs = fs.readFileSync(path.join(client, 'dist', 'a.js'), 'utf8');
      const batchId = /'(b_[A-Za-z0-9_-]+)'/.exec(clientJs)?.[1];
      const mapperKey = /'(rt::[A-Za-z0-9_-]+)'/.exec(clientJs)?.[1];
      expect(batchId, clientJs).toBeDefined();
      expect(mapperKey, clientJs).toBeDefined();
      expect(table).toContain(`"${batchId}"`);
      expect(table).toContain(`'${mapperKey}'`);
      // a client is not a server: no rpc/ of its own, no import appended
      expect(fs.existsSync(path.join(client, '.mion', 'rpc'))).toBe(false);
      expect(clientJs).not.toContain('batches.generated');
    } finally {
      fs.rmSync(base, {recursive: true, force: true});
    }
  });
});
