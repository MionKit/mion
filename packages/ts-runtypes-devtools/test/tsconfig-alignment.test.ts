// One tsconfig, one behavior — the JS-side pins of the config-alignment
// contract on both public surfaces:
//
//   - daemon/HMR surface (direct server-mode ResolverClient, the
//     transform-modes pattern): a setSources edit introducing an
//     option-sensitive type (Temporal, lib-gated) resolves exactly as a build
//     would — lib present → real type, no TMP001; lib absent → TMP001 — and a
//     broken/missing NAMED tsconfig fails the op loudly (CFG001) instead of
//     silently degrading, healing on the next setSources once fixed.
//   - eslint surface (makeFixtureProject/runRule): the same lib sensitivity
//     routed through the rules, plus the CFG001 → broken-tsconfig rule route.
//
// Marker coverage rule (CLAUDE.md): fixtures use BOTH getRunTypeId call
// shapes — static getRunTypeId<T>() and value-first getRunTypeId(value) —
// with id equality asserted between them.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {rules} from '../src/eslint/index.ts';
import {resetSharedSession} from '../src/eslint/session.ts';
import {ResolverClient} from '../src/resolver-client.ts';
import {hasBinary, makeFixtureProject, runRule, type FixtureProject} from './eslint/fixture.ts';
import {BIN, MARKER_PACKAGE_OVERLAY} from './helpers/inline.ts';

const TEMPORAL_CONSUMER_SRC = `import {getRunTypeId, createValidateFn} from '@mionjs/run-types';

// static getRunTypeId<T>()
getRunTypeId<Temporal.PlainDate>();

// value-first getRunTypeId(value)
declare const sample: Temporal.PlainDate;
getRunTypeId(sample);

export const validatePlain = createValidateFn<Temporal.PlainDate>();
`;

const TSCONFIG_TEMPORAL_LIB = JSON.stringify({
  compilerOptions: {
    module: 'ESNext',
    moduleResolution: 'bundler',
    target: 'ES2022',
    lib: ['ES2022', 'ESNext.Temporal'],
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  },
});

const TSCONFIG_NO_TEMPORAL_LIB = JSON.stringify({
  compilerOptions: {
    module: 'ESNext',
    moduleResolution: 'bundler',
    target: 'ES2022',
    lib: ['ES2022'],
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  },
});

describe.runIf(hasBinary())('daemon surface — setSources honors the full tsconfig (direct ResolverClient)', () => {
  const scanTemporal = async (tsconfig: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-tsconfig-align-'));
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), tsconfig);
    const resolver = new ResolverClient(BIN, dir, 'tsconfig.json', {serverMode: true, singleThreaded: true});
    try {
      // First install a marker-less program, then EDIT the Temporal marker in —
      // the HMR shape: the frozen config must govern the per-edit rebuild too.
      await resolver.setSources({...MARKER_PACKAGE_OVERLAY, 'consumer.ts': 'export const before = 1;\n'});
      await resolver.setSources({...MARKER_PACKAGE_OVERLAY, 'consumer.ts': TEMPORAL_CONSUMER_SRC});
      return await resolver.scanFiles(['consumer.ts'], {includeRunTypes: true, includeRtDiagnostics: true});
    } finally {
      resolver.close();
      fs.rmSync(dir, {recursive: true, force: true});
    }
  };

  it('lib with ESNext.Temporal: the marker resolves — no TMP001, both getRunTypeId shapes share one id', async () => {
    const result = await scanTemporal(TSCONFIG_TEMPORAL_LIB);
    expect((result.diagnostics ?? []).map((diagnostic) => diagnostic.code)).not.toContain('TMP001');
    expect(result.sites).toHaveLength(3);
    const reflectIds = result.sites.filter((site) => !site.fnId).map((site) => site.id);
    expect(reflectIds).toHaveLength(2);
    expect(reflectIds[0]).toBe(reflectIds[1]);
    // The validate site is over the same T — one id across all three sites.
    expect(new Set(result.sites.map((site) => site.id)).size).toBe(1);
  });

  it('lib without Temporal: the same edit degrades and TMP001 fires (config sensitivity, not fixture luck)', async () => {
    const result = await scanTemporal(TSCONFIG_NO_TEMPORAL_LIB);
    expect((result.diagnostics ?? []).map((diagnostic) => diagnostic.code)).toContain('TMP001');
  });

  it('a broken NAMED tsconfig fails setSources with CFG001, then heals once fixed — same connection', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-tsconfig-broken-'));
    const configPath = path.join(dir, 'tsconfig.json');
    fs.writeFileSync(configPath, 'this is not json at all {{{');
    const resolver = new ResolverClient(BIN, dir, 'tsconfig.json', {serverMode: true, singleThreaded: true});
    try {
      await expect(resolver.setSources({'consumer.ts': 'export const x = 1;\n'})).rejects.toThrow(/CFG001/);
      fs.writeFileSync(configPath, TSCONFIG_NO_TEMPORAL_LIB);
      await expect(resolver.setSources({'consumer.ts': 'export const x = 1;\n'})).resolves.toBeUndefined();
    } finally {
      resolver.close();
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('a missing NAMED tsconfig fails setSources loudly', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-tsconfig-missing-'));
    const resolver = new ResolverClient(BIN, dir, 'tsconfig.json', {serverMode: true, singleThreaded: true});
    try {
      await expect(resolver.setSources({'consumer.ts': 'export const x = 1;\n'})).rejects.toThrow(/tsconfig not found/);
    } finally {
      resolver.close();
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe.runIf(hasBinary())('eslint surface — option-sensitive types and config errors route through the rules', () => {
  let project: FixtureProject;
  let consumerAbs: string;
  let originalCwd: string;

  beforeAll(() => {
    project = makeFixtureProject({
      'tsconfig.json': TSCONFIG_TEMPORAL_LIB,
      'tsconfig.nolib.json': TSCONFIG_NO_TEMPORAL_LIB,
      'tsconfig.broken.json': 'this is not json at all {{{',
      'consumer.ts': TEMPORAL_CONSUMER_SRC,
    });
    consumerAbs = `${project.dir}/consumer.ts`;
    originalCwd = process.cwd();
    process.chdir(project.dir);
  });

  afterAll(() => {
    resetSharedSession();
    process.chdir(originalCwd);
    project.cleanup();
  });

  beforeEach(() => resetSharedSession());

  it('lib with ESNext.Temporal (default tsconfig.json): no invalid-marker report', () => {
    expect(runRule(rules['invalid-marker'], consumerAbs, TEMPORAL_CONSUMER_SRC, {})).toEqual([]);
  });

  it('lib without Temporal: the TMP001-routed invalid-marker report fires', () => {
    const reports = runRule(rules['invalid-marker'], consumerAbs, TEMPORAL_CONSUMER_SRC, {
      runtypes: {tsconfig: 'tsconfig.nolib.json'},
    });
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.some((report) => report.message.includes('TMP001'))).toBe(true);
  });

  it('a broken configured tsconfig surfaces as a CFG001 broken-tsconfig report, not an engine failure', () => {
    const reports = runRule(rules['broken-tsconfig'], consumerAbs, TEMPORAL_CONSUMER_SRC, {
      runtypes: {tsconfig: 'tsconfig.broken.json'},
    });
    expect(reports.length).toBe(1);
    expect(reports[0].message).toContain('CFG001');
    expect(reports[0].line).toBe(1);
  });
});
