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
import plugin, {meta, mionPlugin, rules, sessionOptions} from '../../src/lint/index.ts';
import {RULE_SPECS} from '../../src/lint/diagnosticRouting.ts';
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

// ROUTES_TS carries one finding of each mion route rule and NO runtypes marker,
// which is the point of the fixture: a route file need not import the marker
// package, so the pre-filter has to admit it on the router signals alone or the
// rules would never run.
const ROUTES_TS = `import {createMionRouter} from '@mionjs/router';
const mion = createMionRouter();
export interface Wire { ok: number; constructor: string }
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

// CLEAN_ROUTES_TS is the same file written correctly, plus the two handler
// shapes the old syntactic rules could not see at all.
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

// A format pattern that uses a JS-only lookbehind and carries a mockSample
// that does NOT match the real regex. The resolver runs every pattern check
// on a real JS engine (its node/bun sidecar), so the mismatch arrives as an
// ordinary FMT001 diagnostic — the lint worker no longer re-checks anything
// itself. The local TypeFormat brand is recognised structurally, same as
// the Go resolver tests.
const UNCHECKED_PATTERN_TS = `import {createValidateFn} from '@mionjs/run-types';

type TypeFormat<Base, Name extends string, Params> = Base & {
  readonly __rtFormatName?: Name;
  readonly __rtFormatParams?: Params;
};

export const isCode = createValidateFn<TypeFormat<string, 'stringFormat', {pattern: {source: '(?<=x)y'; flags: ''; mockSamples: ['nope']}}>>();
`;

// Transparency: the plugin reads timeoutMs and tsconfig. binary / cwd / socket
// under settings.runtypes are NOT read — the resolver binary and working
// directory are resolved automatically, like any other linter. Pure function,
// so this runs without the resolver binary.
describe('sessionOptions — timeoutMs, tsconfig and binary are configurable', () => {
  it('reads timeoutMs, tsconfig and binary, drops cwd and socket', () => {
    expect(
      sessionOptions({runtypes: {binary: '/x', cwd: '/y', socket: '/z', timeoutMs: 5000, tsconfig: './tsconfig.lint.json'}})
    ).toEqual({binary: '/x', timeoutMs: 5000, tsconfig: './tsconfig.lint.json'});
  });

  // A dropped key used to be invisible, which is how the e2e fixture spent
  // months believing it had redirected the binary. One warning per key per run:
  // enough to notice, not enough to drown a lint of a thousand files.
  it('warns once per unsupported key, naming it and the supported set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // A key no other test uses: the warning is once per PROCESS, so a shared
      // key would make this depend on which test ran first.
      sessionOptions({runtypes: {bogusKnob: '/y', timeoutMs: 1}});
      sessionOptions({runtypes: {bogusKnob: '/y'}});
      sessionOptions({runtypes: {bogusKnob: '/y'}});
      const messages = warn.mock.calls.map((call) => String(call[0]));
      expect(messages.filter((message) => message.includes('settings.runtypes.bogusKnob'))).toHaveLength(1);
      expect(messages[0]).toContain('tsconfig');
      expect(messages[0]).toContain('binary');
    } finally {
      warn.mockRestore();
    }
  });

  it('says nothing about supported keys', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      sessionOptions({runtypes: {timeoutMs: 1, tsconfig: 'tsconfig.json', binary: '/x'}});
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('reads tsconfig on its own', () => {
    expect(sessionOptions({runtypes: {tsconfig: 'tsconfig.build.json'}})).toEqual({tsconfig: 'tsconfig.build.json'});
  });

  it('is empty when settings are absent or carry no runtypes bag', () => {
    expect(sessionOptions(undefined)).toEqual({});
    expect(sessionOptions({other: {}})).toEqual({});
  });
});

// recommended is what the docs tell ESLint users to spread. Guard its shape:
// both plugins registered, and one entry per runtypes rule at its RULE_SPECS
// default.
//
// It carries TWO namespaces since the devtools packages merged. `runtypes/*` is
// the transform's diagnostic surface; `@mionjs/*` is mion's own rule set, which
// used to ship from a separate package's own recommended. oxlint never reads
// this config (its .oxlintrc.json lists rules itself and takes only `meta` +
// `rules` off the default export), so this is ESLint's entry point and the one
// place the two families come together.
const RUNTYPES_SPECS = RULE_SPECS.filter((spec) => spec.namespace === 'runtypes');
const MION_SPECS = RULE_SPECS.filter((spec) => spec.namespace === '@mionjs');

describe('configs.recommended — every rule at its family default', () => {
  it('registers both plugins and sets every rule to its default level, under its own prefix', () => {
    const rec = plugin.configs['recommended'] as {plugins: Record<string, unknown>; rules: Record<string, string>};
    expect(rec.plugins['runtypes']).toBe(plugin);
    expect(rec.plugins['@mionjs']).toBe(mionPlugin);
    expect(Object.keys(rec.rules).sort()).toEqual(RULE_SPECS.map((spec) => `${spec.namespace}/${spec.name}`).sort());
    for (const spec of RULE_SPECS) expect(rec.rules[`${spec.namespace}/${spec.name}`]).toBe(spec.default);
  });

  // The mion half, asserted on its own: the table is partitioned by namespace,
  // so a bad partition would still satisfy a whole-table check.
  it('enables mion own rules under the @mionjs prefix', () => {
    const rec = plugin.configs['recommended'] as {plugins: Record<string, unknown>; rules: Record<string, string>};
    expect(MION_SPECS.map((spec) => spec.name).sort()).toEqual([
      'no-throw-in-handlers',
      'no-unsafe-property-names',
      'returned-error-type',
      'strong-typed-routes',
    ]);
    for (const spec of MION_SPECS) expect(rec.rules[`@mionjs/${spec.name}`]).toBe('error');
    // Every rule the mion plugin exposes must be addressable under that prefix.
    for (const name of Object.keys(mionPlugin.rules)) {
      expect(mionPlugin.rules[name], `@mionjs/${name} is registered but has no rule module`).toBeTruthy();
    }
  });

  // enforce-type-imports is the one hand-written rule left. It stays out of
  // recommended: it reports nothing without a `backendSources` option, so a
  // project opts in and configures it in the same edit.
  it('keeps enforce-type-imports registered but out of recommended', () => {
    const rec = plugin.configs['recommended'] as {rules: Record<string, string>};
    expect(mionPlugin.rules['enforce-type-imports']).toBeTruthy();
    expect(rec.rules['@mionjs/enforce-type-imports']).toBeUndefined();
  });

  // The runtypes plugin carries ONLY its own namespace: a mion rule leaking into
  // the default export would make oxlint load a rule it has no prefix for.
  it('keeps the two namespaces apart', () => {
    expect(Object.keys(rules).sort()).toEqual(RUNTYPES_SPECS.map((spec) => spec.name).sort());
    for (const spec of MION_SPECS) expect(rules[spec.name as keyof typeof rules]).toBeUndefined();
  });
});

// oxlint-recommended.json is the OXlint twin of configs.recommended: oxlint has
// no plugin-exported presets, but its `extends` takes config FILE paths, so the
// package ships a ready-made config (jsPlugins + every rule at its default)
// that a consumer extends with one line. Pin it against RULE_SPECS so a rule
// rename or default change can never leave the shipped preset behind.
describe('oxlint-recommended.json — the shipped extends preset matches RULE_SPECS', () => {
  it('carries the dist plugin path and every rule at its default level', () => {
    const presetPath = new URL('../../oxlint-recommended.json', import.meta.url);
    const preset = JSON.parse(fs.readFileSync(presetPath, 'utf8')) as {jsPlugins: string[]; rules: Record<string, string>};
    expect(preset.jsPlugins).toEqual(['./dist/lint/index.js']);
    expect(preset.rules).toEqual(Object.fromEntries(RUNTYPES_SPECS.map((spec) => [`runtypes/${spec.name}`, spec.default])));
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
      for (const rel of Object.keys(texts)) abs.set(rel, `${project.dir}/${rel}`);
      // The plugin roots the resolver at process.cwd() (cwd is no longer
      // configurable), exactly like a real editor/CI run from the project
      // root — so drive this in-process suite from the fixture dir. Restored
      // in afterAll. No binary setting: getExePath() resolves the built
      // mion-bin/mion in this repo, the same path the old `binary` pointed at.
      originalCwd = process.cwd();
      process.chdir(project.dir);
      settings = {};
    });

    afterAll(() => {
      resetSharedSession();
      process.chdir(originalCwd);
      project.cleanup();
    });

    function reportsFor(ruleName: keyof typeof rules, rel: string): LintReportedProblem[] {
      return runRule(rules[ruleName], abs.get(rel)!, texts[rel]!, settings);
    }

    // The mion rules ride the other plugin object, but the same transport: one
    // resolver pass per file serves both namespaces.
    function mionReportsFor(ruleName: string, rel: string): LintReportedProblem[] {
      return runRule(mionPlugin.rules[ruleName]!, abs.get(rel)!, texts[rel]!, settings);
    }

    it('exposes the runtypes namespace and one rule per RULE_SPECS entry', () => {
      expect(meta.name).toBe('runtypes');
      expect(Object.keys(rules).sort()).toEqual(RUNTYPES_SPECS.map((spec) => spec.name).sort());
      expect(plugin.configs['recommended']).toBeDefined();
    });

    describe('Family A — compiler diagnostics grouped by family', () => {
      it('reports nothing on a clean file using BOTH getRunTypeId shapes', () => {
        for (const ruleName of [
          'invalid-marker',
          'redundant-marker',
          'validate-non-serializable',
          'validate-skipped-member',
        ] as const) {
          expect(reportsFor(ruleName, 'forms.ts')).toEqual([]);
        }
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

      it('routes a Warning-severity marker diagnostic (MKR001, reflection form invoking a function) to runtypes/redundant-marker', () => {
        const reports = reportsFor('redundant-marker', 'bad-form.ts');
        expect(reports).toHaveLength(1);
        expect(reports[0]!.message).toContain('[MKR001]');
        expect(reports[0]!.message).toContain('load');
        expect(reports[0]!.line).toBe(locate(BAD_FORM_TS, 'getRunTypeId(load())').line);
        expect(reportsFor('invalid-marker', 'bad-form.ts')).toEqual([]);
      });

      it('routes an Error-severity marker diagnostic (MKR003, marker in a generic function) to runtypes/invalid-marker', () => {
        const reports = reportsFor('invalid-marker', 'generic-marker.ts');
        expect(reports).toHaveLength(1);
        expect(reports[0]!.message).toContain('[MKR003]');
        expect(reports[0]!.line).toBe(locate(GENERIC_MARKER_TS, 'createValidateFn<T>()').line);
        expect(reportsFor('redundant-marker', 'generic-marker.ts')).toEqual([]);
      });

      it('surfaces RunType render diagnostics (VL011 method drop) under runtypes/validate-skipped-member without entry modules on the wire', () => {
        const reports = reportsFor('validate-skipped-member', 'widget.ts');
        expect(reports).toHaveLength(1);
        expect(reports[0]!.message).toContain('[VL011]');
        expect(reports[0]!.message).toContain('onClick');
        expect(reports[0]!.line).toBe(locate(WIDGET_TS, 'createValidateFn<Widget>()').line);
      });

      it('reports a JS-only-pattern sample mismatch as FMT001 under runtypes/format at the definition site', () => {
        const reports = reportsFor('format', 'unchecked-pattern.ts');
        expect(reports).toHaveLength(1);
        expect(reports[0]!.message).toContain('[FMT001]');
        // The resolver's JS engine ran the real regex — the sample 'nope'
        // fails the JS-only lookbehind, so a plain sample mismatch (never a
        // missing-runtime FMT004) is reported.
        expect(reports[0]!.message).toContain('nope');
        expect(reports[0]!.message).not.toContain('[FMT004]');
        expect(reports[0]!.line).toBe(locate(UNCHECKED_PATTERN_TS, 'createValidateFn<TypeFormat').line);
      });
    });

    describe('enrichment rules — one pass, per-concern routing', () => {
      it('no-enrichment-todo fires once on the scaffold line with a tight tag span', () => {
        const reports = reportsFor('no-enrichment-todo', 'mirror-dirty.ts');
        expect(reports).toHaveLength(1);
        const expected = locate(MIRROR_DIRTY_TS, TODO_TAG);
        expect(reports[0]).toMatchObject({line: expected.line, column: expected.column});
        expect(reports[0]!.endColumn).toBe(expected.column + TODO_TAG.length);
        // The @todo sits above the FriendlyType const → the FT-family code.
        expect(reports[0]!.message).toContain('[FT020]');
      });

      it('no-orphan-carcass fires on both carcass forms', () => {
        const reports = reportsFor('no-orphan-carcass', 'mirror-dirty.ts');
        expect(reports).toHaveLength(2);
        // Both carcasses carry no preserved annotation and sit after the last
        // const, so they attribute to the nearest-before MockData family.
        expect(reports[0]!.message).toContain('[MD021]');
        expect(reports[0]!.line).toBe(locate(MIRROR_DIRTY_TS, '@rtOrphan export').line);
        expect(reports[1]!.message).toContain('[MD022]');
        expect(reports[1]!.line).toBe(locate(MIRROR_DIRTY_TS, '@rtOrphanChild old').line);
      });

      it('enrichment-field anchors FT002/MD001 on the dead keys', () => {
        const reports = reportsFor('enrichment-field', 'mirror-dirty.ts');
        expect(reports).toHaveLength(2);
        const ft002 = reports.find((report) => report.message.includes('[FT002]'))!;
        expect(ft002.message).toContain('`nope`');
        expect(ft002).toMatchObject(locate(MIRROR_DIRTY_TS, 'nope:'));
        const md001 = reports.find((report) => report.message.includes('[MD001]'))!;
        expect(md001.message).toContain('`vanished`');
        expect(md001).toMatchObject(locate(MIRROR_DIRTY_TS, 'vanished:'));
      });

      it('enrichment-broken-source reports GE002 on a dead breadcrumb, anchored to the import', () => {
        const reports = reportsFor('enrichment-broken-source', 'mirror-drift.ts');
        expect(reports).toHaveLength(1);
        expect(reports[0]!.message).toContain('[GE002]');
        expect(reports[0]!.message).toContain('./ghost');
        expect(reports[0]!.line).toBe(1);
      });

      it('a clean mirror (markers + @rtIds + valid content) produces ZERO reports on every rule', () => {
        for (const ruleName of Object.keys(rules) as (keyof typeof rules)[]) {
          expect(reportsFor(ruleName, 'mirror-clean.ts')).toEqual([]);
        }
      });

      it('replays from the session cache: a second identical pass returns the same reports', () => {
        const first = reportsFor('no-enrichment-todo', 'mirror-dirty.ts');
        const second = reportsFor('no-enrichment-todo', 'mirror-dirty.ts');
        expect(second).toEqual(first);
      });
    });

    // The mion route rules, end to end: the compiler produces them, the routing
    // layer fans them to four separate rules, and a file with no runtypes marker
    // still gets a resolver pass.
    describe('Family C — mion route rules', () => {
      it('routes each finding to its own rule, on a file with no runtypes marker', () => {
        expect(ROUTES_TS).not.toContain('@mionjs/run-types');
        for (const [ruleName, code] of [
          ['strong-typed-routes', 'MRT001'],
          ['no-throw-in-handlers', 'MRT003'],
          ['returned-error-type', 'MRT004'],
          ['no-unsafe-property-names', 'MRT005'],
        ] as const) {
          const reports = mionReportsFor(ruleName, 'routes.ts');
          expect(reports.length, `${ruleName} reported nothing`).toBeGreaterThan(0);
          expect(
            reports.some((one) => one.message.includes(`[${code}]`)),
            `${ruleName} did not carry ${code}`
          ).toBe(true);
        }
        // Both annotation codes ride strong-typed-routes, and neither leaks into
        // another rule.
        const annotations = mionReportsFor('strong-typed-routes', 'routes.ts').map((one) => one.message);
        expect(annotations.some((message) => message.includes('[MRT001]'))).toBe(true);
        expect(annotations.some((message) => message.includes('[MRT002]'))).toBe(true);
      });

      it('reports nothing on correct routes, including the shapes a syntactic rule could not see', () => {
        for (const ruleName of [
          'strong-typed-routes',
          'no-throw-in-handlers',
          'returned-error-type',
          'no-unsafe-property-names',
        ]) {
          expect(mionReportsFor(ruleName, 'clean-routes.ts'), `${ruleName} fired on a clean file`).toEqual([]);
        }
      });

      // A lint report carries a line and column but no file: the host pins it to
      // the file it is linting. So a finding about a handler defined elsewhere
      // has to be reported at the ROUTE CALL, or it lands on an unrelated line
      // of this file, or on no line at all.
      it('checks a handler imported from another module, and reports it at the route call', () => {
        const reports = [
          ...mionReportsFor('strong-typed-routes', 'importing-routes.ts'),
          ...mionReportsFor('no-throw-in-handlers', 'importing-routes.ts'),
        ];
        expect(reports.map((one) => one.message.slice(0, 8)).sort()).toEqual(['[MRT001]', '[MRT003]']);
        const lines = IMPORTING_ROUTES_TS.split('\n');
        for (const report of reports) {
          const line = lines[report.line - 1];
          expect(line, `report on line ${report.line} of a ${lines.length}-line file`).toBeDefined();
          expect(line, `[${report.message.slice(1, 7)}] landed on ${JSON.stringify(line)}`).toContain('mion.route(');
        }
      });

      it('reports nothing on the handler module by itself', () => {
        for (const ruleName of ['strong-typed-routes', 'no-throw-in-handlers']) {
          expect(mionReportsFor(ruleName, 'handlers.ts'), `${ruleName} fired on a file that declares no route`).toEqual([]);
        }
      });

      it('a runtypes rule never reports a mion route finding', () => {
        expect(reportsFor('other', 'routes.ts')).toEqual([]);
        expect(reportsFor('invalid-marker', 'routes.ts')).toEqual([]);
      });
    });

    describe('scoping', () => {
      it('a hand-written file with a stray @todo comment never reaches the resolver (empty visitor)', () => {
        for (const ruleName of Object.keys(rules) as (keyof typeof rules)[]) {
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
        const visitor = rules['no-enrichment-todo'].create({
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
