// Third-party ANONYMOUS pure-fn registration through node_modules — the
// content-hashed twin of third-party-pure-fns.test.ts, and the real-bundler
// regression suite for the wrappable anonymous lane.
//
// Setup: a framework package installed in node_modules (`@acme/toolkit`) that
//   1. RE-EXPORTS registerAnonymousPureFn from '@ts-runtypes/core' (the barrel a
//      framework proxy package like @mionjs/run-types ships), and
//   2. declares its own registerAcmePureFn() wrapper whose params carry the
//      injection markers (PureFunction<F> factory + trailing InjectPureFnHash<F>).
//
// Two consumer files exercise both transform-gate paths:
//   - consumer.ts imports registerAnonymousPureFn RENAMED + the wrapper. The
//     rename keeps the text `registerAnonymousPureFn` in the import, so the
//     plugin's textual fallback catches it.
//   - wrapper-only.ts imports ONLY the wrapper. It names neither
//     '@ts-runtypes/core' nor the primitive textually, so it relies entirely on
//     the resolver's whole-program siteFiles (a pure fn is a Replacement, not a
//     Site — generate() folds pure-fn files in). This is the case the anonymous
//     lane exists for and the one that was invisible to the gate before the fix.
//
// Every call site must end up with (a) its factory argument rewritten to the
// generated `__rt_pf…` entry binding AND (b) the injected `'rt::<hash>'` id
// spliced into the trailing slot — the same content id a direct call would
// inject, so a library wrapper is byte-for-byte equivalent to using the
// primitive directly.
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import runtypesRollup from '../../../ts-runtypes-devtools/src/rollup.ts';
import {BIN, hasBinary, writeMarkerPackage} from '../../../ts-runtypes-devtools/test/helpers/inline.ts';

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

// The framework surface: barrel re-export + a branded wrapper over the anonymous
// lane. Only this file names '@ts-runtypes/core', and it lives in node_modules.
const TOOLKIT_DTS = `import type {PureFunction, InjectPureFnHash} from '@ts-runtypes/core';
export {registerAnonymousPureFn} from '@ts-runtypes/core';
export declare function registerAcmePureFn<F extends (...args: any[]) => any>(
  fn: PureFunction<F>,
  hash?: InjectPureFnHash<F>,
): unknown;
export declare function mapAcmeFrom<Source, MappedInput>(source: Source, fnName: string): unknown;
export declare function mapAcmeFrom<Source, MappedInput>(
  source: Source,
  mapper: PureFunction<(value: Source) => MappedInput>,
  hash?: InjectPureFnHash<(value: Source) => MappedInput>,
): unknown;
`;

const TOOLKIT_JS = `export {registerAnonymousPureFn} from '@ts-runtypes/core';
export function registerAcmePureFn(fn, hash) {
  return {fn, hash};
}
export function mapAcmeFrom(source, mapperOrName, hash) {
  return {source, mapperOrName, hash};
}
`;

// Consumer A: a RENAMED re-export call + a wrapper call + a LEADING-PARAM
// wrapper (mion serverMapFrom shape: markers at slots 1/2, overloaded
// marker-free name lane). Different bodies, so distinct content hashes; the
// name-lane call must ride through UNREWRITTEN.
const CONSUMER_SRC = `import {registerAnonymousPureFn as regAPF, registerAcmePureFn, mapAcmeFrom} from '@acme/toolkit';

export const doubled = regAPF(function _double(n: number): number { return n * 2; });
export const tripled = registerAcmePureFn(function _triple(n: number): number { return n * 3; });
const source = {id: 6};
export const mapped = mapAcmeFrom(source, (customer: {id: number}): number => customer.id * 6);
export const named = mapAcmeFrom(source, 'toCustomerId');
`;

// Consumer B: ONLY the wrapper. Names neither '@ts-runtypes/core' nor the
// primitive textually — the transform gate can only find it via siteFiles.
const WRAPPER_ONLY_SRC = `import {registerAcmePureFn} from '@acme/toolkit';

export const quadrupled = registerAcmePureFn(function _quad(n: number): number { return n * 4; });
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

// assertInjected verifies one rewritten call reads `<callee>(<pf-binding>,
// 'rt::<hash>')`, that the binding is imported from a real written module, and
// returns the injected hash so distinctness across bodies can be checked.
function assertInjected(code: string, callee: string, consumerFile: string): string {
  const match = code.match(new RegExp(`${callee}\\(\\s*(__rt_pf[A-Za-z0-9_$]*),\\s*'(rt::[A-Za-z0-9_-]{14})'\\)`));
  expect(match, `${callee} call must carry a pf binding + injected hash in:\n${code}`).toBeTruthy();
  const [, binding] = match!;
  const imports = [...code.matchAll(/import \{([^}]*)\} from '(\.\.?\/[^']+\.js)'/g)];
  const importedBindings = imports.flatMap((m) => m[1].split(',').map((s) => s.trim()));
  expect(importedBindings, `binding ${binding} must be imported`).toContain(binding);
  for (const m of imports) {
    const moduleFile = path.resolve(path.dirname(consumerFile), m[2]);
    expect(fs.existsSync(moduleFile), `injected import ${m[2]} must point at a written module`).toBe(true);
  }
  return match![2];
}

describe('third-party anonymous pure fns: renamed re-export + branded wrapper (node_modules)', () => {
  const register = hasBinary() ? it : it.skip;

  beforeAll(() => {
    FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-third-party-anon-pf-'));
    const toolkitDir = path.join(FIXTURE_DIR, 'node_modules', '@acme', 'toolkit');
    fs.mkdirSync(toolkitDir, {recursive: true});
    fs.writeFileSync(path.join(FIXTURE_DIR, 'tsconfig.json'), TSCONFIG_SRC);
    writeMarkerPackage(FIXTURE_DIR);
    fs.writeFileSync(path.join(FIXTURE_DIR, 'consumer.ts'), CONSUMER_SRC);
    fs.writeFileSync(path.join(FIXTURE_DIR, 'wrapper-only.ts'), WRAPPER_ONLY_SRC);
    fs.writeFileSync(path.join(toolkitDir, 'package.json'), TOOLKIT_PKG_JSON);
    fs.writeFileSync(path.join(toolkitDir, 'index.d.ts'), TOOLKIT_DTS);
    fs.writeFileSync(path.join(toolkitDir, 'index.js'), TOOLKIT_JS);
  });
  afterAll(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  register('renamed re-export and wrapper call sites are rewritten and get their hash injected', async () => {
    expect(CONSUMER_SRC).not.toContain('@ts-runtypes/core');

    const plugin = makePlugin();
    try {
      await callHook(plugin.buildStart, ctx);

      const consumerFile = path.join(FIXTURE_DIR, 'consumer.ts');
      const transformed = (await callHook(plugin.transform, ctx, CONSUMER_SRC, consumerFile)) as {code: string} | null;
      expect(transformed, 'anonymous pure-fn consumer of a node_modules framework must be transformed').toBeTruthy();
      const code = transformed!.code;

      const directHash = assertInjected(code, 'regAPF', consumerFile);
      const wrapperHash = assertInjected(code, 'registerAcmePureFn', consumerFile);
      // Different bodies (n*2 vs n*3) → distinct content hashes.
      expect(directHash).not.toBe(wrapperHash);

      // Leading-param wrapper (mion serverMapFrom shape): the mapper at ARG
      // slot 1 is rewritten and the hash splices at its declared slot 2.
      const leadingMatch = code.match(/mapAcmeFrom\(\s*source,\s*(__rt_pf[A-Za-z0-9_$]*),\s*'(rt::[A-Za-z0-9_-]{14})'\)/);
      expect(leadingMatch, `mapAcmeFrom inline call must carry the pf binding + injected hash in:\n${code}`).toBeTruthy();
      expect(leadingMatch![2]).not.toBe(directHash);
      // The marker-free string overload rides through UNREWRITTEN.
      expect(code).toContain(`mapAcmeFrom(source, 'toCustomerId')`);
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort teardown
      }
    }
  });

  register('wrapper-only file (no marker import, no primitive text) transforms via siteFiles', async () => {
    // The whole point of the anonymous lane: a consumer that only ever touches a
    // library's wrapper. Its source names neither '@ts-runtypes/core' nor
    // registerAnonymousPureFn, so the ONLY thing that can gate it into the
    // transform is the resolver's whole-program siteFiles set (which folds in
    // pure-fn replacement files). Before that fix this file was silently skipped.
    expect(WRAPPER_ONLY_SRC).not.toContain('@ts-runtypes/core');
    expect(WRAPPER_ONLY_SRC).not.toContain('registerAnonymousPureFn');
    expect(WRAPPER_ONLY_SRC).not.toContain('registerPureFnFactory');

    const plugin = makePlugin();
    try {
      await callHook(plugin.buildStart, ctx);

      const wrapperOnlyFile = path.join(FIXTURE_DIR, 'wrapper-only.ts');
      const transformed = (await callHook(plugin.transform, ctx, WRAPPER_ONLY_SRC, wrapperOnlyFile)) as {
        code: string;
      } | null;
      expect(
        transformed,
        'a wrapper-only consumer must still be transformed (siteFiles must cover pure-fn replacement files)'
      ).toBeTruthy();
      assertInjected(transformed!.code, 'registerAcmePureFn', wrapperOnlyFile);
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort teardown
      }
    }
  });
});
