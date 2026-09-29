// The REAL oxlint CLI loads the built plugin via jsPlugins: the commit-gate wiring (.oxlintrc.json + lint-staged)
// for real, including the load-time resolver pre-spawn that survives oxlint's multi-threaded memory ramp.

import {execFile} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {TODO_LINE} from '../../src/core/go-generated/runtypes-constants.generated.ts';
import {BIN, hasBinary, makeFixtureProject, type FixtureProject} from './fixture.ts';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, '../../../..');
const OXLINT = path.resolve(ROOT, 'node_modules/.bin/oxlint');
const PLUGIN_DIST = path.resolve(__dirname, '../../dist/lint/index.js');

const ready = hasBinary() && fs.existsSync(OXLINT) && fs.existsSync(PLUGIN_DIST);

describe.runIf(ready)('oxlint end to end (jsPlugins)', () => {
  let project: FixtureProject;

  beforeAll(() => {
    project = makeFixtureProject({
      'user.ts': 'export interface User {\n  name: string;\n}\n',
      'mirror.ts':
        "import type { User } from './user';\n" +
        "import type { FriendlyText } from '@mionjs/run-types';\n\n" +
        '/** @rtType User#u1 @rtIds {name: n1} */\n' +
        `${TODO_LINE}\n` +
        'export const friendlyUser: FriendlyText<User> = {\n' +
        "  name: {rt$label: 'Name'},\n" +
        "  nope: {rt$label: 'Gone'},\n" +
        '};\n',
      'widget.ts':
        "import {createValidateFn} from '@mionjs/run-types';\n\n" +
        'interface Widget {\n  label: string;\n  onClick: () => void;\n}\n\n' +
        'export const isWidget = createValidateFn<Widget>();\n',
      // A mion route finding: it used to ride a second plugin object oxlint never loaded.
      'routes.ts':
        "import {createMionRouter} from '@mionjs/router';\n" +
        'const mion = createMionRouter();\n' +
        'export const noReturn = mion.route((ctx, name: string) => name);\n',
      // A RuntimeError: the build stops on it, so the lint run fails.
      'symbol.ts': "import {createValidateFn} from '@mionjs/run-types';\n\nexport const isSymbol = createValidateFn<symbol>();\n",
      // A lowered error: the build prints it as a warning, and so must the linter.
      'lowered.ts':
        "import {createValidateFn} from '@mionjs/run-types';\n\n" +
        '// @mion-downgrade-error VL002\n' +
        'export const isSymbol = createValidateFn<symbol>();\n',
    });
    project.write(
      '.oxlintrc.json',
      JSON.stringify(
        {
          categories: {correctness: 'off'},
          jsPlugins: [PLUGIN_DIST],
          // `cwd` is NOT a lint setting (the plugin runs in oxlint's cwd): it warns on stderr and changes no finding.
          // `mion/info` shows the Info VL011 these cases use as proof the engine ran.
          settings: {mion: {cwd: '/nonexistent/not-a-project'}},
          rules: {'mion/error': 'error', 'mion/runtime-error': 'error', 'mion/warning': 'warn', 'mion/info': 'warn'},
          ignorePatterns: ['node_modules/**'],
        },
        null,
        2
      )
    );
  });

  afterAll(() => {
    project.cleanup();
  });

  it('reports every level under mion/<level> ids and fails the run on errors', {timeout: 120_000}, async () => {
    let stdout = '';
    let exitCode = 0;
    try {
      const result = await execFileAsync(OXLINT, ['-c', '.oxlintrc.json', '.'], {cwd: project.dir});
      stdout = result.stdout;
    } catch (error) {
      const failed = error as {stdout?: string; code?: number};
      stdout = failed.stdout ?? '';
      exitCode = failed.code ?? 1;
    }

    // Error findings must fail the commit gate.
    expect(exitCode).toBe(1);
    expect(stdout).toContain('mion(runtime-error)');
    expect(stdout).toContain('[VL002]');
    expect(stdout).toContain('[MRT001]');
    expect(stdout).toContain('mion(warning)');
    expect(stdout).toContain('[FT020]');
    expect(stdout).toContain('[FT002]');
    // VL011 is Info, shown only because the config above turns mion/info on.
    expect(stdout).toContain('mion(info)');
    expect(stdout).toContain('[VL011]');
    // The engine itself must not have failed.
    expect(stdout).not.toContain('resolver failed');
    expect(stdout).not.toContain('resolver unavailable');
  });

  // MION_BIN redirects the resolver for the whole toolchain, the lint lane included.
  // The unit suite covers getExePath itself; this proves the env var survives the
  // whole real path — oxlint host, plugin, worker, spawn shim.
  it('honours MION_BIN for the resolver binary', {timeout: 120_000}, async () => {
    const runOxlint = async (rtBin: string): Promise<{stdout: string; exitCode: number}> => {
      try {
        const result = await execFileAsync(OXLINT, ['-c', '.oxlintrc.json', '.'], {
          cwd: project.dir,
          env: {...process.env, MION_BIN: rtBin},
        });
        return {stdout: result.stdout, exitCode: 0};
      } catch (error) {
        const failed = error as {stdout?: string; code?: number};
        return {stdout: failed.stdout ?? '', exitCode: failed.code ?? 1};
      }
    };

    // Pointed at the real binary the run behaves exactly like the baseline above.
    const honoured = await runOxlint(BIN);
    expect(honoured.stdout).toContain('[VL011]');
    expect(honoured.stdout).not.toContain('resolver failed');

    // Pointed at a path that isn't there, the launcher's own error reaches the
    // linter's output instead of the run silently falling back to another binary.
    const bogus = await runOxlint('/nonexistent/rt-bin-override');
    expect(bogus.exitCode).toBe(1);
    expect(bogus.stdout).toContain('MION_BIN=/nonexistent/rt-bin-override');
    expect(bogus.stdout).toContain('does not exist');
  });

  // settings.mion.binary beats MION_BIN, as an explicit `binary` option does in the bundler. Only a real run
  // can prove it: the unit test sees the option, not who spawned what.
  it('honours settings.mion.binary, and it beats MION_BIN', {timeout: 120_000}, async () => {
    const runWithSettings = async (binary: string, rtBin?: string): Promise<{stdout: string; exitCode: number}> => {
      const config = '.oxlintrc.binary.json';
      project.write(
        config,
        JSON.stringify({
          categories: {correctness: 'off'},
          jsPlugins: [PLUGIN_DIST],
          settings: {mion: {binary}},
          rules: {'mion/info': 'warn', 'mion/error': 'error'},
          ignorePatterns: ['node_modules/**'],
        })
      );
      const env = rtBin ? {...process.env, MION_BIN: rtBin} : process.env;
      try {
        const result = await execFileAsync(OXLINT, ['-c', config, '.'], {cwd: project.dir, env});
        return {stdout: result.stdout, exitCode: 0};
      } catch (error) {
        const failed = error as {stdout?: string; code?: number};
        return {stdout: failed.stdout ?? '', exitCode: failed.code ?? 1};
      }
    };

    // The real binary from the config alone: findings, no engine failure.
    const configured = await runWithSettings(BIN);
    expect(configured.stdout).toContain('[VL011]');
    expect(configured.stdout).not.toContain('resolver failed');

    // Config wins over the env var: a bogus MION_BIN alongside a good setting must
    // NOT break the run (if MION_BIN won, the launcher would throw).
    const configBeatsEnv = await runWithSettings(BIN, '/nonexistent/rt-bin-loser');
    expect(configBeatsEnv.stdout).toContain('[VL011]');
    expect(configBeatsEnv.stdout).not.toContain('rt-bin-loser');

    // And a bad configured path fails loudly, naming the setting rather than
    // silently falling back to the installed binary.
    const bogus = await runWithSettings('/nonexistent/settings-binary');
    expect(bogus.exitCode).toBe(1);
    expect(bogus.stdout).toContain('settings.mion.binary=/nonexistent/settings-binary');
  });

  // The documented consumer layout: a symlinked node_modules/@mionjs/devtools and a config that only `extends` the preset.
  // The preset's jsPlugins path must resolve relative to the preset file, and every rule runs at its RULE_SPECS default.
  // JSON output: oxlint prints GitHub annotations on CI, so plain text differs there.
  interface OxlintDiagnostic {
    message: string;
    code: string;
    severity: string;
    filename: string;
    labels: {span: {line: number}}[];
  }
  const runPreset = async (
    config: string,
    settings?: Record<string, unknown>,
    rules?: Record<string, string>
  ): Promise<{diagnostics: OxlintDiagnostic[]; stdout: string; exitCode: number}> => {
    const link = path.join(project.dir, 'node_modules', '@mionjs', 'devtools');
    if (!fs.existsSync(link)) {
      fs.mkdirSync(path.dirname(link), {recursive: true});
      fs.symlinkSync(path.resolve(__dirname, '../..'), link);
    }
    project.write(
      config,
      JSON.stringify(
        {
          categories: {correctness: 'off'},
          extends: ['./node_modules/@mionjs/devtools/oxlint-recommended.json'],
          ...(settings ? {settings} : {}),
          ...(rules ? {rules} : {}),
          ignorePatterns: ['node_modules/**'],
        },
        null,
        2
      )
    );
    let stdout = '';
    let exitCode = 0;
    try {
      stdout = (await execFileAsync(OXLINT, ['-c', config, '-f', 'json', '.'], {cwd: project.dir})).stdout;
    } catch (error) {
      const failed = error as {stdout?: string; code?: number};
      stdout = failed.stdout ?? '';
      exitCode = failed.code ?? 1;
    }
    const diagnostics = (JSON.parse(stdout) as {diagnostics: OxlintDiagnostic[]}).diagnostics;
    return {diagnostics, stdout, exitCode};
  };

  it('the shipped oxlint-recommended.json works as a one-line extends from node_modules', {timeout: 120_000}, async () => {
    const {diagnostics, stdout, exitCode} = await runPreset('.oxlintrc.extends.json');
    // Error findings fail the run; the engine ran.
    expect(exitCode).toBe(1);
    expect(
      diagnostics.some((diagnostic) => diagnostic.code === 'mion(runtime-error)' && diagnostic.message.includes('[VL002]'))
    ).toBe(true);
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'mion(warning)' && diagnostic.message.includes('[FT020]'))).toBe(
      true
    );
    expect(stdout).not.toContain('resolver failed');
    // The Info-level VL011 method drop is hidden by default.
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes('[VL011]'))).toBe(false);
    // A `@mion-downgrade-error` line reports as a WARNING under mion/warning, like the build prints it.
    expect(diagnostics.filter((diagnostic) => diagnostic.filename === 'lowered.ts')).toEqual([
      expect.objectContaining({
        code: 'mion(warning)',
        severity: 'warning',
        labels: [expect.objectContaining({span: expect.objectContaining({line: 4})})],
        message: expect.stringMatching(/^\[VL002\] .*\(downgraded\)$/),
      }),
    ]);
  });

  it('the preset plus mion/info turned on shows Info findings at warn', {timeout: 120_000}, async () => {
    const {diagnostics, stdout} = await runPreset('.oxlintrc.extends-all.json', undefined, {'mion/info': 'warn'});
    expect(diagnostics.filter((diagnostic) => diagnostic.filename === 'widget.ts')).toEqual([
      expect.objectContaining({
        code: 'mion(info)',
        severity: 'warning',
        message: expect.stringContaining('[VL011]'),
      }),
    ]);
    expect(stdout).not.toContain('resolver failed');
  });
});

// Only this run proves `settings.mion.tsconfig` flows from an ACTUAL .oxlintrc.json to the resolver's --tsconfig,
// so a cross-package type behind a `source` export condition resolves with no false MKR007.
describe.runIf(ready)('oxlint tsconfig resolution end to end (settings.mion.tsconfig)', () => {
  let project: FixtureProject;

  // both getRunTypeId shapes + createValidateFn over a cross-package type — the
  // mion repro shape.
  const CONSUMER_SRC =
    "import {getRunTypeId, createValidateFn} from '@mionjs/run-types';\n" +
    "import type {CrossPkgUser} from '@app/models';\n\n" +
    'getRunTypeId<CrossPkgUser>();\n' +
    'declare const sample: CrossPkgUser;\n' +
    'getRunTypeId(sample);\n' +
    'export const validateUser = createValidateFn<CrossPkgUser>();\n';

  const tsconfig = (customConditions?: string[]): string =>
    JSON.stringify({
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'bundler',
        target: 'ESNext',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        ...(customConditions ? {customConditions} : {}),
        types: [],
      },
    });

  const oxlintrc = (settings: Record<string, unknown>): string =>
    JSON.stringify(
      {
        categories: {correctness: 'off'},
        jsPlugins: [PLUGIN_DIST],
        settings,
        rules: {'mion/error': 'error', 'mion/runtime-error': 'error'},
        ignorePatterns: ['node_modules/**'],
      },
      null,
      2
    );

  beforeAll(() => {
    project = makeFixtureProject({
      // @app/models exposes CrossPkgUser ONLY behind `source`; its import entry
      // points at an unbuilt dist that does not exist. The default tsconfig.json has
      // NO customConditions, so resolving it can ONLY be explained by the settings
      // override being read from the real config.
      'node_modules/@app/models/package.json':
        '{"name":"@app/models","exports":{".":{"source":"./src/index.ts","import":"./dist/index.js"}}}',
      'node_modules/@app/models/src/index.ts': 'export interface CrossPkgUser { id: string; name: string; age: number }\n',
      'tsconfig.json': tsconfig(),
      'tsconfig.source.json': tsconfig(['source']),
      'consumer.ts': CONSUMER_SRC,
      '.oxlintrc.source.json': oxlintrc({mion: {tsconfig: 'tsconfig.source.json'}}),
      '.oxlintrc.default.json': oxlintrc({mion: {}}),
    });
  });

  afterAll(() => project.cleanup());

  const runOxlint = async (config: string): Promise<{stdout: string; exitCode: number}> => {
    try {
      const {stdout} = await execFileAsync(OXLINT, ['-c', config, '.'], {cwd: project.dir});
      return {stdout, exitCode: 0};
    } catch (error) {
      const failed = error as {stdout?: string; code?: number};
      return {stdout: failed.stdout ?? '', exitCode: failed.code ?? 1};
    }
  };

  it('settings.mion.tsconfig resolves a source-condition cross-package marker (no MKR007)', {timeout: 120_000}, async () => {
    const {stdout, exitCode} = await runOxlint('.oxlintrc.source.json');
    expect(stdout).not.toContain('resolver failed');
    expect(stdout).not.toContain('resolver unavailable');
    expect(stdout).not.toContain('mion(runtime-error)');
    expect(stdout).not.toContain('MKR007');
    expect(exitCode).toBe(0);
  });

  it(
    'without the source condition the same fixture still flags MKR007 (proves the setting is the mechanism)',
    {timeout: 120_000},
    async () => {
      const {stdout, exitCode} = await runOxlint('.oxlintrc.default.json');
      expect(exitCode).toBe(1);
      expect(stdout).toContain('mion(runtime-error)');
      expect(stdout).toContain('[MKR007]');
    }
  );
});

// The tsconfig `downgradeErrors` reaches the linter, so a code lowered for the build is a warning in the editor too.
describe.runIf(ready)('oxlint end to end with the tsconfig downgradeErrors key', () => {
  let project: FixtureProject;

  beforeAll(() => {
    project = makeFixtureProject({
      'tsconfig.json': JSON.stringify({compilerOptions: {strict: true, plugins: [{name: 'mion', downgradeErrors: ['VL002']}]}}),
      'symbol.ts':
        "import {createValidateFn, getRunTypeId} from '@mionjs/run-types';\n\n" +
        'export const isSymbol = createValidateFn<symbol>();\n' +
        'export const idStatic = getRunTypeId<{name: string}>();\n' +
        "const sample = {name: 'Ada'};\n" +
        'export const idReflected = getRunTypeId(sample);\n',
      '.oxlintrc.json': JSON.stringify({
        categories: {correctness: 'off'},
        jsPlugins: [PLUGIN_DIST],
        rules: {'mion/error': 'error', 'mion/runtime-error': 'error', 'mion/warning': 'warn'},
        ignorePatterns: ['node_modules/**'],
      }),
    });
  });

  afterAll(() => project.cleanup());

  it('reports a tsconfig-lowered VL002 as a downgraded warning, like the build', {timeout: 120_000}, async () => {
    const {stdout, exitCode} = await execFileAsync(OXLINT, ['-c', '.oxlintrc.json', '.'], {cwd: project.dir}).then(
      ({stdout}) => ({stdout, exitCode: 0}),
      (error: {stdout?: string; code?: number}) => ({stdout: error.stdout ?? '', exitCode: error.code ?? 1})
    );
    expect(stdout).toContain('mion(warning)');
    expect(stdout).toMatch(/\[VL002\].*\(downgraded\)/);
    expect(stdout).not.toContain('mion(runtime-error)');
    expect(exitCode).toBe(0);
  });
});

// A lint report carries no file: a lint of c.ts must not report the a.ts / b.ts override pair at c.ts positions.
describe.runIf(ready)('oxlint reports only the linted file findings', () => {
  let project: FixtureProject;

  beforeAll(() => {
    project = makeFixtureProject({
      'a.ts': "import {overrideValidate} from '@mionjs/run-types';\n\noverrideValidate<string>((v) => typeof v === 'string');\n",
      'b.ts':
        "import {overrideValidate} from '@mionjs/run-types';\nimport './a';\n\noverrideValidate<string>((v) => v !== null);\n",
      'c.ts':
        "import {getRunTypeId} from '@mionjs/run-types';\nimport './b';\n\n" +
        'export const idStatic = getRunTypeId<{name: string}>();\n' +
        "const sample = {name: 'Ada'};\n" +
        'export const idReflected = getRunTypeId(sample);\n',
      '.oxlintrc.json': JSON.stringify({
        categories: {correctness: 'off'},
        jsPlugins: [PLUGIN_DIST],
        rules: {'mion/error': 'error', 'mion/runtime-error': 'error', 'mion/warning': 'warn', 'mion/info': 'warn'},
        ignorePatterns: ['node_modules/**'],
      }),
    });
  });

  afterAll(() => project.cleanup());

  const lintCodes = async (file: string) => {
    const stdout = await execFileAsync(OXLINT, ['-c', '.oxlintrc.json', '-f', 'json', file], {cwd: project.dir}).then(
      ({stdout}) => stdout,
      (error: {stdout?: string}) => error.stdout ?? ''
    );
    return (JSON.parse(stdout) as {diagnostics: {message: string}[]}).diagnostics.map((diagnostic) =>
      diagnostic.message.slice(0, 8)
    );
  };

  it('keeps the override pair out of a lint of c.ts, and reports it when b.ts is linted', {timeout: 120_000}, async () => {
    expect((await lintCodes('c.ts')).filter((code) => code.startsWith('[OVR'))).toEqual([]);
    expect(await lintCodes('b.ts')).toContain('[OVR001]');
  });
});
