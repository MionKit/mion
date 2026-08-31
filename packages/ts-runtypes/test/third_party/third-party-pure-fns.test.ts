// Third-party pure-fn registration through node_modules — the pure-fn twin of
// third-party-node-modules.test.ts, and the regression suite for the extraction
// pre-filter fix (renamed imports + branded wrapper factories).
//
// Setup: a framework package installed in node_modules (`@acme/toolkit`) that
//   1. RE-EXPORTS registerPureFnFactory from '@mionjs/run-types' (the barrel a
//      framework proxy package like @mionjs/run-types ships), and
//   2. declares its own definePureFn() wrapper whose params carry the SAME
//      brands (CompTimeArgs<PureFnId> + PureFunction<F>).
//
// The consumer imports both — the re-export RENAMED, plus the wrapper — and
// never names '@mionjs/run-types'. Extraction used to gate on the literal
// callee text `registerPureFnFactory`, so BOTH call shapes silently fell back
// to runtime registration (no bodyHash, no purity checks, no shippable code).
// The walker now pre-filters on callee-name OR a "<ns>::<name>"-shaped first
// argument and lets the brand check decide, so both call sites extract and get
// their factory argument rewritten to the generated `__rt_pf…` binding.
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import runtypesRollup from '../../../ts-runtypes-devtools/src/rollup.ts';
import {BIN, hasBinary, writeMarkerPackage} from '../../../ts-runtypes-devtools/test/helpers/inline.ts';

let FIXTURE_DIR = '';
let CONSUMER = '';

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

// The framework surface: barrel re-export + a branded wrapper. Only this file
// names '@mionjs/run-types', and it lives in node_modules.
const TOOLKIT_DTS = `import type {CompTimeArgs, PureFunction, PureFnId} from '@mionjs/run-types';
export {registerPureFnFactory} from '@mionjs/run-types';
export type Factory = (utl: unknown) => (...args: any[]) => any;
export declare function definePureFn<F extends Factory>(
  pureFnId: CompTimeArgs<PureFnId>,
  createPureFn: PureFunction<F> | null,
): unknown;
`;

const TOOLKIT_JS = `export {registerPureFnFactory} from '@mionjs/run-types';
export function definePureFn(pureFnId, createPureFn) {
  return {pureFnId, createPureFn};
}
`;

// The consumer: a RENAMED re-export call + a wrapper call. Neither callee is
// spelled `registerPureFnFactory`, and the file never names '@mionjs/run-types'.
const CONSUMER_SRC = `import {definePureFn, registerPureFnFactory as regPF} from '@acme/toolkit';

export const doubled = regPF('mionjs::doubled', () => (n: number) => n * 2);
export const tripled = definePureFn('mionjs::tripled', () => (n: number) => n * 3);
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

describe('third-party pure fns: renamed re-export + branded wrapper (node_modules)', () => {
  const register = hasBinary() ? it : it.skip;

  beforeAll(() => {
    FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-third-party-pf-'));
    CONSUMER = path.join(FIXTURE_DIR, 'consumer.ts');
    const toolkitDir = path.join(FIXTURE_DIR, 'node_modules', '@acme', 'toolkit');
    fs.mkdirSync(toolkitDir, {recursive: true});
    fs.writeFileSync(path.join(FIXTURE_DIR, 'tsconfig.json'), TSCONFIG_SRC);
    writeMarkerPackage(FIXTURE_DIR);
    fs.writeFileSync(CONSUMER, CONSUMER_SRC);
    fs.writeFileSync(path.join(toolkitDir, 'package.json'), TOOLKIT_PKG_JSON);
    fs.writeFileSync(path.join(toolkitDir, 'index.d.ts'), TOOLKIT_DTS);
    fs.writeFileSync(path.join(toolkitDir, 'index.js'), TOOLKIT_JS);
  });
  afterAll(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  register('renamed re-export and wrapper call sites are extracted and rewritten', async () => {
    expect(CONSUMER_SRC).not.toContain('@mionjs/run-types');

    const plugin = makePlugin();
    try {
      await callHook(plugin.buildStart, ctx);

      const transformed = (await callHook(plugin.transform, ctx, CONSUMER_SRC, CONSUMER)) as {code: string} | null;
      expect(transformed, 'pure-fn consumer of a node_modules framework must be transformed').toBeTruthy();
      const code = transformed!.code;

      // Both factory arguments are replaced with generated __rt_pf… bindings.
      const renamedMatch = code.match(/regPF\('mionjs::doubled',\s*(__rt_pf[A-Za-z0-9_$]*)\)/);
      expect(renamedMatch, `renamed re-export call must carry a pf binding in:\n${code}`).toBeTruthy();
      const wrapperMatch = code.match(/definePureFn\('mionjs::tripled',\s*(__rt_pf[A-Za-z0-9_$]*)\)/);
      expect(wrapperMatch, `branded wrapper call must carry a pf binding in:\n${code}`).toBeTruthy();

      // Every injected binding resolves to a real generated module on disk.
      const imports = [...code.matchAll(/import \{([^}]*)\} from '(\.\.?\/[^']+\.js)'/g)];
      const importedBindings = imports.flatMap((m) => m[1].split(',').map((s) => s.trim()));
      for (const binding of [renamedMatch![1], wrapperMatch![1]]) {
        expect(importedBindings, `binding ${binding} must be imported`).toContain(binding);
      }
      for (const m of imports) {
        const moduleFile = path.resolve(path.dirname(CONSUMER), m[2]);
        expect(fs.existsSync(moduleFile), `injected import ${m[2]} must point at a written module`).toBe(true);
      }
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort teardown
      }
    }
  });
});
