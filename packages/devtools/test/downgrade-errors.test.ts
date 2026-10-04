// Error-severity diagnostics fail EVERY lane, and the two ways to stand one down.
//
// The documented severity line is "Warning = expected drop, fine; Error = will
// throw at runtime, build must fail", and it holds in every lane: a diagnostic
// reduced to a bundler warning is one vitest output swallows, which would let a
// contradictory format or a non-validatable root sit in a codebase with green
// tests. buildStart surfaces ALL diagnostic families and halts on Error severity.
//
// A project blocked on a finding has two levers, and neither is a blanket:
//   - `downgradeErrors: ['validate-symbol-root']` reports those codes as warnings, still
//     printed, still visible, just no longer fatal. `'*'` is the wildcard, for
//     adoption.
//   - `// @mion-expect-error validate-symbol-root` above a call site REMOVES that finding, and
//     an unused one is itself an error. Preferred whenever the site is yours.
//
// Driven through the rollup entry's hooks with a Rollup-like ctx whose
// `error()` throws — exactly how Rollup/Vite/vitest react to ctx.error in
// buildStart (the vitest project fails to boot, naming the diagnostics).
//
// (Marker coverage rule: the healthy fixture pins BOTH getRunTypeId call
// shapes resolving to one entry while the halt semantics are exercised.)
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import runtypesRollup from '../src/runtypes/rollup.ts';
import runtypesVite from '../src/runtypes/vite.ts';
import {BIN, callHook, hasBinary, writeMarkerPackage} from './helpers/inline.ts';

const FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-downgrade-errors-'));
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
    plugins: [{name: 'mion', downgradeErrors: ['validate-symbol-root']}],
  },
  include: ['*.ts'],
});

// `createValidateFn<symbol>()` is a root-position non-validatable type → validate-symbol-root,
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
// @mion-expect-error validate-symbol-root
export const bad = createValidateFn<symbol>();
export const goodStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const goodReflected = getRunTypeId(sample);
`;

// A directive over a HEALTHY call: nothing was reported there, so the comment is
// stale and comment-expect-error-unused fires. This is the check that stops these comments outliving
// the problem they were added for, and it is what a config list can never do.
const STALE_EXPECT_SRC = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
// @mion-expect-error validate-symbol-root
export const good = createValidateFn<{name: string}>();
export const goodStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const goodReflected = getRunTypeId(sample);
`;

// The same Error program with a `@mion-downgrade-error` on the line above the
// bad call. Unlike expect-error the finding is KEPT and printed with the
// `(downgraded)` note; it just stops halting. That is what a deliberately broken
// type wants: the finding is true and worth seeing.
const DOWNGRADE_ERROR_SRC = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
// @mion-downgrade-error validate-symbol-root
export const bad = createValidateFn<symbol>();
export const goodStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const goodReflected = getRunTypeId(sample);
`;

// A downgrade directive over a HEALTHY call: nothing was reported there, so the
// comment is stale and comment-downgrade-error-unused fires.
const STALE_DOWNGRADE_SRC = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
// @mion-downgrade-error validate-symbol-root
export const good = createValidateFn<{name: string}>();
export const goodStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const goodReflected = getRunTypeId(sample);
`;

// File scope: a block comment before any code covers every line; two bad calls, so one comment answers both.
const FILE_EXPECT_SRC = `/* @mion-expect-error validate-symbol-root */
import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
export const firstBad = createValidateFn<symbol>();
export const secondBad = createValidateFn<symbol>();
export const goodStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const goodReflected = getRunTypeId(sample);
`;

const FILE_DOWNGRADE_SRC = `/* @mion-downgrade-error validate-symbol-root */
import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
export const firstBad = createValidateFn<symbol>();
export const secondBad = createValidateFn<symbol>();
export const goodStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const goodReflected = getRunTypeId(sample);
`;

// Nothing here raises validate-symbol-root, so the file directive is stale and reports the same way a line one does.
const STALE_FILE_SRC = `/* @mion-expect-error validate-symbol-root */
import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
export const good = createValidateFn<{name: string}>();
export const goodStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const goodReflected = getRunTypeId(sample);
`;

// A function at a PROPERTY position drops with an Info, so the strict default must NOT halt on it.
const WARNING_ENTRY_SRC = `import {createValidateFn} from '@mionjs/run-types';
interface WithHandler {
  name: string;
  onClick: () => void;
}
export const isWithHandler = createValidateFn<WithHandler>();
`;

// An import the scan program can't resolve degrades the marker's T to \`any\`
// (the silent always-true-validator trap) — marker-any-from-unresolved-import, SeverityError, so the
// strict default halts the build naming the unresolved specifier.
const UNRESOLVED_IMPORT_SRC = `import {User} from './missing-module';
import {createValidateFn} from '@mionjs/run-types';
export const isUser = createValidateFn<User>();
`;

// Two different types sharing one short type id — marker-type-id-collision, SeverityError, so the
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

// The Go side echoes this tsconfig `levels` to the plugin.
const TSCONFIG_LEVELS_SRC = JSON.stringify({
  compilerOptions: {...JSON.parse(TSCONFIG_SRC).compilerOptions, plugins: [{name: 'mion', levels: 'all'}]},
  include: ['*.ts'],
});

const TSCONFIG_LOG_STYLE_SRC = JSON.stringify({
  compilerOptions: {...JSON.parse(TSCONFIG_SRC).compilerOptions, plugins: [{name: 'mion', levels: 'all', logStyle: 'lines'}]},
  include: ['*.ts'],
});

const COLLISION_ENTRY_SRC = `import {getRunTypeId} from '@mionjs/run-types';
type Big = ${Array.from({length: 60}, (_, i) => `'v${i}'`).join(' | ')};
export const staticForm = getRunTypeId<Big>();
const sample: Big = 'v0';
export const reflectedForm = getRunTypeId(sample);
`;

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
const TSCONFIG_LEVELS_DIR = path.join(FIXTURE_DIR, 'tsconfig-levels-program');
const TSCONFIG_LOG_STYLE_DIR = path.join(FIXTURE_DIR, 'tsconfig-log-style-program');
const TSCONFIG_BAD_LOG_STYLE_DIR = path.join(FIXTURE_DIR, 'tsconfig-bad-log-style-program');
const EXPECT_ERROR_DIR = path.join(FIXTURE_DIR, 'expect-error-program');
const STALE_EXPECT_DIR = path.join(FIXTURE_DIR, 'stale-expect-program');
const DOWNGRADE_ERROR_DIR = path.join(FIXTURE_DIR, 'downgrade-error-program');
const STALE_DOWNGRADE_DIR = path.join(FIXTURE_DIR, 'stale-downgrade-program');
const FILE_EXPECT_DIR = path.join(FIXTURE_DIR, 'file-expect-program');
const FILE_DOWNGRADE_DIR = path.join(FIXTURE_DIR, 'file-downgrade-program');
const STALE_FILE_DIR = path.join(FIXTURE_DIR, 'stale-file-program');

describe('downgradeErrors — Error-severity diagnostics fail the build in every lane', () => {
  const register = hasBinary() ? it : it.skip;

  beforeAll(() => {
    fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
    writeFixture(ERROR_DIR, ERROR_ENTRY_SRC);
    writeFixture(WARNING_DIR, WARNING_ENTRY_SRC);
    writeFixture(TSCONFIG_LEVELS_DIR, WARNING_ENTRY_SRC, TSCONFIG_LEVELS_SRC);
    writeFixture(TSCONFIG_LOG_STYLE_DIR, WARNING_ENTRY_SRC, TSCONFIG_LOG_STYLE_SRC);
    writeFixture(TSCONFIG_BAD_LOG_STYLE_DIR, WARNING_ENTRY_SRC, TSCONFIG_LOG_STYLE_SRC.replace('"lines"', '"line"'));
    writeFixture(UNRESOLVED_DIR, UNRESOLVED_IMPORT_SRC);
    writeFixture(TSCONFIG_DOWNGRADE_DIR, ERROR_ENTRY_SRC, TSCONFIG_DOWNGRADE_SRC);
    writeFixture(COLLISION_DIR, COLLISION_ENTRY_SRC, TSCONFIG_HASHLENGTH1_SRC);
    writeFixture(EXPECT_ERROR_DIR, EXPECT_ERROR_SRC);
    writeFixture(STALE_EXPECT_DIR, STALE_EXPECT_SRC);
    writeFixture(DOWNGRADE_ERROR_DIR, DOWNGRADE_ERROR_SRC);
    writeFixture(STALE_DOWNGRADE_DIR, STALE_DOWNGRADE_SRC);
    writeFixture(FILE_EXPECT_DIR, FILE_EXPECT_SRC);
    writeFixture(FILE_DOWNGRADE_DIR, FILE_DOWNGRADE_SRC);
    writeFixture(STALE_FILE_DIR, STALE_FILE_SRC);
  });
  afterAll(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  register('default (strict): buildStart halts on an Error diagnostic, naming it in the warn log first', async () => {
    const plugin = makePlugin(ERROR_DIR);
    const ctx = makeCtx();
    try {
      await expect(callHook(plugin.buildStart, ctx) as Promise<void>).rejects.toThrow(/build stopped on \d+ mion error/);
      // Every diagnostic surfaced BEFORE the halt so the log names the call site.
      const all = ctx.warnings.join('\n');
      expect(all).toContain('error validate-symbol-root');
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
      expect(all).toContain('warning validate-symbol-root');
      expect(all).toContain('(downgraded)');
      expect(all).not.toContain('error validate-symbol-root');
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

  for (const logStyle of ['grouped', 'lines'] as const) {
    register(`a file transform prints its own errors in the ${logStyle} log, then stops`, async () => {
      // The finding exists only in the code handed to the transform, so only the transform reports it.
      const dir = path.join(FIXTURE_DIR, `drifted-${logStyle}`);
      writeFixture(dir, WARNING_ENTRY_SRC);
      const drifted = `${WARNING_ENTRY_SRC.replace('{createValidateFn}', '{createValidateFn, getRunTypeId}')}export function makeId<T>() {\n  return getRunTypeId<T>();\n}\n`;
      const plugin = makePlugin(dir, {logStyle});
      const ctx = makeCtx();
      try {
        await callHook(plugin.buildStart, ctx);
        const before = ctx.warnings.length;
        await expect(callHook(plugin.transform, ctx, drifted, path.join(dir, 'entry.ts'))).rejects.toThrow(
          /build stopped on 1 mion error/
        );
        const fresh = ctx.warnings.slice(before).filter((warning) => warning.includes('marker-in-generic-function'));
        expect(fresh).toHaveLength(1);
        if (logStyle === 'grouped') expect(fresh[0]).toMatch(/^error marker-in-generic-function \(1\)\n/);
        else expect(fresh[0]).toMatch(/entry\.ts\(\d+,\d+\): error marker-in-generic-function: /);
      } finally {
        await callHook(plugin.buildEnd, ctx);
      }
    });
  }

  for (const logStyle of ['grouped', 'lines'] as const) {
    register(`a watch rebuild prints an edit's findings in the ${logStyle} log, and never stops`, async () => {
      const dir = path.join(FIXTURE_DIR, `watch-${logStyle}`);
      writeFixture(dir, WARNING_ENTRY_SRC);
      const plugin = makePlugin(dir, {logStyle});
      const ctx = makeCtx();
      try {
        await callHook(plugin.buildStart, ctx);
        const before = ctx.warnings.length;
        const entry = path.join(dir, 'entry.ts');
        const edited = `${WARNING_ENTRY_SRC.replace('{createValidateFn}', '{createValidateFn, getRunTypeId}')}export function makeId<T>() {\n  return getRunTypeId<T>();\n}\n`;
        fs.writeFileSync(entry, edited);
        await plugin.rtHotUpdate(ctx, [{file: entry, content: edited}]);
        const fresh = ctx.warnings.slice(before).filter((warning) => warning.includes('marker-in-generic-function'));
        expect(fresh).toHaveLength(1);
        if (logStyle === 'grouped') expect(fresh[0]).toMatch(/^error marker-in-generic-function \(1\)\n/);
        else expect(fresh[0]).toMatch(/entry\.ts\(\d+,\d+\): error marker-in-generic-function: /);
      } finally {
        await callHook(plugin.buildEnd, ctx);
      }
    });
  }

  register('a bad tsconfig logStyle stops the build when buildStart adopts it', async () => {
    const plugin = makePlugin(TSCONFIG_BAD_LOG_STYLE_DIR);
    const ctx = makeCtx();
    try {
      await expect(callHook(plugin.buildStart, ctx)).rejects.toThrow(/invalid logStyle "line"/);
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('downgradeErrors names ONE code: that code stops halting, the rest do not', async () => {
    const plugin = makePlugin(ERROR_DIR, {downgradeErrors: ['validate-symbol-root']});
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx);
      expect(ctx.warnings.join('\n')).toContain('warning validate-symbol-root');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('a code the list does not name still halts — this is the whole point', async () => {
    // marker-any-from-unresolved-import is a different Error in a different program. Naming validate-symbol-root must not
    // buy amnesty for it.
    const plugin = makePlugin(UNRESOLVED_DIR, {downgradeErrors: ['validate-symbol-root']});
    const ctx = makeCtx();
    try {
      await expect(callHook(plugin.buildStart, ctx) as Promise<void>).rejects.toThrow(/build stopped on \d+ mion error/);
      expect(ctx.warnings.join('\n')).toContain('error marker-any-from-unresolved-import');
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
      expect(all).not.toContain('validate-symbol-root');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('an unused `@mion-expect-error` is reported but does not halt (comment-expect-error-unused)', async () => {
    // The build emits, and what it emitted is CORRECT: the only thing wrong is a
    // comment. mion does not copy TypeScript here, where the same finding is an
    // error, because in mion an error fails a build.
    const plugin = makePlugin(STALE_EXPECT_DIR);
    const ctx = makeCtx();
    try {
      // ctx.error() throws, so a build that returns at all did not halt.
      await callHook(plugin.buildStart, ctx);
      expect(ctx.warnings.join('\n')).toContain('warning comment-expect-error-unused');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('a `@mion-downgrade-error` comment keeps the finding printing and stops it halting', async () => {
    // No downgradeErrors is configured here on purpose: a source directive
    // stands its own finding down whatever the build was configured with.
    const plugin = makePlugin(DOWNGRADE_ERROR_DIR);
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx); // must NOT throw
      const all = ctx.warnings.join('\n');
      expect(all).toContain('warning validate-symbol-root');
      expect(all).toContain('(downgraded)');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('an unused `@mion-downgrade-error` is reported but does not halt (comment-downgrade-error-unused)', async () => {
    const plugin = makePlugin(STALE_DOWNGRADE_DIR);
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx);
      expect(ctx.warnings.join('\n')).toContain('warning comment-downgrade-error-unused');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('a block comment at the top of a file removes the finding at every site in it', async () => {
    const plugin = makePlugin(FILE_EXPECT_DIR);
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx); // must NOT throw — both findings are gone
      expect(ctx.warnings.join('\n')).not.toContain('validate-symbol-root');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('a file-scope `@mion-downgrade-error` keeps both findings printing and stops the halt', async () => {
    const plugin = makePlugin(FILE_DOWNGRADE_DIR);
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx); // must NOT throw
      const all = ctx.warnings.join('\n');
      expect(all).toContain('warning validate-symbol-root');
      expect(all).toContain('(downgraded)');
      expect(all).not.toContain('error validate-symbol-root');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('an unused file directive is reported but does not halt (comment-expect-error-unused)', async () => {
    const plugin = makePlugin(STALE_FILE_DIR);
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx);
      expect(ctx.warnings.join('\n')).toContain('warning comment-expect-error-unused');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register(
    'default (strict): an unresolved import degrading T to `any` halts, naming the specifier (marker-any-from-unresolved-import)',
    async () => {
      const plugin = makePlugin(UNRESOLVED_DIR);
      const ctx = makeCtx();
      try {
        await expect(callHook(plugin.buildStart, ctx) as Promise<void>).rejects.toThrow(/build stopped on \d+ mion error/);
        const all = ctx.warnings.join('\n');
        expect(all).toContain('error marker-any-from-unresolved-import');
        expect(all).toContain('./missing-module');
        expect(all).toContain('entry.ts');
      } finally {
        await callHook(plugin.buildEnd, ctx);
      }
    }
  );

  register(
    'default (strict): two types sharing one short id halt, naming both and hashLength (marker-type-id-collision)',
    async () => {
      const plugin = makePlugin(COLLISION_DIR);
      const ctx = makeCtx();
      try {
        await expect(callHook(plugin.buildStart, ctx) as Promise<void>).rejects.toThrow(/build stopped on \d+ mion error/);
        const all = ctx.warnings.join('\n');
        expect(all).toContain('error marker-type-id-collision');
        // The option to change, and the value to change it to (1 + 1).
        expect(all).toContain('hashLength');
        expect(all).toContain('to 2');
        expect(all).toContain('entry.ts');
      } finally {
        await callHook(plugin.buildEnd, ctx);
      }
    }
  );

  register('default: an Info diagnostic (validate-method-dropped, a skipped method) never halts and is not printed', async () => {
    const plugin = makePlugin(WARNING_DIR);
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx); // must not throw
      expect(ctx.warnings.join('\n')).not.toContain('validate-method-dropped');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register("levels: 'all' prints the Info diagnostic with the info label, and it still never halts", async () => {
    const plugin = makePlugin(WARNING_DIR, {levels: 'all', logStyle: 'lines'});
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx); // must not throw
      const all = ctx.warnings.join('\n');
      expect(all).toMatch(/entry\.ts\(\d+,\d+\): info validate-method-dropped: /);
      expect(all).not.toContain('error validate-');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('grouped by default: one warning holds every finding, each name once', async () => {
    const plugin = makePlugin(WARNING_DIR, {levels: 'all'});
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx);
      expect(ctx.warnings).toHaveLength(1);
      expect(ctx.warnings[0]).toMatch(/^info validate-method-dropped \(\d+\)$/m);
      expect(ctx.warnings[0]).toMatch(/^ {4}entry\.ts:\d+:\d+/m);
      expect(ctx.warnings[0]).toMatch(/^mion: .*info in 1 file$/m);
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('a halting build prints one grouped block, then stops with the same message as before', async () => {
    const plugin = makePlugin(ERROR_DIR);
    const ctx = makeCtx();
    try {
      await expect(callHook(plugin.buildStart, ctx)).rejects.toThrow(
        /build stopped on \d+ mion errors?\. First: .*\(\d+,\d+\): error /
      );
      expect(ctx.warnings).toHaveLength(1);
      expect(ctx.warnings[0]).toMatch(/^error [a-z-]+ \(\d+\)$/m);
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register("tsconfig logStyle: 'lines' (echoed, no plugin option) prints one warning per finding", async () => {
    const plugin = makePlugin(TSCONFIG_LOG_STYLE_DIR);
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx);
      expect(ctx.warnings.join('\n')).toMatch(/entry\.ts\(\d+,\d+\): info validate-method-dropped: /);
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  it('refuses a logStyle value other than grouped or lines at the host boundary', () => {
    expect(() => makePlugin(WARNING_DIR, {logStyle: 'line'})).toThrow(/invalid logStyle "line"/);
  });

  register("tsconfig levels: 'all' (echoed, no plugin option) prints Info too", async () => {
    const plugin = makePlugin(TSCONFIG_LEVELS_DIR);
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx);
      expect(ctx.warnings.join('\n')).toContain('info validate-method-dropped');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  it('refuses a levels value other than all at the host boundary', () => {
    expect(() => makePlugin(WARNING_DIR, {levels: 'warning'})).toThrow(/invalid levels "warning"/);
  });

  register('tsconfig downgradeErrors (echoed, no plugin option) downgrades the same Error', async () => {
    // The value comes ONLY from the tsconfig plugin entry, so a build that does
    // not halt proves the echo reached the dependency-free host
    // (options.downgradeErrors ?? echoed).
    const plugin = makePlugin(TSCONFIG_DOWNGRADE_DIR);
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx); // must NOT throw — the echo downgraded it
      expect(ctx.warnings.join('\n')).toContain('warning validate-symbol-root');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('an explicit plugin option overrides the tsconfig echo (option > echo)', async () => {
    // The tsconfig downgrades validate-symbol-root; the plugin names a different code, so
    // validate-symbol-root is strict again. An explicit option REPLACES the echo, never merges.
    const plugin = makePlugin(TSCONFIG_DOWNGRADE_DIR, {downgradeErrors: ['marker-any-from-unresolved-import']});
    const ctx = makeCtx();
    try {
      await expect(callHook(plugin.buildStart, ctx) as Promise<void>).rejects.toThrow(/build stopped on \d+ mion error/);
      expect(ctx.warnings.join('\n')).toContain('error validate-symbol-root');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  // Config-shape checks: these throw at the host boundary, before any build, so
  // they need no binary and run everywhere.
  it('rejects a downgradeErrors code that is not in the catalog', () => {
    expect(() => makePlugin(ERROR_DIR, {downgradeErrors: ['VL2']})).toThrow(/unknown diagnostic/);
  });

  it('rejects a fatal Error: the build produces no code for it', () => {
    // The rule is the LEVEL, not the pure-fn family. marker-type-id-collision emits no site and no
    // injected id, so not halting would only ship a call that throws.
    expect(() => makePlugin(ERROR_DIR, {downgradeErrors: ['marker-type-id-collision']})).toThrow(
      /cannot downgrade marker-type-id-collision/
    );
    expect(() => makePlugin(ERROR_DIR, {downgradeErrors: ['rpc-batch-element-unreadable']})).toThrow(
      /cannot downgrade rpc-batch-element-unreadable/
    );
  });

  it('accepts a pure-function purity code: the impure body still ships', () => {
    // purefn-uses-this used to be rejected by family. It compiles the offending body and
    // writes it, so it is a RuntimeError and standing it down is a real choice.
    expect(() => makePlugin(ERROR_DIR, {downgradeErrors: ['purefn-uses-this']})).not.toThrow();
    // purefn-destructured-param is the one pure-fn code that withholds output, so it stays fatal.
    expect(() => makePlugin(ERROR_DIR, {downgradeErrors: ['purefn-destructured-param']})).toThrow(
      /cannot downgrade purefn-destructured-param/
    );
  });

  it('accepts a Warning code and does nothing with it', () => {
    // A code's level can soften between releases; a list entry going inert
    // must never break a consumer's build.
    expect(() => makePlugin(ERROR_DIR, {downgradeErrors: ['validate-method-dropped']})).not.toThrow();
  });
});

// The dev server is the ONE lane a RuntimeError never halts: the code is
// written, it throws when called, and the developer is mid-edit, so the finding
// is reported and the server keeps running. Vite says which lane it is through
// its resolved config: `serve` in `development` is the dev server; vitest runs
// `serve` in `test` mode and is a build lane; `build` is a build lane. A fatal
// Error halts everywhere regardless: no code was produced for that piece.
describe('the dev server reports a RuntimeError without halting; every build lane halts', () => {
  const register = hasBinary() ? it : it.skip;

  beforeAll(() => {
    writeFixture(ERROR_DIR, ERROR_ENTRY_SRC);
    writeFixture(COLLISION_DIR, COLLISION_ENTRY_SRC, TSCONFIG_HASHLENGTH1_SRC);
  });
  afterAll(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  // The dev server prints through its logger, so the resolved config carries one that records.
  const devLog: string[] = [];
  function makeVitePlugin(entryDir: string, command: 'serve' | 'build', mode: string) {
    const plugin = runtypesVite({
      binary: BIN,
      cwd: entryDir,
      tsconfig: 'tsconfig.json',
      genDir: path.join(entryDir, '.mion'),
    }) as any;
    devLog.length = 0;
    const logger = {warn: (message: string) => void devLog.push(message)};
    callHook(plugin.configResolved, plugin, {root: entryDir, command, mode, logger});
    return plugin;
  }

  register('vite serve (development): a RuntimeError is reported as an error and the build goes on', async () => {
    const plugin = makeVitePlugin(ERROR_DIR, 'serve', 'development');
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx); // ctx.error() throws, so returning at all means no halt
      const all = devLog.join('\n');
      // Reported with its real label: not downgraded, not hidden.
      expect(all).toContain('error validate-symbol-root');
      expect(all).not.toContain('(downgraded)');
      // The transform serves the file: the healthy sites still inject.
      const transformed = (await callHook(plugin.transform, ctx, ERROR_ENTRY_SRC, path.join(ERROR_DIR, 'entry.ts'))) as {
        code: string;
      } | null;
      expect(transformed).toBeTruthy();
      expect(transformed!.code).toContain('getRunTypeId');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('vitest (serve command, test mode) is a build lane: it halts', async () => {
    const plugin = makeVitePlugin(ERROR_DIR, 'serve', 'test');
    const ctx = makeCtx();
    try {
      await expect(callHook(plugin.buildStart, ctx) as Promise<void>).rejects.toThrow(/build stopped on \d+ mion error/);
      expect(ctx.warnings.join('\n')).toContain('error validate-symbol-root');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('vite build halts, so a production bundle never ships one', async () => {
    const plugin = makeVitePlugin(ERROR_DIR, 'build', 'production');
    const ctx = makeCtx();
    try {
      await expect(callHook(plugin.buildStart, ctx) as Promise<void>).rejects.toThrow(/build stopped on \d+ mion error/);
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  // The dev server never stops on a finding: a fatal Error prints once, and the transform of its file throws.
  register('a fatal Error (marker-type-id-collision) prints on the dev server without stopping it', async () => {
    const plugin = makeVitePlugin(COLLISION_DIR, 'serve', 'development');
    const ctx = makeCtx();
    try {
      await callHook(plugin.buildStart, ctx);
      expect(devLog.join('\n')).toContain('error marker-type-id-collision');
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });

  register('the devServer option overrides what Vite says', async () => {
    // A host that knows better than the resolved config (a custom dev loop, a
    // test harness) names the lane itself.
    const plugin = runtypesVite({
      binary: BIN,
      cwd: ERROR_DIR,
      tsconfig: 'tsconfig.json',
      genDir: path.join(ERROR_DIR, '.mion'),
      devServer: false,
    }) as any;
    callHook(plugin.configResolved, plugin, {root: ERROR_DIR, command: 'serve', mode: 'development'});
    const ctx = makeCtx();
    try {
      await expect(callHook(plugin.buildStart, ctx) as Promise<void>).rejects.toThrow(/build stopped on \d+ mion error/);
    } finally {
      await callHook(plugin.buildEnd, ctx);
    }
  });
});
