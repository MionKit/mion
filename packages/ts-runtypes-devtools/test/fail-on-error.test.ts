// Error-severity diagnostics fail EVERY lane (the failOnError contract).
//
// The documented severity line is "Warning = expected drop, fine; Error = will
// throw at runtime, build must fail" — but the dev/test lanes used to reduce
// Error diagnostics to bundler warnings that vitest output swallows, so a
// contradictory format / non-validatable root could sit in a codebase with
// green tests (found during the mion migration: FMT002 param contradictions
// only failed `vite build`). buildStart now surfaces ALL diagnostic families
// and halts on Error severity by default (failOnError: true); programs that
// deliberately contain error-case types (like the marker package's own
// alwaysThrow suites) opt out with failOnError: false and keep warnings-only.
//
// Driven through the rollup entry's hooks with a Rollup-like ctx whose
// `error()` throws — exactly how Rollup/Vite/vitest react to ctx.error in
// buildStart (the vitest project fails to boot, naming the diagnostics).
//
// (Marker coverage rule: the healthy fixture pins BOTH getRunTypeId call
// shapes resolving to one entry while the halt semantics are exercised.)
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import runtypesRollup from '../src/rollup.ts';
import {BIN, hasBinary, writeMarkerPackage} from './helpers/inline.ts';

const FIXTURE_DIR = path.resolve(__dirname, 'tmp-fail-on-error');
const OUT_DIR = path.join(FIXTURE_DIR, '__runtypes');

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

// Same project, but failOnError:false lives in the tsconfig plugin entry — the
// value the Go side echoes on the generate response. A plugin using this tsconfig
// with NO failOnError option must adopt the echo (options.failOnError ?? echoed
// ?? true), proving the Go→JS failOnError parity.
const TSCONFIG_FAILOFF_SRC = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    skipLibCheck: true,
    types: [],
    plugins: [{name: 'ts-runtypes', failOnError: false}],
  },
  include: ['*.ts'],
});

// `createValidateFn<symbol>()` is a root-position non-validatable type → VL002,
// SeverityError (the alwaysThrow lane). The healthy sites prove the halt is
// about the ERROR, not the program shape — and pin the getRunTypeId pairing
// (static form + value-inferred form on equivalent T).
const ERROR_ENTRY_SRC = `import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
export const bad = createValidateFn<symbol>();
export const goodStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const goodReflected = getRunTypeId(sample);
`;

// A function at a PROPERTY position drops with a Warning (VL010-class), never
// an Error — the strict default must NOT halt on it.
const WARNING_ENTRY_SRC = `import {createValidateFn} from '@ts-runtypes/core';
interface WithHandler {
  name: string;
  onClick: () => void;
}
export const isWithHandler = createValidateFn<WithHandler>();
`;

// An import the scan program can't resolve degrades the marker's T to \`any\`
// (the silent always-true-validator trap) — MKR007, SeverityError, so the
// strict default halts the build naming the unresolved specifier.
const UNRESOLVED_IMPORT_SRC = `import {User} from './missing-module';
import {createValidateFn} from '@ts-runtypes/core';
export const isUser = createValidateFn<User>();
`;

type Hook = ((...args: unknown[]) => unknown) | {handler: (...args: unknown[]) => unknown};
const callHook = (hook: Hook, thisArg: unknown, ...args: unknown[]): unknown =>
  typeof hook === 'function' ? hook.apply(thisArg, args) : hook.handler.apply(thisArg, args);

function makeCtx() {
  const warnings: string[] = [];
  return {
    warnings,
    warn(message: string): void {
      warnings.push(String(message));
    },
    error(message: string): never {
      throw new Error(String(message));
    },
  };
}

function makePlugin(entryDir: string, extra?: {failOnError?: boolean}) {
  return runtypesRollup({
    binary: BIN,
    cwd: entryDir,
    tsconfig: 'tsconfig.json',
    genDir: path.join(entryDir, '__runtypes'),
    ...extra,
  }) as any;
}

function writeFixture(dir: string, entrySrc: string, tsconfigSrc: string = TSCONFIG_SRC): void {
  fs.rmSync(dir, {recursive: true, force: true});
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), tsconfigSrc);
  writeMarkerPackage(dir);
  fs.writeFileSync(path.join(dir, 'entry.ts'), entrySrc);
}

const ERROR_DIR = path.join(FIXTURE_DIR, 'error-program');
const WARNING_DIR = path.join(FIXTURE_DIR, 'warning-program');
const UNRESOLVED_DIR = path.join(FIXTURE_DIR, 'unresolved-import-program');
// Error program whose failOnError:false comes from the tsconfig, not a plugin option.
const TSCONFIG_FAILOFF_DIR = path.join(FIXTURE_DIR, 'tsconfig-failoff-program');

describe('failOnError — Error-severity diagnostics fail the build in every lane', () => {
  const register = hasBinary() ? it : it.skip;

  beforeAll(() => {
    fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
    writeFixture(ERROR_DIR, ERROR_ENTRY_SRC);
    writeFixture(WARNING_DIR, WARNING_ENTRY_SRC);
    writeFixture(UNRESOLVED_DIR, UNRESOLVED_IMPORT_SRC);
    writeFixture(TSCONFIG_FAILOFF_DIR, ERROR_ENTRY_SRC, TSCONFIG_FAILOFF_SRC);
  });
  afterAll(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  register('default (strict): buildStart halts on an Error diagnostic, naming it in the warn log first', async () => {
    const plugin = makePlugin(ERROR_DIR);
    const ctx = makeCtx();
    try {
      await expect(callHook(plugin.buildStart, ctx) as Promise<void>).rejects.toThrow(/unsupported-type error/);
      // Every diagnostic surfaced BEFORE the halt so the log names the call site.
      const all = ctx.warnings.join('\n');
      expect(all).toContain('error VL002');
      expect(all).toContain('entry.ts');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('failOnError: false — same program boots; diagnostics surface as warnings only', async () => {
    const plugin = makePlugin(ERROR_DIR, {failOnError: false});
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx);
      const all = ctx.warnings.join('\n');
      expect(all).toContain('error VL002');
      // The transform still runs — the healthy sites inject; both getRunTypeId
      // call shapes resolve through the SAME entry module import.
      const transformed = (await callHook(plugin.transform, ctx, ERROR_ENTRY_SRC, path.join(ERROR_DIR, 'entry.ts'))) as {
        code: string;
      } | null;
      expect(transformed).toBeTruthy();
      expect(transformed!.code).toContain('getRunTypeId');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('default (strict): an unresolved import degrading T to `any` halts, naming the specifier (MKR007)', async () => {
    const plugin = makePlugin(UNRESOLVED_DIR);
    const ctx = makeCtx();
    try {
      await expect(callHook(plugin.buildStart, ctx) as Promise<void>).rejects.toThrow(/unsupported-type error/);
      const all = ctx.warnings.join('\n');
      expect(all).toContain('error MKR007');
      expect(all).toContain('./missing-module');
      expect(all).toContain('entry.ts');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('default (strict): WARNING-severity diagnostics never halt (the Warning/Error line)', async () => {
    const plugin = makePlugin(WARNING_DIR);
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx); // must not throw
      const all = ctx.warnings.join('\n');
      expect(all).toContain('warning');
      expect(all).not.toContain('error VL');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('tsconfig failOnError:false (echoed, no plugin option) downgrades the same Error to warnings only', async () => {
    // failOnError comes ONLY from the tsconfig plugin entry; the plugin sets no
    // failOnError option, so the halt default can only be the echoed tsconfig
    // value (options.failOnError ?? echoed ?? true).
    const plugin = makePlugin(TSCONFIG_FAILOFF_DIR);
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx); // must NOT throw — the echo downgraded it
      expect(ctx.warnings.join('\n')).toContain('error VL002');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('plugin failOnError:true overrides a tsconfig failOnError:false (option > echo)', async () => {
    const plugin = makePlugin(TSCONFIG_FAILOFF_DIR, {failOnError: true});
    const ctx = makeCtx();
    try {
      await expect(callHook(plugin.buildStart, ctx) as Promise<void>).rejects.toThrow(/unsupported-type error/);
      expect(ctx.warnings.join('\n')).toContain('error VL002');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });
});
