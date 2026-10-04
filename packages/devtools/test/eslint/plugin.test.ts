// Integration suite for the lint plugin: real fixture projects on disk, the
// real mion-bin/mion behind the session bridge, and the rules driven the
// way a lint host drives them (create → Program visitor → reports).
//
// Marker coverage rule (CLAUDE.md): the Family A fixtures cover BOTH
// getRunTypeId call shapes — static `getRunTypeId<T>()` and reflection
// `getRunTypeId(value)` — including the hash-equivalence assertion via the
// sibling ResolverClient.

import fs from 'node:fs';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import plugin, {meta, rules, sessionOptions} from '../../src/lint/index.ts';
import {RULE_SPECS, type RuleName} from '../../src/lint/diagnosticRouting.ts';
import {resetSharedSession} from '../../src/lint/session.ts';
import {ResolverClient} from '../../src/core/resolver-client.ts';
import {TODO_LINE, TODO_TAG} from '../../src/core/go-generated/runtypes-constants.generated.ts';
import {BIN, hasBinary, makeFixtureProject, runRule, type FixtureProject, type LintReportedProblem} from './fixture.ts';

const FORMS_TS = `import {getRunTypeId} from '@mionjs/run-types';

export const staticId = getRunTypeId<string>();
const s: string = 'hello';
export const reflectId = getRunTypeId(s);
`;

const BAD_FORM_TS = `import {getRunTypeId} from '@mionjs/run-types';

function load(): {name: string} {
  return {name: 'x'};
}
export const id = getRunTypeId(load());
`;

const GENERIC_MARKER_TS = `import {createValidateFn} from '@mionjs/run-types';

export function makeValidator<T>() {
  return createValidateFn<T>();
}
`;

// A dialect's tableFromType carries a run-types marker, so a file importing only the dialect must be checked.
const DIALECT_PACKAGE_JSON = JSON.stringify({
  name: '@mionjs/drizzle-orm-pg-core',
  exports: {'.': './index.d.ts'},
  peerDependencies: {'@mionjs/run-types': '*'},
});
const DIALECT_DTS = `import type {InjectRunTypeId} from '@mionjs/run-types';
export declare function tableFromType<T>(options?: {schema?: string}, id?: InjectRunTypeId<T>): T;
`;

const DRIZZLE_GENERIC_TS = `import {tableFromType} from '@mionjs/drizzle-orm-pg-core';

export function makeTable<T>() {
  return tableFromType<T>();
}
`;

// A local wrapper of the dialect: its importer names neither package.
const TABLES_TS = `export {tableFromType} from '@mionjs/drizzle-orm-pg-core';
`;

const WRAPPED_GENERIC_TS = `import {tableFromType} from './tables';

export function makeTable<T>() {
  return tableFromType<T>();
}
`;

const WIDGET_TS = `import {createValidateFn} from '@mionjs/run-types';

interface Widget {
  label: string;
  onClick: () => void;
}

export const isWidget = createValidateFn<Widget>();
`;

const USER_TS = `export interface User {
  name: string;
  age: number;
}
`;

const MIRROR_DIRTY_TS = `import type { User } from './user';
import type { FriendlyText, MockData } from '@mionjs/run-types';

/** @rtType User#u1 @rtIds {age: a1, name: n1} */
${TODO_LINE}
export const friendlyUser: FriendlyText<User> = {
  name: {rt$label: 'Name'},
  nope: {rt$label: 'Gone'},
};

/** @rtType User#u1 */
export const mockUser: MockData<User> = {
  age: {min: 1, max: 9},
  vanished: {pool: ['x']},
};

/* @rtOrphan export const friendlyGone = {}; */
export const keep = {/* @rtOrphanChild old: 1, */ fresh: 1};
`;

const MIRROR_CLEAN_TS = `import type { User } from './user';
import type { FriendlyText } from '@mionjs/run-types';

/** @rtType User#u1 @rtIds {age: a1, name: n1} */
export const friendlyUser: FriendlyText<User> = {
  name: {rt$label: 'Name'},
  age: {rt$label: 'Age'},
};
`;

const MIRROR_DRIFT_TS = `import type { Ghost } from './ghost';
import type { FriendlyText } from '@mionjs/run-types';

/** @rtType Ghost#g1 */
export const friendlyGhost: FriendlyText<{name: string}> = {
  name: {rt$label: 'Name'},
};
`;

const PLAIN_TS = `// ${TODO_TAG}: hand-written file, not enrichment
export const answer = 42;
`;

// ROUTES_TS carries one finding of each rpc-handler-* code and NO runtypes marker,
// which is the point of the fixture: a route file need not import the marker
// package, so the pre-filter has to admit it on the router signals alone or the
// checks would never run.
const ROUTES_TS = `import {createMionRouter} from '@mionjs/router';
const mion = createMionRouter();
export interface Wire { ok: number; __proto__: string }
export const noReturn = mion.route((ctx, name: string) => name);
export const untyped = mion.route((ctx, name): string => 'x');
export const throws = mion.route((ctx, name: string): string => { throw new Error(name); });
export const badError = mion.route((ctx, name: string): string | Error => 'x');
`;

// The handlers live in one module and the routes that declare them in another,
// which is a normal way to lay a mion server out and something the syntactic
// rules could never check: they only ever saw a function written into the call.
const HANDLERS_TS = `export function noReturn(ctx: unknown, name: string) { return name; }
export const thrower = (ctx: unknown, name: string): string => { throw new Error(name); };
`;

const IMPORTING_ROUTES_TS = `import {createMionRouter} from '@mionjs/router';
import {noReturn, thrower} from './handlers.ts';
const mion = createMionRouter();
export const a = mion.route(noReturn);
export const b = mion.route(thrower);
`;

// The same file written correctly, plus two handler shapes only a resolved call can see.
const CLEAN_ROUTES_TS = `import {createMionRouter, type Handler} from '@mionjs/router';
import {RpcError} from '@mionjs/core';
const mion = createMionRouter();
const named = (ctx: unknown, name: string): string => name;
export const viaRef = mion.route(named);
export const typedConst: Handler = (ctx: unknown, name: string): string | RpcError => name;
export const caught = mion.route((ctx, name: string): string => {
  try { throw new Error(name); } catch { return 'ok'; }
});
`;

// The mockSample fails a JS-only lookbehind, which the resolver's JS sidecar reports as format-sample-mismatch, not the lint worker.
// The local TypeFormat brand is recognised structurally, as in the Go resolver tests.
const UNCHECKED_PATTERN_TS = `import {createValidateFn} from '@mionjs/run-types';

type TypeFormat<Base, Name extends string, Params> = Base & {
  readonly __rtFormatName?: Name;
  readonly __rtFormatParams?: Params;
};

export const isCode = createValidateFn<TypeFormat<string, 'stringFormat', {pattern: {source: '(?<=x)y'; flags: ''; mockSamples: ['nope']}}>>();
`;

// Runs without the resolver binary.
describe('sessionOptions: timeoutMs, tsconfig and binary are configurable', () => {
  it('reads timeoutMs, tsconfig and binary', () => {
    expect(sessionOptions({mion: {binary: '/x', timeoutMs: 5000, tsconfig: './tsconfig.lint.json'}})).toEqual({
      binary: '/x',
      timeoutMs: 5000,
      tsconfig: './tsconfig.lint.json',
    });
  });

  // Once per key per run, so a lint of a thousand files is not drowned.
  it('warns once per unsupported key, naming it and the supported set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // A key no other test uses: the warning is once per PROCESS.
      sessionOptions({mion: {bogusKnob: '/y', timeoutMs: 1}});
      sessionOptions({mion: {bogusKnob: '/y'}});
      sessionOptions({mion: {bogusKnob: '/y'}});
      const messages = warn.mock.calls.map((call) => String(call[0]));
      expect(messages.filter((message) => message.includes('settings.mion.bogusKnob'))).toHaveLength(1);
      expect(messages[0]).toContain('tsconfig');
      expect(messages[0]).toContain('binary');
    } finally {
      warn.mockRestore();
    }
  });

  it('says nothing about supported keys', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      sessionOptions({mion: {timeoutMs: 1, tsconfig: 'tsconfig.json', binary: '/x'}});
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('is empty when settings are absent or carry no mion bag', () => {
    expect(sessionOptions(undefined)).toEqual({});
    expect(sessionOptions({other: {}})).toEqual({});
  });
});

// recommended is what the docs tell ESLint users to spread.
describe('configs.recommended: the four level rules at their defaults', () => {
  it('registers the mion plugin and sets each level rule to its default', () => {
    const rec = plugin.configs['recommended'] as {plugins: Record<string, unknown>; rules: Record<string, string>};
    expect(rec.plugins).toEqual({mion: plugin});
    expect(rec.rules).toEqual({'mion/error': 'error', 'mion/runtime-error': 'error', 'mion/warning': 'warn', 'mion/info': 'off'});
  });

  it('exposes exactly the four level rules', () => {
    expect(Object.keys(rules).sort()).toEqual(['error', 'info', 'runtime-error', 'warning']);
    expect(RULE_SPECS.map((spec) => spec.name)).toEqual(['error', 'runtime-error', 'warning', 'info']);
  });
});

// oxlint has no plugin-exported presets, but its `extends` takes config FILE paths, so the package ships one.
describe('oxlint-recommended.json: the shipped extends preset matches RULE_SPECS', () => {
  it('carries the dist plugin path and every level rule at its default', () => {
    const presetPath = new URL('../../oxlint-recommended.json', import.meta.url);
    const preset = JSON.parse(fs.readFileSync(presetPath, 'utf8')) as {jsPlugins: string[]; rules: Record<string, string>};
    expect(preset.jsPlugins).toEqual(['./dist/lint/index.js']);
    expect(preset.rules).toEqual(Object.fromEntries(RULE_SPECS.map((spec) => [`mion/${spec.name}`, spec.default])));
  });
});

// locate returns the report-shaped (1-based line, 0-based column) position of
// needle in text, so expectations derive from the fixture instead of
// hand-counted numbers.
function locate(text: string, needle: string): {line: number; column: number} {
  const offset = text.indexOf(needle);
  if (offset < 0) throw new Error(`fixture is missing ${JSON.stringify(needle)}`);
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  const column = offset - (before.lastIndexOf('\n') + 1);
  return {line, column};
}

describe.runIf(hasBinary())(
  'lint plugin (integration through mion-bin/mion)',
  () => {
    let project: FixtureProject;
    let settings: Record<string, unknown>;
    let originalCwd: string;
    const abs = new Map<string, string>();
    const texts: Record<string, string> = {
      'forms.ts': FORMS_TS,
      'bad-form.ts': BAD_FORM_TS,
      'generic-marker.ts': GENERIC_MARKER_TS,
      'drizzle-generic.ts': DRIZZLE_GENERIC_TS,
      'tables.ts': TABLES_TS,
      'wrapped-generic.ts': WRAPPED_GENERIC_TS,
      'widget.ts': WIDGET_TS,
      'user.ts': USER_TS,
      'mirror-dirty.ts': MIRROR_DIRTY_TS,
      'mirror-clean.ts': MIRROR_CLEAN_TS,
      'mirror-drift.ts': MIRROR_DRIFT_TS,
      'plain.ts': PLAIN_TS,
      'unchecked-pattern.ts': UNCHECKED_PATTERN_TS,
      'routes.ts': ROUTES_TS,
      'clean-routes.ts': CLEAN_ROUTES_TS,
      'handlers.ts': HANDLERS_TS,
      'importing-routes.ts': IMPORTING_ROUTES_TS,
    };

    beforeAll(() => {
      project = makeFixtureProject(texts);
      project.write('node_modules/@mionjs/drizzle-orm-pg-core/package.json', DIALECT_PACKAGE_JSON);
      project.write('node_modules/@mionjs/drizzle-orm-pg-core/index.d.ts', DIALECT_DTS);
      for (const rel of Object.keys(texts)) abs.set(rel, `${project.dir}/${rel}`);
      // The plugin roots the resolver at process.cwd(), exactly like a real
      // editor/CI run from the project root — so drive this in-process suite
      // from the fixture dir. Restored in afterAll. No binary setting:
      // getExePath() resolves the built mion-bin/mion in this repo.
      originalCwd = process.cwd();
      process.chdir(project.dir);
      settings = {};
    });

    afterAll(() => {
      resetSharedSession();
      process.chdir(originalCwd);
      project.cleanup();
    });

    function reportsFor(ruleName: RuleName, rel: string): LintReportedProblem[] {
      return runRule(rules[ruleName], abs.get(rel)!, texts[rel]!, settings);
    }

    function codesFor(ruleName: RuleName, rel: string): string[] {
      return reportsFor(ruleName, rel).map(
        (report) => report.message.match(/^\[([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\]/)?.[1] ?? report.message
      );
    }

    const LEVEL_RULES = ['error', 'runtime-error', 'warning', 'info'] as const;

    it('exposes the mion namespace', () => {
      expect(meta.name).toBe('mion');
      expect(plugin.configs['recommended']).toBeDefined();
    });

    describe('Family A — compiler diagnostics grouped by family', () => {
      it('reports nothing on a clean file using BOTH getRunTypeId shapes', () => {
        for (const ruleName of LEVEL_RULES) expect(reportsFor(ruleName, 'forms.ts')).toEqual([]);
      });

      it('static and reflection getRunTypeId forms resolve to the SAME cache id (hash equivalence)', async () => {
        const client = new ResolverClient(BIN, project.dir, '', {serverMode: true, singleThreaded: true});
        try {
          await client.setSources({'forms.ts': FORMS_TS});
          const result = await client.scanFiles(['forms.ts']);
          expect(result.sites).toHaveLength(2);
          expect(result.sites[0]!.id).toBe(result.sites[1]!.id);
        } finally {
          client.close();
        }
      });

      it('routes a Warning marker diagnostic (marker-calls-function-for-type, reflection form invoking a function) to mion/warning', () => {
        const reports = reportsFor('warning', 'bad-form.ts');
        expect(reports).toHaveLength(1);
        expect(reports[0]!.message).toContain('[marker-calls-function-for-type]');
        expect(reports[0]!.message).toContain('load');
        expect(reports[0]!.line).toBe(locate(BAD_FORM_TS, 'getRunTypeId(load())').line);
        expect(reportsFor('error', 'bad-form.ts')).toEqual([]);
        expect(reportsFor('runtime-error', 'bad-form.ts')).toEqual([]);
      });

      it('routes an Error marker diagnostic (marker-in-generic-function, marker in a generic function) to mion/error', () => {
        const reports = reportsFor('error', 'generic-marker.ts');
        expect(reports).toHaveLength(1);
        expect(reports[0]!.message).toContain('[marker-in-generic-function]');
        expect(reports[0]!.line).toBe(locate(GENERIC_MARKER_TS, 'createValidateFn<T>()').line);
        expect(reportsFor('warning', 'generic-marker.ts')).toEqual([]);
      });

      it('checks a file whose marker comes only through a drizzle dialect package (marker-in-generic-function on tableFromType<T>())', () => {
        expect(DRIZZLE_GENERIC_TS).not.toContain('@mionjs/run-types');
        const reports = reportsFor('error', 'drizzle-generic.ts');
        expect(reports).toHaveLength(1);
        expect(reports[0]!.message).toContain('[marker-in-generic-function]');
        expect(reports[0]!.line).toBe(locate(DRIZZLE_GENERIC_TS, 'tableFromType<T>()').line);
      });

      it('checks a file whose marker comes through a local wrapper module (marker-in-generic-function on tableFromType<T>())', () => {
        expect(WRAPPED_GENERIC_TS).not.toContain('@mionjs/');
        const reports = reportsFor('error', 'wrapped-generic.ts');
        expect(reports).toHaveLength(1);
        expect(reports[0]!.message).toContain('[marker-in-generic-function]');
        expect(reports[0]!.line).toBe(locate(WRAPPED_GENERIC_TS, 'tableFromType<T>()').line);
      });

      it('reports the Info validate-method-dropped method drop only under mion/info', () => {
        expect(reportsFor('warning', 'widget.ts')).toEqual([]);
        expect(reportsFor('error', 'widget.ts')).toEqual([]);
        expect(reportsFor('runtime-error', 'widget.ts')).toEqual([]);
        const reports = reportsFor('info', 'widget.ts');
        expect(reports).toEqual([
          expect.objectContaining({
            message: expect.stringMatching(/\[validate-method-dropped\].*onClick/),
            line: locate(WIDGET_TS, 'createValidateFn<Widget>()').line,
          }),
        ]);
      });

      it('reports a JS-only-pattern sample mismatch as format-sample-mismatch under mion/runtime-error at the definition site', () => {
        const reports = reportsFor('runtime-error', 'unchecked-pattern.ts');
        expect(reports).toHaveLength(1);
        expect(reports[0]!.message).toContain('[format-sample-mismatch]');
        // The resolver's JS engine ran the real regex — the sample 'nope'
        // fails the JS-only lookbehind, so a plain sample mismatch (never a
        // missing-runtime format-no-js-runtime) is reported.
        expect(reports[0]!.message).toContain('nope');
        expect(reports[0]!.message).not.toContain('[format-no-js-runtime]');
        expect(reports[0]!.line).toBe(locate(UNCHECKED_PATTERN_TS, 'createValidateFn<TypeFormat').line);
      });
    });

    describe('enrichment findings, one pass routed by level', () => {
      it('the enrich-text-todo-left to-do reports once on the scaffold line with a tight tag span', () => {
        const reports = reportsFor('warning', 'mirror-dirty.ts').filter((report) =>
          report.message.includes('[enrich-text-todo-left]')
        );
        expect(reports).toHaveLength(1);
        const expected = locate(MIRROR_DIRTY_TS, TODO_TAG);
        expect(reports[0]).toMatchObject({line: expected.line, column: expected.column});
        expect(reports[0]!.endColumn).toBe(expected.column + TODO_TAG.length);
        // The @todo sits above the FriendlyText const → the enrich-text-* code.
        expect(reports[0]!.message).toContain('[enrich-text-todo-left]');
      });

      it('reports both carcass forms', () => {
        const reports = reportsFor('warning', 'mirror-dirty.ts').filter((report) =>
          /\[enrich-mock-orphan-(?:type|field)\]/.test(report.message)
        );
        expect(reports).toHaveLength(2);
        // Both carcasses carry no preserved annotation and sit after the last
        // const, so they attribute to the nearest-before MockData family.
        expect(reports[0]!.message).toContain('[enrich-mock-orphan-type]');
        expect(reports[0]!.line).toBe(locate(MIRROR_DIRTY_TS, '@rtOrphan export').line);
        expect(reports[1]!.message).toContain('[enrich-mock-orphan-field]');
        expect(reports[1]!.line).toBe(locate(MIRROR_DIRTY_TS, '@rtOrphanChild old').line);
      });

      it('anchors enrich-text-unknown-field/enrich-mock-unknown-field on the dead keys', () => {
        expect(codesFor('warning', 'mirror-dirty.ts').sort()).toEqual([
          'enrich-mock-orphan-field',
          'enrich-mock-orphan-type',
          'enrich-mock-unknown-field',
          'enrich-text-todo-left',
          'enrich-text-unknown-field',
        ]);
        const reports = reportsFor('warning', 'mirror-dirty.ts');
        const enrichTextUnknownField = reports.find((report) => report.message.includes('[enrich-text-unknown-field]'))!;
        expect(enrichTextUnknownField.message).toContain('`nope`');
        expect(enrichTextUnknownField).toMatchObject(locate(MIRROR_DIRTY_TS, 'nope:'));
        const enrichMockUnknownField = reports.find((report) => report.message.includes('[enrich-mock-unknown-field]'))!;
        expect(enrichMockUnknownField.message).toContain('`vanished`');
        expect(enrichMockUnknownField).toMatchObject(locate(MIRROR_DIRTY_TS, 'vanished:'));
      });

      it('reports enrich-mirror-source-missing on a dead breadcrumb under mion/runtime-error, anchored to the import', () => {
        const reports = reportsFor('runtime-error', 'mirror-drift.ts');
        expect(reports).toHaveLength(1);
        expect(reports[0]!.message).toContain('[enrich-mirror-source-missing]');
        expect(reports[0]!.message).toContain('./ghost');
        expect(reports[0]!.line).toBe(1);
      });

      it('a clean mirror (markers + @rtIds + valid content) produces ZERO reports on every rule', () => {
        for (const ruleName of LEVEL_RULES) expect(reportsFor(ruleName, 'mirror-clean.ts')).toEqual([]);
      });

      it('replays from the session cache: a second identical pass returns the same reports', () => {
        const first = reportsFor('warning', 'mirror-dirty.ts');
        const second = reportsFor('warning', 'mirror-dirty.ts');
        expect(second).toEqual(first);
      });
    });

    // A file with no runtypes marker still gets a resolver pass.
    describe('mion route findings', () => {
      it('reports each finding at its level, on a file with no runtypes marker', () => {
        expect(ROUTES_TS).not.toContain('@mionjs/run-types');
        expect(codesFor('runtime-error', 'routes.ts').sort()).toEqual([
          'rpc-handler-missing-param-type',
          'rpc-handler-missing-return-type',
          'rpc-handler-returns-non-rpc-error',
          'rpc-handler-throws',
        ]);
        expect(codesFor('error', 'routes.ts')).toEqual([]);
        expect(codesFor('warning', 'routes.ts')).toContain('rpc-handler-non-data-property');
      });

      it('reports nothing on correct routes, including the shapes a syntactic rule could not see', () => {
        for (const ruleName of LEVEL_RULES) {
          expect(reportsFor(ruleName, 'clean-routes.ts'), `mion/${ruleName} fired on a clean file`).toEqual([]);
        }
      });

      // A lint report carries no file, so a finding about a handler defined elsewhere must land at the ROUTE CALL.
      it('checks a handler imported from another module, and reports it at the route call', () => {
        const reports = reportsFor('runtime-error', 'importing-routes.ts');
        expect(reports.map((one) => one.message.slice(0, one.message.indexOf(']') + 1)).sort()).toEqual([
          '[rpc-handler-missing-return-type]',
          '[rpc-handler-throws]',
        ]);
        const lines = IMPORTING_ROUTES_TS.split('\n');
        for (const report of reports) {
          const line = lines[report.line - 1];
          expect(line, `report on line ${report.line} of a ${lines.length}-line file`).toBeDefined();
          expect(line, `${report.message.slice(0, report.message.indexOf(']') + 1)} landed on ${JSON.stringify(line)}`).toContain(
            'mion.route('
          );
        }
      });

      it('reports nothing on the handler module by itself', () => {
        expect(reportsFor('runtime-error', 'handlers.ts'), 'mion/runtime-error fired on a file that declares no route').toEqual(
          []
        );
      });
    });

    describe('scoping', () => {
      it('a hand-written file with a stray @todo comment never reaches the resolver (empty visitor)', () => {
        for (const ruleName of LEVEL_RULES) {
          const visitor = rules[ruleName].create({
            physicalFilename: abs.get('plain.ts')!,
            filename: abs.get('plain.ts')!,
            sourceCode: {text: PLAIN_TS},
            settings,
            report: () => {
              throw new Error('must not report');
            },
          } as never);
          expect(Object.keys(visitor)).toEqual([]);
        }
      });

      it('unnamed virtual buffers are skipped', () => {
        const visitor = rules['warning'].create({
          physicalFilename: '<input>',
          filename: '<input>',
          sourceCode: {text: MIRROR_DIRTY_TS},
          settings,
          report: () => {
            throw new Error('must not report');
          },
        } as never);
        expect(Object.keys(visitor)).toEqual([]);
      });
    });
  },
  120_000
);
