// Pure-fn build report — third-party wrapper attribution + the update lane.
//
// The report's whole reason to exist for a framework consumer (mion) is CALLEE
// ATTRIBUTION across bundles: a mapper declared through a framework wrapper
// (inputFrom / registerAcmePureFn) must report the WRAPPER's name and the
// package that DECLARES it — not '@mionjs/run-types' — so the framework's own
// build step can filter the report to just its wrappers. This suite reuses the
// @acme/toolkit fixture (a node_modules framework that re-exports the registrar
// AND declares its own branded wrapper) and asserts:
//   - build phase: every wrapper call site reports calleeName
//     'registerAcmePureFn' + calleeModule '@acme/toolkit', INCLUDING the
//     wrapper-only file that names neither the primitive nor '@mionjs/run-types'.
//   - update phase (Vite handleHotUpdate): editing a pure-fn body re-fires the
//     callback with phase 'update' carrying ONLY the changed file's site, and
//     the on-disk JSON report is rewritten with the new body.
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import runtypesRollup from '../../../devtools/src/runtypes/rollup.ts';
import runtypesVite from '../../../devtools/src/runtypes/vite.ts';
import type {PureFnSite} from '../../../devtools/src/core/protocol.ts';
import {BIN, hasBinary, writeMarkerPackage} from '../../../devtools/test/helpers/inline.ts';

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

const TOOLKIT_DTS = `import type {PureFunction, InjectPureFnId} from '@mionjs/run-types';
export {registerPureFn} from '@mionjs/run-types/runtime';
export declare function registerAcmePureFn<F extends (...args: any[]) => any>(
  fn: PureFunction<F>,
  pureFnId?: InjectPureFnId<F>,
): unknown;
`;

const TOOLKIT_JS = `export {registerPureFn} from '@mionjs/run-types/runtime';
export function registerAcmePureFn(fn, pureFnId) {
  return {fn, pureFnId};
}
`;

// Consumer A: a RENAMED re-export call + a wrapper call.
const CONSUMER_SRC = `import {registerPureFn as regPF, registerAcmePureFn} from '@acme/toolkit';
export const doubled = regPF(function _double(n: number): number { return n * 2; });
export const tripled = registerAcmePureFn(function _triple(n: number): number { return n * 3; });
`;

// Consumer B: ONLY the wrapper — names neither '@mionjs/run-types' nor a registrar.
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

function writeFixture() {
  FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-tp-pf-report-'));
  const toolkitDir = path.join(FIXTURE_DIR, 'node_modules', '@acme', 'toolkit');
  fs.mkdirSync(toolkitDir, {recursive: true});
  // The REAL @mionjs/run-types as an on-disk node_modules package. Unlike an
  // ambient overlay, this survives the resolver's setSources rebuild: the HMR
  // path (handleHotUpdate → setSources → scanFiles) constructs a fresh program
  // rooted at the changed file, and only a node_modules-resolvable
  // '@mionjs/run-types' keeps the markers resolvable — the production shape.
  writeMarkerPackage(FIXTURE_DIR);
  fs.writeFileSync(path.join(FIXTURE_DIR, 'tsconfig.json'), TSCONFIG_SRC);
  fs.writeFileSync(path.join(FIXTURE_DIR, 'consumer.ts'), CONSUMER_SRC);
  fs.writeFileSync(path.join(FIXTURE_DIR, 'wrapper-only.ts'), WRAPPER_ONLY_SRC);
  fs.writeFileSync(path.join(toolkitDir, 'package.json'), TOOLKIT_PKG_JSON);
  fs.writeFileSync(path.join(toolkitDir, 'index.d.ts'), TOOLKIT_DTS);
  fs.writeFileSync(path.join(toolkitDir, 'index.js'), TOOLKIT_JS);
}

const REPORT_PATH = (): string => path.join(FIXTURE_DIR, '__runtypes', 'types', 'pure-fns-report.json');

describe('third-party pure-fn report: wrapper attribution + update lane (node_modules)', () => {
  const register = hasBinary() ? it : it.skip;

  beforeEach(writeFixture);
  afterEach(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  register('build phase attributes every wrapper call site to registerAcmePureFn @ @acme/toolkit', async () => {
    let report: PureFnSite[] = [];
    const plugin = runtypesRollup({
      binary: BIN,
      cwd: FIXTURE_DIR,
      tsconfig: 'tsconfig.json',
      genDir: path.join(FIXTURE_DIR, '__runtypes'),
      pureFnReport: 'file',
      onPureFnReport: (sites: PureFnSite[], phase: 'build' | 'update') => {
        if (phase === 'build') report = sites;
      },
    }) as any;
    try {
      await callHook(plugin.buildStart, ctx);
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort
      }
    }

    // Three registrations (n*2, n*3, n*4) → three records, one per binding.
    expect(report.length, `expected 3 records, got ${JSON.stringify(report, null, 2)}`).toBe(3);
    // One id per registration: three distinct hashes, and the bindings name them.
    expect(new Set(report.map((s) => s.key)).size).toBe(3);
    expect(new Set(report.map((s) => s.bindingName))).toEqual(new Set(['doubled', 'tripled', 'quadrupled']));

    // Every wrapper call site (n*3 in consumer, n*4 in wrapper-only) attributes
    // to the wrapper's own name + declaring package — NOT '@mionjs/run-types'.
    const wrapperSites = report.filter((s) => s.calleeName === 'registerAcmePureFn');
    expect(wrapperSites.length, 'two registerAcmePureFn call sites').toBe(2);
    for (const s of wrapperSites) {
      expect(s.calleeModule).toBe('@acme/toolkit');
      expect(s.form).toBe('direct');
    }

    // The wrapper-only file's site is present and correctly attributed even
    // though its source names neither the primitive nor '@mionjs/run-types'.
    const wrapperOnly = wrapperSites.find((s) => s.file.endsWith('wrapper-only.ts'));
    expect(wrapperOnly, 'wrapper-only.ts site must be in the report').toBeTruthy();
    expect(wrapperOnly!.calleeModule).toBe('@acme/toolkit');

    // The renamed re-export site keeps its renamed callee name but resolves to
    // the primitive's declaring module.
    const renamed = report.find((s) => s.calleeName === 'regPF');
    expect(renamed, 'renamed regPF site present').toBeTruthy();
    expect(renamed!.calleeModule).toBe('@mionjs/run-types');

    // The JSON file mirrors the callback records.
    const fromDisk = JSON.parse(fs.readFileSync(REPORT_PATH(), 'utf8')) as PureFnSite[];
    expect(new Set(fromDisk.map((s) => s.key))).toEqual(new Set(report.map((s) => s.key)));
  });

  register('update lane re-fires the callback with only the changed site and rewrites the JSON', async () => {
    const updates: Array<{phase: string; sites: PureFnSite[]}> = [];
    const plugin = runtypesVite({
      binary: BIN,
      cwd: FIXTURE_DIR,
      tsconfig: 'tsconfig.json',
      genDir: path.join(FIXTURE_DIR, '__runtypes'),
      pureFnReport: 'file',
      onPureFnReport: (sites: PureFnSite[], phase: 'build' | 'update') => updates.push({phase, sites}),
    }) as any;

    // Under Vite the resolver spawns in configResolved; buildStart generates.
    await callHook(plugin.configResolved, undefined, {root: FIXTURE_DIR});
    await callHook(plugin.buildStart, ctx);

    const buildFire = updates.find((u) => u.phase === 'build');
    expect(buildFire, 'build-phase callback fired').toBeTruthy();

    // Edit the wrapper-only body (n*4 → n*5). The id is WHERE the registration
    // lives, so it survives the edit; the body the record carries is the new one.
    const edited = WRAPPER_ONLY_SRC.replace('n * 4', 'n * 5');
    const wrapperOnlyFile = path.join(FIXTURE_DIR, 'wrapper-only.ts');
    fs.writeFileSync(wrapperOnlyFile, edited);
    await callHook(plugin.handleHotUpdate, ctx, {
      file: wrapperOnlyFile,
      read: async () => edited,
    });

    const updateFire = updates.find((u) => u.phase === 'update');
    expect(updateFire, 'update-phase callback fired on the pure-fn edit').toBeTruthy();
    // The delta carries ONLY the changed file's site (not consumer.ts's).
    expect(updateFire!.sites.length, 'delta is the single changed site').toBe(1);
    const changed = updateFire!.sites[0];
    expect(changed.file.endsWith('wrapper-only.ts')).toBe(true);
    expect(changed.calleeName).toBe('registerAcmePureFn');
    expect(changed.calleeModule).toBe('@acme/toolkit');
    expect(changed.bindingName).toBe('quadrupled');
    expect(changed.code).toContain('n * 5');

    // The on-disk JSON was rewritten with the edited body.
    const fromDisk = JSON.parse(fs.readFileSync(REPORT_PATH(), 'utf8')) as PureFnSite[];
    const onDisk = fromDisk.find((s) => s.key === changed.key);
    expect(onDisk?.code, 'JSON report rewritten with the new body').toContain('n * 5');
  });
});
