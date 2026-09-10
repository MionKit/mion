/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createBuilder} from 'vite';

/** `createBuilder` as the `vite build` CLI calls it: the second argument is `null`, so the config's
 *  own `builder` block is what decides between the app build and the legacy single-environment one.
 *  Calling it with one argument forces the app build and would hide whether the preset asked for it. */
const createBuilderLikeCli = (config: Parameters<typeof createBuilder>[0]) => createBuilder(config, null);
import {mionVitePlugin} from './mionVitePlugin.ts';
import {BIN, hasBinary, writeMarkerPackage} from '../../test/helpers/inline.ts';

// One config, two bundles: `server.build` makes `vite build` emit the client static files AND the
// API, from the same program and the same resolver. Through a REAL build over a REAL program,
// because the whole thing is vite wiring — a unit test of the returned config object would prove
// only that the object was returned.
//
// The build is driven through `createBuilder(...).buildApp()`, which is what the `vite build` CLI
// does. The programmatic `build()` export is NOT the same thing: it always takes vite's legacy
// single-environment path and would build the client half only, whatever `builder` says.

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "noEmit": true, "allowImportingTsExtensions": true
  },
  "include": ["src"]
}
`;
const ROUTER_DTS = `declare module '@mionjs/router' {
  export function createMionRouter(opts?: unknown): {initRoutes: (routes: unknown) => unknown};
}
`;
const ROUTER_STUB = `export const createMionRouter = () => ({initRoutes: () => ({})});
`;
// The marker package ships declarations only, so the runtime half needs a stand-in. The transform
// leaves the call in place and passes the compiled tuple as a third argument, so this rebuilds the
// validator from the tuple's code — and throws when the tuple is missing, which is exactly what an
// environment the transform never reached would produce.
const MARKER_STUB = `export const createValidateFn = (_a, _b, tuple) => {
  if (!tuple) throw new Error('MARKER NOT TRANSFORMED');
  return new Function(tuple[5])();
};
`;
// The API entry. `createValidateFn` gives it a marker site, so a build that skipped the transform
// for this environment would fall through to the throwing stub.
const SERVER = `import {createMionRouter} from '@mionjs/router';
import {createValidateFn} from '@mionjs/run-types';
export type Account = {id: number; label: string};
export const mion = createMionRouter();
export const api = mion.initRoutes({});
export const isAccount = createValidateFn<Account>();
globalThis.__serverRan = isAccount({id: 1, label: 'a'});
`;
// The browser half, a plain module with its own marker site.
const CLIENT = `import {createValidateFn} from '@mionjs/run-types';
export type Session = {token: string};
const isSession = createValidateFn<Session>();
export const ok = isSession({token: 'x'});
`;
const INDEX_HTML = `<!doctype html><html><body><script type="module" src="/src/main.ts"></script></body></html>`;

/** The one emitted server module. The ssr environment names it after the entry, `.mjs` by default. */
const serverBundleIn = (dir: string): string => {
  const file = readdirSync(dir).find((name) => name.endsWith('.js') || name.endsWith('.mjs'));
  if (!file) throw new Error(`no server bundle in ${dir}, only: ${readdirSync(dir).join(', ')}`);
  return path.join(dir, file);
};

const register = hasBinary() ? describe : describe.skip;

register('one config, two bundles', () => {
  let root: string;

  beforeEach(() => {
    // real path: vite resolves module ids through symlinks (macOS keeps tmp under /private), and
    // the transform gate compares them against the resolver's program paths
    root = realpathSync(mkdtempSync(path.join(tmpdir(), 'mion-two-bundles-')));
    writeMarkerPackage(root);
    mkdirSync(path.join(root, 'src'), {recursive: true});
    writeFileSync(path.join(root, 'tsconfig.json'), TSCONFIG);
    writeFileSync(path.join(root, 'index.html'), INDEX_HTML);
    writeFileSync(path.join(root, 'src', 'router.d.ts'), ROUTER_DTS);
    writeFileSync(path.join(root, 'src', 'main.ts'), CLIENT);
    writeFileSync(path.join(root, 'src', 'server.ts'), SERVER);
    writeFileSync(path.join(root, 'router-stub.js'), ROUTER_STUB);
    writeFileSync(path.join(root, 'marker-stub.js'), MARKER_STUB);
  });
  afterEach(() => rmSync(root, {recursive: true, force: true}));

  /** A stand-in for the resolver binary that records every spawn, then execs the real one. */
  function countingBinary(): {binary: string; spawns: () => number} {
    const log = path.join(root, 'spawns.log');
    const shim = path.join(root, 'mion-shim.sh');
    writeFileSync(shim, `#!/bin/sh\necho spawn >> ${JSON.stringify(log)}\nexec ${JSON.stringify(BIN)} "$@"\n`, {mode: 0o755});
    return {
      binary: shim,
      spawns: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).length : 0),
    };
  }

  /** Runs the whole app build exactly as the `vite build` CLI does. */
  async function buildApp(binary: string, serverOutDir?: string): Promise<void> {
    const builder = await createBuilderLikeCli({
      root,
      configFile: false,
      logLevel: 'silent',
      resolve: {
        alias: {'@mionjs/router': path.join(root, 'router-stub.js'), '@mionjs/run-types': path.join(root, 'marker-stub.js')},
      },
      plugins: mionVitePlugin({
        runTypes: {tsConfig: path.join(root, 'tsconfig.json'), binary, genDir: path.join(root, '.mion')},
        server: {
          startScript: path.join(root, 'src', 'server.ts'),
          build: serverOutDir ? {outDir: serverOutDir} : {},
        },
      }),
      build: {minify: false},
    });
    await builder.buildApp();
  }

  it('emits the client bundle and the server bundle from one build', async () => {
    const {binary} = countingBinary();
    await buildApp(binary);

    // The client half: an html entry plus its hashed asset chunk.
    expect(existsSync(path.join(root, 'dist', 'index.html'))).toBe(true);
    expect(readdirSync(path.join(root, 'dist', 'assets')).some((name) => name.endsWith('.js'))).toBe(true);

    // The server half, in its own directory so the two never overwrite each other.
    const serverCode = readFileSync(serverBundleIn(path.join(root, 'dist-server')), 'utf8');
    // Transformed in BOTH environments, not merely bundled: each artifact carries the compiled
    // tuple the transform injected, inlined from this build's own generated tree.
    const clientChunk = readdirSync(path.join(root, 'dist', 'assets')).find((name) => name.endsWith('.js'))!;
    expect(readFileSync(path.join(root, 'dist', 'assets', clientChunk), 'utf8')).toMatch(/__rt_[A-Za-z0-9_-]+ = \[/);
    expect(serverCode).toMatch(/__rt_[A-Za-z0-9_-]+ = \[/);
    expect(serverCode).toContain('__serverRan');
  });

  it('runs: the server bundle boots and carries its compiled type id', async () => {
    const {binary} = countingBinary();
    await buildApp(binary);
    const globals = globalThis as {__serverRan?: boolean};
    delete globals.__serverRan;
    await import(serverBundleIn(path.join(root, 'dist-server')));
    // The compiled validator ran: a bundle that reached the stub would have thrown on import.
    expect(globals.__serverRan).toBe(true);
  });

  it('spawns ONE resolver for both bundles, not one per environment', async () => {
    const {binary, spawns} = countingBinary();
    await buildApp(binary);
    expect(spawns()).toBe(1);
  });

  it('honours server.build.outDir', async () => {
    const {binary} = countingBinary();
    await buildApp(binary, 'dist-api');
    expect(existsSync(path.join(root, 'dist-api'))).toBe(true);
    expect(existsSync(path.join(root, 'dist-server'))).toBe(false);
  });

  it('leaves a build alone when server.build is not set', async () => {
    const {binary} = countingBinary();
    const builder = await createBuilderLikeCli({
      root,
      configFile: false,
      logLevel: 'silent',
      resolve: {
        alias: {'@mionjs/router': path.join(root, 'router-stub.js'), '@mionjs/run-types': path.join(root, 'marker-stub.js')},
      },
      plugins: mionVitePlugin({
        runTypes: {tsConfig: path.join(root, 'tsconfig.json'), binary, genDir: path.join(root, '.mion')},
        server: {startScript: path.join(root, 'src', 'server.ts')},
      }),
      build: {minify: false},
    });
    await builder.buildApp();
    expect(existsSync(path.join(root, 'dist', 'index.html'))).toBe(true);
    expect(existsSync(path.join(root, 'dist-server'))).toBe(false);
  });
});
