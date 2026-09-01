// End-to-end for @mionjs/devtools/runtypes/bun against a REAL bun process, over a
// real temp project. Bun's two plugin hosts are genuinely different code paths,
// so both are exercised:
//
//   - `Bun.plugin()` from a --preload module (the RUNTIME loader). No bundle
//     step; every import is transformed as bun loads it.
//   - `Bun.build()` (the BUNDLER), which unplugin's own Bun context targets.
//
// # Why the fixture is a WRAPPER, not a direct createValidateFn call
//
// The regression these tests guard is a startup race: Bun.plugin() does not
// await an async `setup`, so files can load while the resolver is still coming
// up. A file that mentions '@mionjs/run-types' survives that anyway — the
// plugin's textual fallback sends it to the resolver directly, no scan needed.
//
// A WRAPPER call site does not. `route()` here mirrors mion's real one: the
// consumer file imports only the wrapper module and never names the marker
// package, so the plugin can only know it carries a site from the whole-program
// scan — which finishes at the END of buildStart. Load it early and it is passed
// through untransformed, and the factory throws at runtime.
//
// So this shape, and only this shape, actually fails when the readiness gate is
// removed (verified both ways against a real bun run).
//
// # Why the assertion is negative
//
// An un-injected createValidateFn falls back to `() => true`, so accepting a
// VALID value proves nothing. Only rejecting an INVALID one proves a real
// compiled validator was injected.
//
// Skipped when bun is not on PATH (it is not a workspace dependency); CI
// installs it for the js-tests job.
import {describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {BIN, hasBinary} from './helpers/inline.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function hasBun(): boolean {
  return spawnSync('bun', ['--version'], {encoding: 'utf8'}).status === 0;
}

const register = hasBinary() && hasBun() ? it : it.skip;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "skipLibCheck": true, "allowImportingTsExtensions": true
  },
  "include": ["src"]
}
`;

// The framework module — the only file that names the marker package.
const WRAPPER_TS = `import {createValidateFn} from '@mionjs/run-types';
import type {InjectTypeFnArgs, ValidateFn} from '@mionjs/run-types';
type AnyHandler = (ctx: unknown, ...rest: any[]) => unknown;
export function route<H extends AnyHandler>(handler: H, id?: InjectTypeFnArgs<Parameters<H>, 'val'>) {
  const validate: ValidateFn = createValidateFn(undefined, undefined, id as never);
  return {handler, validate};
}
`;

// The consumer — NEVER mentions '@mionjs/run-types', so only the whole-program
// scan can know it carries a marker site.
const APP_TS = `import {route} from './wrapper.ts';
export const nameRoute = route((ctx: unknown, name: string) => name.length);
export function selfCheck() {
  return {
    accepts: nameRoute.validate([undefined, 'a']) === true,
    rejects: nameRoute.validate([undefined, 42]) === false,
  };
}
`;

const RUN_TS = `import {selfCheck} from './app.ts';
console.log('REPORT ' + JSON.stringify(selfCheck()));
`;

const PASS = 'REPORT {"accepts":true,"rejects":true}';

// A project bun can resolve: @mionjs/run-types + the devtools plugin and its
// unplugin dep are symlinked out of the workspace rather than installed.
function scaffold(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-bun-'));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'wrapper.ts'), WRAPPER_TS);
  fs.writeFileSync(path.join(dir, 'src', 'app.ts'), APP_TS);
  fs.writeFileSync(path.join(dir, 'src', 'run.ts'), RUN_TS);
  // The marker package and devtools are both @mionjs now; only the launcher still
  // rides the mion run-types scope, until it is renamed to @mionjs/bin.
  const scoped = path.join(dir, 'node_modules', 'mion run-types');
  const mionScoped = path.join(dir, 'node_modules', '@mionjs');
  fs.mkdirSync(scoped, {recursive: true});
  fs.mkdirSync(mionScoped, {recursive: true});
  fs.symlinkSync(path.join(REPO_ROOT, 'packages/run-types'), path.join(mionScoped, 'run-types'));
  fs.symlinkSync(path.join(REPO_ROOT, 'packages/devtools'), path.join(mionScoped, 'devtools'));
  fs.symlinkSync(path.join(REPO_ROOT, 'packages/bin'), path.join(scoped, 'bin'));
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules/unplugin'), path.join(dir, 'node_modules', 'unplugin'));
  return dir;
}

const pluginArgs = `{tsconfig: './tsconfig.json', binary: ${JSON.stringify(BIN)}}`;

function writePreload(dir: string, awaited: boolean): void {
  fs.writeFileSync(
    path.join(dir, 'preload.ts'),
    `import {plugin} from 'bun';
import runtypes from '@mionjs/devtools/runtypes/bun';
${awaited ? 'await ' : ''}plugin(runtypes(${pluginArgs}) as never);
`
  );
}

function runBun(dir: string, args: string[]) {
  return spawnSync('bun', args, {cwd: dir, encoding: 'utf8', timeout: 120_000});
}

describe('@mionjs/devtools/runtypes/bun', () => {
  // THE regression this adapter exists for. Bun.plugin() returns a promise for
  // an async setup but does NOT wait for it before importing modules, so an
  // un-awaited registration races the resolver's startup: the wrapper consumer
  // loads while the whole-program scan is still running, nothing knows it holds
  // a marker site, and it is passed through untransformed.
  //
  // The adapter gates every onLoad on an internal readiness promise, so a load
  // that arrives early WAITS instead of skipping the transform. Remove the gate
  // and this test fails with "no id injected" from app.ts.
  register('runtime preload injects even when Bun.plugin() is NOT awaited', () => {
    const dir = scaffold();
    writePreload(dir, false);
    const run = runBun(dir, ['--preload', './preload.ts', 'src/run.ts']);
    expect(run.stdout + run.stderr).toContain(PASS);
    // Exit 0 is part of the contract, not incidental: the resolver child would
    // otherwise keep the host process alive forever (the runtime loader has no
    // buildEnd to close it), so a `bun run` script would hang after its work.
    // The adapter passes detachResolver on this host to unref the child.
    expect(run.status, `bun did not exit cleanly:\n${run.stderr}`).toBe(0);
  });

  register('runtime preload injects when Bun.plugin() IS awaited', () => {
    const dir = scaffold();
    writePreload(dir, true);
    const run = runBun(dir, ['--preload', './preload.ts', 'src/run.ts']);
    expect(run.stdout + run.stderr).toContain(PASS);
    expect(run.status, `bun did not exit cleanly:\n${run.stderr}`).toBe(0);
  });

  // The bundler host. unplugin's Bun context already fits it, so this pins that
  // the adapter's shims stay out of the way rather than adding behaviour — in
  // particular that it does NOT unref the resolver here, where a pending
  // response can be the build's only live handle.
  register('Bun.build produces a rewritten bundle whose validator works', () => {
    const dir = scaffold();
    fs.writeFileSync(
      path.join(dir, 'build.ts'),
      `import runtypes from '@mionjs/devtools/runtypes/bun';
const result = await Bun.build({
  entrypoints: ['./src/app.ts'],
  outdir: './dist',
  target: 'bun',
  external: ['@mionjs/run-types'],
  plugins: [runtypes(${pluginArgs}) as never],
});
if (!result.success) { console.error(result.logs.join('\\n')); process.exit(1); }
const {selfCheck} = await import('./dist/app.js');
console.log('REPORT ' + JSON.stringify(selfCheck()));
`
    );
    const run = runBun(dir, ['build.ts']);
    expect(run.stdout + run.stderr).toContain(PASS);
    expect(run.status, `bun build failed:\n${run.stderr}`).toBe(0);
    // Evidence the REWRITE happened rather than the runtime having fallen back:
    // the transform injects a generated `__rt_<hash>` cache binding.
    const bundle = fs.readFileSync(path.join(dir, 'dist', 'app.js'), 'utf8');
    expect(bundle).toMatch(/__rt_[A-Za-z0-9_$]+/);
  });
});
