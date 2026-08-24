// Full RUNTIME e2e for the anonymous pure-fn lane through a third-party wrapper.
//
// The transform-only third-party tests prove the rewrite (factory → entry
// binding + injected `'rt::<hash>'`). This one closes the loop: it drives the
// real plugin over a real node_modules fixture, writes the generated cache
// modules AND the rewritten consumer to disk, then EXECUTES the result in a
// fresh Node process and asserts the compiled pure fn actually runs.
//
// Fixture (all on disk, resolved by Node at runtime):
//   - node_modules/@ts-runtypes/core → symlink to the built package, so the
//     runtime `registerAnonymousPureFn` + `getRTUtils()` singleton are the real
//     ones (shared between the consumer and the generated modules).
//   - node_modules/@acme/toolkit — a framework package that re-exports the
//     primitive and forwards its own `registerAcmePureFn` wrapper to it.
//   - consumer.ts — registers a pure fn THROUGH the wrapper, then looks it up by
//     its runtime key (`getPureFnByKey`) and calls it.
//
// The consumer is annotation-free, so the plugin's rewritten output is valid
// ESM JS; we run it as `node consumer.mjs` (a child process, isolated from
// vitest's own transform pipeline) and read the JSON it prints.
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import runtypesRollup from '../../../ts-runtypes-devtools/src/rollup.ts';
import {BIN, hasBinary} from '../../../ts-runtypes-devtools/test/helpers/inline.ts';

// packages/ts-runtypes — the real @ts-runtypes/core the fixture symlinks in.
const CORE_PKG_DIR = fileURLToPath(new URL('../..', import.meta.url));

let FIXTURE_DIR = '';

const TSCONFIG_SRC = JSON.stringify({
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

const TOOLKIT_PKG_JSON = JSON.stringify({
  name: '@acme/toolkit',
  version: '0.0.0',
  type: 'module',
  types: 'index.d.ts',
  main: 'index.js',
});

// The framework surface: barrel re-export + a branded wrapper that forwards to
// the anonymous lane (so calling the wrapper genuinely registers the fn).
const TOOLKIT_DTS = `import type {PureFunction, InjectPureFnHash} from '@ts-runtypes/core';
export {registerAnonymousPureFn} from '@ts-runtypes/core';
export declare function registerAcmePureFn<F extends (...args: any[]) => any>(
  fn: PureFunction<F>,
  hash?: InjectPureFnHash<F>,
): {namespace: string; fnName: string};
`;

const TOOLKIT_JS = `import {registerAnonymousPureFn} from '@ts-runtypes/core';
export {registerAnonymousPureFn} from '@ts-runtypes/core';
export function registerAcmePureFn(fn, hash) {
  return registerAnonymousPureFn(fn, hash);
}
`;

// Annotation-free, so the rewritten output is valid ESM JS. Registers through
// the wrapper, then looks the fn up by its RUNTIME key and calls it.
const CONSUMER_SRC = `import {registerAcmePureFn} from '@acme/toolkit';
import {getRTUtils} from '@ts-runtypes/core';

const compiled = registerAcmePureFn(function _double(n) { return n * 2; });

const key = compiled.namespace + '::' + compiled.fnName;
process.stdout.write(
  '<<RT>>' +
    JSON.stringify({
      namespace: compiled.namespace,
      fnName: compiled.fnName,
      has: getRTUtils().hasPureFnByKey(key),
      missing: getRTUtils().hasPureFnByKey('rt::definitelyMissing'),
      doubled: getRTUtils().getPureFnByKey(key)(21),
    }) +
    '<<RT>>'
);
`;

const ctx = {
  error(message: string): never {
    throw new Error(message);
  },
  warn(): void {},
};

const callHook = (hook: any, thisArg: unknown, ...args: unknown[]): unknown =>
  typeof hook === 'function' ? hook.apply(thisArg, args) : hook.handler.apply(thisArg, args);

function makePlugin() {
  return runtypesRollup({
    binary: BIN,
    cwd: FIXTURE_DIR,
    tsconfig: 'tsconfig.json',
    genDir: path.join(FIXTURE_DIR, '__runtypes'),
  }) as any;
}

describe('third-party anonymous pure fns: full runtime e2e (node_modules + execute)', () => {
  const register = hasBinary() ? it : it.skip;

  beforeAll(() => {
    FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-third-party-anon-e2e-'));
    // Make the fixture's own .js load as ESM (the generated cache modules are
    // `export const …`), independent of Node's syntax-detection heuristics.
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'package.json'),
      JSON.stringify({name: 'rt-e2e-fixture', private: true, type: 'module'})
    );
    // node_modules/@ts-runtypes/core → the real built package.
    const coreScope = path.join(FIXTURE_DIR, 'node_modules', '@ts-runtypes');
    fs.mkdirSync(coreScope, {recursive: true});
    fs.symlinkSync(CORE_PKG_DIR, path.join(coreScope, 'core'), 'dir');
    // node_modules/@acme/toolkit
    const toolkitDir = path.join(FIXTURE_DIR, 'node_modules', '@acme', 'toolkit');
    fs.mkdirSync(toolkitDir, {recursive: true});
    fs.writeFileSync(path.join(toolkitDir, 'package.json'), TOOLKIT_PKG_JSON);
    fs.writeFileSync(path.join(toolkitDir, 'index.d.ts'), TOOLKIT_DTS);
    fs.writeFileSync(path.join(toolkitDir, 'index.js'), TOOLKIT_JS);

    fs.writeFileSync(path.join(FIXTURE_DIR, 'tsconfig.json'), TSCONFIG_SRC);
    fs.writeFileSync(path.join(FIXTURE_DIR, 'consumer.ts'), CONSUMER_SRC);
  });
  afterAll(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  register('registers via the wrapper, generates modules, then runs the compiled fn', async () => {
    const consumerTs = path.join(FIXTURE_DIR, 'consumer.ts');
    const plugin = makePlugin();
    let code = '';
    try {
      // buildStart writes the generated cache modules to <outDir>/types/.
      await callHook(plugin.buildStart, ctx);
      const transformed = (await callHook(plugin.transform, ctx, CONSUMER_SRC, consumerTs)) as {code: string} | null;
      expect(transformed, 'consumer registering through the wrapper must be transformed').toBeTruthy();
      code = transformed!.code;
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort teardown
      }
    }

    // The rewrite injected the content id at the wrapper call site.
    const injected = code.match(/registerAcmePureFn\(\s*__rt_pf[A-Za-z0-9_$]*,\s*'(rt::[A-Za-z0-9_-]{14})'\)/);
    expect(injected, `wrapper call must carry an injected hash in:\n${code}`).toBeTruthy();

    // Write the rewritten consumer next to consumer.ts (same dir, so its
    // relative imports of the generated modules resolve) and EXECUTE it in a
    // fresh Node process — no vitest transform pipeline in the loop.
    const consumerMjs = path.join(FIXTURE_DIR, 'consumer.mjs');
    fs.writeFileSync(consumerMjs, code);
    const stdout = execFileSync(process.execPath, [consumerMjs], {cwd: FIXTURE_DIR, encoding: 'utf8'});
    const payload = stdout.match(/<<RT>>(.*)<<RT>>/s);
    expect(payload, `consumer must print its result; got:\n${stdout}`).toBeTruthy();
    const result = JSON.parse(payload![1]) as {
      namespace: string;
      fnName: string;
      has: boolean;
      missing: boolean;
      doubled: number;
    };

    // Registered under the content-hashed rt::<hash> key, and the id it printed
    // is the SAME one the rewrite injected.
    expect(result.namespace).toBe('rt');
    expect(result.fnName).toMatch(/^[A-Za-z0-9_-]{14}$/);
    expect(`rt::${result.fnName}`).toBe(injected![1]);
    // The untracked runtime-key accessor finds it (and only it).
    expect(result.has).toBe(true);
    expect(result.missing).toBe(false);
    // And the compiled pure fn actually RUNS: 21 * 2 === 42.
    expect(result.doubled).toBe(42);
  });
});
