// Error-severity diagnostics fail EVERY lane, and the two ways to stand one down.
//
// The documented severity line is "Warning = expected drop, fine; Error = will
// throw at runtime, build must fail" — but the dev/test lanes used to reduce
// Error diagnostics to bundler warnings that vitest output swallows, so a
// contradictory format / non-validatable root could sit in a codebase with
// green tests (found during the mion migration: FMT002 param contradictions
// only failed `vite build`). buildStart surfaces ALL diagnostic families and
// halts on Error severity.
//
// A project blocked on a finding has two levers, and neither is a blanket:
//   - `downgradeErrors: ['VL002']` reports those codes as warnings, still
//     printed, still visible, just no longer fatal. `'*'` is the wildcard, for
//     adoption, and is what the retired `failOnError: false` did.
//   - `// @mion-expect-error VL002` above a call site REMOVES that finding, and
//     an unused one is itself an error. Preferred whenever the site is yours.
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
import runtypesRollup from '../src/runtypes/rollup.ts';
import {BIN, hasBinary, writeMarkerPackage} from './helpers/inline.ts';

const FIXTURE_DIR = path.resolve(__dirname, 'tmp-downgrade-errors');
const OUT_DIR = path.join(FIXTURE_DIR, '.mion');

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

// Same project, but downgradeErrors lives in the tsconfig plugin entry — the
// value the Go side echoes on the generate response. A plugin using this
// tsconfig with NO downgradeErrors option must adopt the echo
// (options.downgradeErrors ?? echoed), proving the Go→JS parity, and a LIST
// proves the echo carries more than a boolean ever could.
const TSCONFIG_DOWNGRADE_SRC = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    skipLibCheck: true,
    types: [],
    plugins: [{name: 'mion', downgradeErrors: ['VL002']}],
  },
  include: ['*.ts'],
});

// `createValidateFn<symbol>()` is a root-position non-validatable type → VL002,
// SeverityError (the alwaysThrow lane). The healthy sites prove the halt is
// about the ERROR, not the program shape — and pin the getRunTypeId pairing
// (static form + value-inferred form on equivalent T).
const ERROR_ENTRY_SRC = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
export const bad = createValidateFn<symbol>();
export const goodStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const goodReflected = getRunTypeId(sample);
`;

// The same Error program with a `@mion-expect-error` on the line above the bad
// call. The finding is REMOVED, not downgraded, so nothing prints at all — and
// the healthy marker sites below it still resolve.
const EXPECT_ERROR_SRC = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
// @mion-expect-error VL002
export const bad = createValidateFn<symbol>();
export const goodStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const goodReflected = getRunTypeId(sample);
`;

// A directive over a HEALTHY call: nothing was reported there, so the comment is
// stale and EXP001 fires. This is the check that stops these comments outliving
// the problem they were added for, and it is what a config list can never do.
const STALE_EXPECT_SRC = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
// @mion-expect-error VL002
export const good = createValidateFn<{name: string}>();
export const goodStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const goodReflected = getRunTypeId(sample);
`;

// A function at a PROPERTY position drops with a Warning (VL010-class), never
// an Error — the strict default must NOT halt on it.
const WARNING_ENTRY_SRC = `import {createValidateFn} from '@mionjs/run-types';
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
import {createValidateFn} from '@mionjs/run-types';
export const isUser = createValidateFn<User>();
`;

// Two different types sharing one short type id — MKR014, SeverityError, so the
// build stops instead of naming two types' functions the same thing. Type ids
// are exactly hashLength characters, and the first one is always a letter, so
// hashLength 1 leaves 52 possible ids: a union of 60 string literals mints more
// ids than that and the collision is certain rather than lucky. (Marker rule:
// both getRunTypeId call shapes are exercised, static and value-inferred.)
const TSCONFIG_HASHLENGTH1_SRC = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    skipLibCheck: true,
    types: [],
    plugins: [{name: 'mion', hashLength: 1}],
  },
  include: ['*.ts'],
});

const COLLISION_ENTRY_SRC = `import {getRunTypeId} from '@mionjs/run-types';
type Big = ${Array.from({length: 60}, (_, i) => `'v${i}'`).join(' | ')};
export const staticForm = getRunTypeId<Big>();
const sample: Big = 'v0';
export const reflectedForm = getRunTypeId(sample);
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

function makePlugin(entryDir: string, extra?: Record<string, unknown>) {
  return runtypesRollup({
    binary: BIN,
    cwd: entryDir,
    tsconfig: 'tsconfig.json',
    genDir: path.join(entryDir, '.mion'),
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
// Error program whose downgradeErrors comes from the tsconfig, not a plugin option.
const TSCONFIG_DOWNGRADE_DIR = path.join(FIXTURE_DIR, 'tsconfig-downgrade-program');
const COLLISION_DIR = path.join(FIXTURE_DIR, 'type-id-collision-program');
const EXPECT_ERROR_DIR = path.join(FIXTURE_DIR, 'expect-error-program');
const STALE_EXPECT_DIR = path.join(FIXTURE_DIR, 'stale-expect-program');

describe('downgradeErrors — Error-severity diagnostics fail the build in every lane', () => {
  const register = hasBinary() ? it : it.skip;

  beforeAll(() => {
    fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
    writeFixture(ERROR_DIR, ERROR_ENTRY_SRC);
    writeFixture(WARNING_DIR, WARNING_ENTRY_SRC);
    writeFixture(UNRESOLVED_DIR, UNRESOLVED_IMPORT_SRC);
    writeFixture(TSCONFIG_DOWNGRADE_DIR, ERROR_ENTRY_SRC, TSCONFIG_DOWNGRADE_SRC);
    writeFixture(COLLISION_DIR, COLLISION_ENTRY_SRC, TSCONFIG_HASHLENGTH1_SRC);
    writeFixture(EXPECT_ERROR_DIR, EXPECT_ERROR_SRC);
    writeFixture(STALE_EXPECT_DIR, STALE_EXPECT_SRC);
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

  register("downgradeErrors: '*' — same program boots; the finding still prints, as a warning", async () => {
    const plugin = makePlugin(ERROR_DIR, {downgradeErrors: '*'});
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx);
      const all = ctx.warnings.join('\n');
      // Downgraded, not hidden: the label flips and the note says why.
      expect(all).toContain('warning VL002');
      expect(all).toContain('(downgraded)');
      expect(all).not.toContain('error VL002');
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

  register('downgradeErrors names ONE code: that code stops halting, the rest do not', async () => {
    const plugin = makePlugin(ERROR_DIR, {downgradeErrors: ['VL002']});
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx);
      expect(ctx.warnings.join('\n')).toContain('warning VL002');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('a code the list does not name still halts — this is the whole point', async () => {
    // MKR007 is a different Error in a different program. Naming VL002 must not
    // buy amnesty for it, the way the retired blanket did.
    const plugin = makePlugin(UNRESOLVED_DIR, {downgradeErrors: ['VL002']});
    const ctx = makeCtx();
    try {
      await expect(callHook(plugin.buildStart, ctx) as Promise<void>).rejects.toThrow(/unsupported-type error/);
      expect(ctx.warnings.join('\n')).toContain('error MKR007');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('a `@mion-expect-error` comment removes the finding outright', async () => {
    const plugin = makePlugin(EXPECT_ERROR_DIR);
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx); // must NOT throw — the finding is gone
      const all = ctx.warnings.join('\n');
      expect(all).not.toContain('VL002');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('an unused `@mion-expect-error` is itself an error (EXP001)', async () => {
    const plugin = makePlugin(STALE_EXPECT_DIR);
    const ctx = makeCtx();
    try {
      await expect(callHook(plugin.buildStart, ctx) as Promise<void>).rejects.toThrow(/unsupported-type error/);
      expect(ctx.warnings.join('\n')).toContain('error EXP001');
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

  register('default (strict): two types sharing one short id halt, naming both and hashLength (MKR014)', async () => {
    const plugin = makePlugin(COLLISION_DIR);
    const ctx = makeCtx();
    try {
      await expect(callHook(plugin.buildStart, ctx) as Promise<void>).rejects.toThrow(/unsupported-type error/);
      const all = ctx.warnings.join('\n');
      expect(all).toContain('error MKR014');
      // The option to change, and the value to change it to (1 + 1).
      expect(all).toContain('hashLength');
      expect(all).toContain('to 2');
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

  register('tsconfig downgradeErrors (echoed, no plugin option) downgrades the same Error', async () => {
    // The value comes ONLY from the tsconfig plugin entry, so a build that does
    // not halt proves the echo reached the dependency-free host
    // (options.downgradeErrors ?? echoed).
    const plugin = makePlugin(TSCONFIG_DOWNGRADE_DIR);
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx); // must NOT throw — the echo downgraded it
      expect(ctx.warnings.join('\n')).toContain('warning VL002');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('an explicit plugin option overrides the tsconfig echo (option > echo)', async () => {
    // The tsconfig downgrades VL002; the plugin names a different code, so
    // VL002 is strict again. An explicit option REPLACES the echo, never merges.
    const plugin = makePlugin(TSCONFIG_DOWNGRADE_DIR, {downgradeErrors: ['MKR007']});
    const ctx = makeCtx();
    try {
      await expect(callHook(plugin.buildStart, ctx) as Promise<void>).rejects.toThrow(/unsupported-type error/);
      expect(ctx.warnings.join('\n')).toContain('error VL002');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  // Config-shape checks: these throw at the host boundary, before any build, so
  // they need no binary and run everywhere.
  it('rejects a downgradeErrors code that is not in the catalog', () => {
    expect(() => makePlugin(ERROR_DIR, {downgradeErrors: ['VL2']})).toThrow(/unknown diagnostic code/);
  });

  it('rejects a pure-function code: those mean generation failed', () => {
    expect(() => makePlugin(ERROR_DIR, {downgradeErrors: ['PFE9006']})).toThrow(/cannot downgrade PFE9006/);
  });

  it('accepts a Warning code and does nothing with it', () => {
    // A code's severity can soften between releases; a list entry going inert
    // must never break a consumer's build.
    expect(() => makePlugin(ERROR_DIR, {downgradeErrors: ['VL011']})).not.toThrow();
  });

  it('names the replacement when a config still passes the removed failOnError', () => {
    expect(() => makePlugin(ERROR_DIR, {failOnError: false})).toThrow(/`failOnError` was removed/);
  });
});
