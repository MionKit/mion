// Pure-fn build report — the structured, layout-independent record of every
// pure fn a build generated, for host tooling that relocates pure-fn bodies
// across bundles (mion's cross-bundle batch transport). This suite
// drives the SHARED unplugin factory through the Rollup adapter (proving the
// callback is universal, NOT a vite-only hook) against a self-contained
// on-disk fixture program, and asserts:
//   - onPureFnReport fires once after buildStart with phase 'build', covering
//     both lanes (named `<ns>::name` + anonymous `rt::<hash>`) and both forms.
//   - the JSON report file round-trips (write → parse → keys match) under BOTH
//     moduleMode 'default' (per-entry pf modules) and 'allSingle' (one pf
//     bundle), with an identical report shape and the correct `module` field.
//   - the report file never collides with a generated module nor appears under
//     types/ (it is data, not a module).
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import runtypesRollup from '../src/runtypes/rollup.ts';
import type {PureFnSite} from '../src/core/protocol.ts';
import {BIN, hasBinary, writeMarkerPackage} from './helpers/inline.ts';

let FIXTURE_DIR = '';

const TSCONFIG = JSON.stringify({
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

// Both lanes, both forms: named+factory, named+direct, anonymous+direct.
const CONSUMER = `import {registerPureFnFactory, registerPureFn, registerAnonymousPureFn} from '@mionjs/run-types';
export const nf = registerPureFnFactory('rep::mul', (utl) => function _mul(x: number, y: number) { return x * y; });
export const nd = registerPureFn('rep::neg', function _neg(x: number) { return -x; });
export const ad = registerAnonymousPureFn(function _double(n: number): number { return n * 2; });
`;

const ctx = {
  error(message: string): never {
    throw new Error(message);
  },
  warn(): void {},
};

const callHook = (hook: any, thisArg: unknown, ...args: unknown[]): unknown =>
  typeof hook === 'function' ? hook.apply(thisArg, args) : hook.handler.apply(thisArg, args);

function makePlugin(extra: Record<string, unknown>) {
  return runtypesRollup({
    binary: BIN,
    cwd: FIXTURE_DIR,
    tsconfig: 'tsconfig.json',
    genDir: path.join(FIXTURE_DIR, '.mion'),
    ...extra,
  }) as any;
}

describe('pure-fn build report', () => {
  const register = hasBinary() ? it : it.skip;

  beforeEach(() => {
    FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-pf-report-'));
    fs.writeFileSync(path.join(FIXTURE_DIR, 'tsconfig.json'), TSCONFIG);
    writeMarkerPackage(FIXTURE_DIR);
    fs.writeFileSync(path.join(FIXTURE_DIR, 'consumer.ts'), CONSUMER);
  });
  afterEach(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  register('onPureFnReport fires on the rollup adapter with both lanes + forms; JSON file round-trips', async () => {
    const calls: Array<{phase: string; sites: PureFnSite[]}> = [];
    const plugin = makePlugin({
      pureFnReport: 'file',
      onPureFnReport: (sites: PureFnSite[], phase: 'build' | 'update') => calls.push({phase, sites}),
    });
    try {
      await callHook(plugin.buildStart, ctx);
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort
      }
    }

    // The callback fired once, with the whole-program report.
    expect(calls.length, 'onPureFnReport must fire on buildStart (universal hook)').toBe(1);
    expect(calls[0].phase).toBe('build');
    const sites = calls[0].sites;
    const byKey = new Map(sites.map((s) => [s.key, s]));

    // Named lane keys present verbatim.
    expect(byKey.has('rep::mul'), `named factory rep::mul missing: ${[...byKey.keys()]}`).toBe(true);
    expect(byKey.has('rep::neg'), 'named direct rep::neg missing').toBe(true);
    // Anonymous lane: exactly one rt::<hash> record.
    const anon = sites.filter((s) => s.lane === 'anonymous');
    expect(anon.length, 'one anonymous record').toBe(1);
    expect(anon[0].key).toMatch(/^rt::[A-Za-z0-9_-]+$/);

    // Forms + callee attribution (primitive registrar → @mionjs/run-types).
    expect(byKey.get('rep::mul')!.form).toBe('factory');
    expect(byKey.get('rep::mul')!.lane).toBe('named');
    expect(byKey.get('rep::mul')!.calleeName).toBe('registerPureFnFactory');
    expect(byKey.get('rep::mul')!.calleeModule).toBe('@mionjs/run-types');
    expect(byKey.get('rep::neg')!.form).toBe('direct');
    expect(anon[0].form).toBe('direct');

    // The self-contained payload rides inline (code + paramNames) — no need to
    // read generated modules. Default emitMode ships the code body string.
    expect(byKey.get('rep::mul')!.paramNames).toEqual(['utl']);
    expect(byKey.get('rep::mul')!.code, 'factory code should be present in default emit mode').toBeTruthy();

    // JSON file round-trips: write → parse → keys match the injected report.
    // The report lives INSIDE types/, alongside the generated cache modules, so
    // it inherits that dir's .gitignore (`*`) exactly like every cache module.
    const typesDir = path.join(FIXTURE_DIR, '.mion', 'types');
    const reportPath = path.join(typesDir, 'pure-fns-report.json');
    expect(fs.existsSync(reportPath), 'pure-fns-report.json must be written under types/ on generate').toBe(true);
    const fromDisk = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as PureFnSite[];
    expect(new Set(fromDisk.map((s) => s.key))).toEqual(new Set(sites.map((s) => s.key)));

    // It is data, not a module: no `.js` module collides with it, and the
    // generated `types/.gitignore` (`*`) covers it just like the cache modules.
    const typeFiles = fs.readdirSync(typesDir);
    expect(typeFiles).not.toContain('pure-fns-report.js');
    expect(fs.readFileSync(path.join(typesDir, '.gitignore'), 'utf8')).toContain('*');
  });

  register('report shape is identical across moduleMode; module field carries the layout', async () => {
    async function reportFor(moduleMode: string): Promise<PureFnSite[]> {
      let captured: PureFnSite[] = [];
      const plugin = makePlugin({
        moduleMode,
        pureFnReport: 'file',
        onPureFnReport: (sites: PureFnSite[]) => (captured = sites),
      });
      try {
        await callHook(plugin.buildStart, ctx);
      } finally {
        try {
          await callHook(plugin.buildEnd, ctx);
        } catch {
          // best-effort
        }
      }
      return captured;
    }

    const perEntry = await reportFor('default');
    const bundled = await reportFor('allSingle');

    // Same keys either way — the report shape does not depend on moduleMode.
    expect(new Set(bundled.map((s) => s.key))).toEqual(new Set(perEntry.map((s) => s.key)));

    // default: per-entry pf/<ns>/<fn>. allSingle: the single `pf` bundle.
    for (const s of perEntry) {
      expect(s.module, `${s.key} per-entry module`).toMatch(/^pf\//);
    }
    for (const s of bundled) {
      expect(s.module, `${s.key} allSingle module`).toBe('pf');
    }
  });

  register('report data flows to the callback even with no JSON file (callback-only)', async () => {
    let captured: PureFnSite[] = [];
    const plugin = makePlugin({
      // No `pureFnReport` file option — only the in-process callback.
      onPureFnReport: (sites: PureFnSite[]) => (captured = sites),
    });
    try {
      await callHook(plugin.buildStart, ctx);
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort
      }
    }
    expect(captured.length, 'callback receives records without a file being requested').toBe(3);
    // ...and no JSON file was written (data-only).
    expect(fs.existsSync(path.join(FIXTURE_DIR, '.mion', 'types', 'pure-fns-report.json'))).toBe(false);
  });

  // Validation runs at plugin construction (no binary needed), so this stays a
  // plain `it` — an unknown tri-state value must fail loudly, not silently.
  it('rejects an unknown pureFnReport value', () => {
    expect(() => makePlugin({pureFnReport: 'bogus'})).toThrow(/pureFnReport/);
  });
});
