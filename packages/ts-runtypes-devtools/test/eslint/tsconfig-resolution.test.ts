// End-to-end coverage for the lint plugin honoring the project tsconfig's
// resolution options. Before the fix the ESLint inline-server spawn passed no
// --tsconfig, so a cross-package type behind a `source` export condition (the
// source-resolved monorepo dev setup, dist unbuilt) collapsed to `any` at lint
// time — 59 false MKR007 in mion, while the build resolved it fine.
//
// Two layers: a pure unit check that buildResolverArgs now forwards --tsconfig
// in server mode (the exact guard that caused the bug), and an integration run
// of the real rules through bin/ts-runtypes over an on-disk monorepo whose only
// resolvable cross-package entry is behind `source`.
//
// Marker coverage rule (CLAUDE.md): the consumer fixture uses BOTH getRunTypeId
// shapes — static `getRunTypeId<T>()` and value-first `getRunTypeId(value)` —
// plus a createValidateFn<CrossPkgType>() site (the mion repro shape).

import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {rules} from '../../src/eslint/index.ts';
import {resetSharedSession} from '../../src/eslint/session.ts';
import {buildResolverArgs} from '../../src/resolver-client.ts';
import {hasBinary, makeFixtureProject, runRule, type FixtureProject} from './fixture.ts';

describe('buildResolverArgs — server mode forwards --tsconfig', () => {
  it('emits --tsconfig in server mode (was suppressed before the fix)', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {serverMode: true, singleThreaded: true});
    expect(args[0]).toBe('serve');
    expect(args).toContain('--sources');
    expect(args[args.indexOf('--sources') + 1]).toBe('ops');
    const idx = args.indexOf('--tsconfig');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('tsconfig.json');
  });

  it('omits --tsconfig when no path is supplied', () => {
    expect(buildResolverArgs('/proj', '', {serverMode: true})).not.toContain('--tsconfig');
  });
});

// @app/models exposes CrossPkgUser ONLY behind the `source` condition; its
// import/default entry points at an unbuilt dist that does not exist. Without
// customConditions:["source"] the import degrades to `any`.
const CROSS_PKG_JSON = '{"name":"@app/models","exports":{".":{"source":"./src/index.ts","import":"./dist/index.js"}}}';
const CROSS_PKG_SRC = 'export interface CrossPkgUser { id: string; name: string; age: number }\n';

const CONSUMER_SRC = `import {getRunTypeId, createValidateFn} from '@ts-runtypes/core';
import type {CrossPkgUser} from '@app/models';

// static getRunTypeId<T>()
getRunTypeId<CrossPkgUser>();

// value-first getRunTypeId(value)
declare const sample: CrossPkgUser;
getRunTypeId(sample);

// createValidateFn<CrossPkgType>() — the site that produced 59 MKR007 in mion
export const validateUser = createValidateFn<CrossPkgUser>();
`;

const TSCONFIG_SOURCE = JSON.stringify({
  compilerOptions: {
    module: 'ESNext',
    moduleResolution: 'bundler',
    target: 'ESNext',
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    customConditions: ['source'],
    types: [],
  },
});

const TSCONFIG_NO_CONDITIONS = JSON.stringify({
  compilerOptions: {
    module: 'ESNext',
    moduleResolution: 'bundler',
    target: 'ESNext',
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  },
});

describe.runIf(hasBinary())('eslint tsconfig resolution (integration through bin/ts-runtypes)', () => {
  let project: FixtureProject;
  let consumerAbs: string;
  let originalCwd: string;

  beforeAll(() => {
    project = makeFixtureProject({
      'tsconfig.json': TSCONFIG_SOURCE,
      'tsconfig.noconditions.json': TSCONFIG_NO_CONDITIONS,
      'node_modules/@app/models/package.json': CROSS_PKG_JSON,
      'node_modules/@app/models/src/index.ts': CROSS_PKG_SRC,
      'consumer.ts': CONSUMER_SRC,
    });
    consumerAbs = `${project.dir}/consumer.ts`;
    // The plugin roots the resolver at process.cwd() and defaults the tsconfig to
    // 'tsconfig.json' there — drive the suite from the fixture dir, like a real
    // editor/CI run from the project root. Restored in afterAll.
    originalCwd = process.cwd();
    process.chdir(project.dir);
  });

  afterAll(() => {
    resetSharedSession();
    process.chdir(originalCwd);
    project.cleanup();
  });

  // Each test opens a fresh session so the long-lived resolver connection
  // re-reads the tsconfig from that test's settings (the connection fixes its
  // tsconfig on the first request).
  beforeEach(() => resetSharedSession());

  it('resolves a source-condition cross-package marker — no invalid-marker (MKR007)', () => {
    // settings: {} → tsconfig defaults to 'tsconfig.json' (customConditions:["source"]).
    expect(runRule(rules['invalid-marker'], consumerAbs, CONSUMER_SRC, {})).toEqual([]);
  });

  it('reports no skipped members for the resolved data type', () => {
    expect(runRule(rules['validate-skipped-member'], consumerAbs, CONSUMER_SRC, {})).toEqual([]);
  });

  it('honors settings.runtypes.tsconfig — a config without customConditions still flags the unresolved marker', () => {
    const reports = runRule(rules['invalid-marker'], consumerAbs, CONSUMER_SRC, {
      runtypes: {tsconfig: 'tsconfig.noconditions.json'},
    });
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.some((report) => report.message.includes('MKR007'))).toBe(true);
  });
});
