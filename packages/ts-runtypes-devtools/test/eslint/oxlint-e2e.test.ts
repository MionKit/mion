// End-to-end proof of the OXlint target: the REAL oxlint CLI loads the built
// plugin via jsPlugins, lints a dirty fixture project, and the findings come
// back under the runtypes/<rule> ids with error exit semantics. This is the
// commit-gate wiring (.oxlintrc.json + lint-staged) exercised for real —
// including the load-time resolver pre-spawn that survives oxlint's
// multi-threaded memory ramp.

import {execFile} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {TODO_LINE} from '../../src/go-generated/runtypes-constants.generated.ts';
import {BIN, hasBinary, makeFixtureProject, type FixtureProject} from './fixture.ts';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, '../../../..');
const OXLINT = path.resolve(ROOT, 'node_modules/.bin/oxlint');
const PLUGIN_DIST = path.resolve(__dirname, '../../dist/eslint/index.js');

const ready = hasBinary() && fs.existsSync(OXLINT) && fs.existsSync(PLUGIN_DIST);

describe.runIf(ready)('oxlint end to end (jsPlugins)', () => {
  let project: FixtureProject;

  beforeAll(() => {
    project = makeFixtureProject({
      'user.ts': 'export interface User {\n  name: string;\n}\n',
      'mirror.ts':
        "import type { User } from './user';\n" +
        "import type { FriendlyText } from '@ts-runtypes/core';\n\n" +
        '/** @rtType User#u1 @rtIds {name: n1} */\n' +
        `${TODO_LINE}\n` +
        'export const friendlyUser: FriendlyText<User> = {\n' +
        "  name: {rt$label: 'Name'},\n" +
        "  nope: {rt$label: 'Gone'},\n" +
        '};\n',
      'widget.ts':
        "import {createValidateFn} from '@ts-runtypes/core';\n\n" +
        'interface Widget {\n  label: string;\n  onClick: () => void;\n}\n\n' +
        'export const isWidget = createValidateFn<Widget>();\n',
    });
    project.write(
      '.oxlintrc.json',
      JSON.stringify(
        {
          categories: {correctness: 'off'},
          jsPlugins: [PLUGIN_DIST],
          // `cwd` is the transparency case: it is NOT a lint setting (the plugin
          // runs in oxlint's own cwd), so it must be ignored — loudly on stderr,
          // but without changing the findings asserted below. `binary` IS honoured
          // now and gets its own cases further down.
          settings: {runtypes: {cwd: '/nonexistent/not-a-project'}},
          rules: {
            'runtypes/validate-non-serializable': 'error',
            'runtypes/validate-skipped-member': 'warn',
            'runtypes/no-enrichment-todo': 'error',
            'runtypes/no-orphan-carcass': 'error',
            'runtypes/enrichment-field': 'error',
            'runtypes/enrichment-broken-source': 'error',
          },
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

  it('reports every family under runtypes/<rule> ids and fails the run on errors', {timeout: 120_000}, async () => {
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

    // Error-severity findings must fail the commit gate.
    expect(exitCode).toBe(1);
    expect(stdout).toContain('runtypes(no-enrichment-todo)');
    expect(stdout).toContain('[FT020]');
    expect(stdout).toContain('runtypes(enrichment-field)');
    expect(stdout).toContain('[FT002]');
    // Family A rides the same run: the VL011 method-drop warning from the widget
    // file lands under the validate family's skipped-member rule.
    expect(stdout).toContain('runtypes(validate-skipped-member)');
    expect(stdout).toContain('[VL011]');
    // The engine itself must not have failed.
    expect(stdout).not.toContain('resolver failed');
    expect(stdout).not.toContain('resolver unavailable');
  });

  // RT_BIN redirects the resolver for the whole toolchain, the lint lane included.
  // The unit suite covers getExePath itself; this proves the env var survives the
  // whole real path — oxlint host, plugin, worker, spawn shim.
  it('honours RT_BIN for the resolver binary', {timeout: 120_000}, async () => {
    const runOxlint = async (rtBin: string): Promise<{stdout: string; exitCode: number}> => {
      try {
        const result = await execFileAsync(OXLINT, ['-c', '.oxlintrc.json', '.'], {
          cwd: project.dir,
          env: {...process.env, RT_BIN: rtBin},
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
    expect(bogus.stdout).toContain('RT_BIN=/nonexistent/rt-bin-override');
    expect(bogus.stdout).toContain('does not exist');
  });

  // settings.runtypes.binary is the config-file twin of RT_BIN, and it WINS over
  // the env var — matching the bundler lane, where an explicit `binary` option
  // beats the launcher. Proving the precedence needs both set at once, which only
  // a real run can show: the unit test sees the option, not who spawned what.
  it('honours settings.runtypes.binary, and it beats RT_BIN', {timeout: 120_000}, async () => {
    const runWithSettings = async (binary: string, rtBin?: string): Promise<{stdout: string; exitCode: number}> => {
      const config = '.oxlintrc.binary.json';
      project.write(
        config,
        JSON.stringify({
          categories: {correctness: 'off'},
          jsPlugins: [PLUGIN_DIST],
          settings: {runtypes: {binary}},
          rules: {'runtypes/validate-skipped-member': 'warn', 'runtypes/broken-tsconfig': 'error'},
          ignorePatterns: ['node_modules/**'],
        })
      );
      const env = rtBin ? {...process.env, RT_BIN: rtBin} : process.env;
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

    // Config wins over the env var: a bogus RT_BIN alongside a good setting must
    // NOT break the run (if RT_BIN won, the launcher would throw).
    const configBeatsEnv = await runWithSettings(BIN, '/nonexistent/rt-bin-loser');
    expect(configBeatsEnv.stdout).toContain('[VL011]');
    expect(configBeatsEnv.stdout).not.toContain('rt-bin-loser');

    // And a bad configured path fails loudly, naming the setting rather than
    // silently falling back to the installed binary.
    const bogus = await runWithSettings('/nonexistent/settings-binary');
    expect(bogus.exitCode).toBe(1);
    expect(bogus.stdout).toContain('settings.runtypes.binary=/nonexistent/settings-binary');
  });

  it('the shipped oxlint-recommended.json works as a one-line extends from node_modules', {timeout: 120_000}, async () => {
    // The documented consumer layout: the package installed under
    // node_modules/@ts-runtypes/devtools (symlinked to this repo's package), the
    // user config a single `extends` of the shipped preset. The preset's own
    // jsPlugins path ("./dist/eslint/index.js") must resolve relative to the
    // preset file, and every rule rides at its RULE_SPECS default.
    fs.mkdirSync(path.join(project.dir, 'node_modules', '@ts-runtypes'), {recursive: true});
    fs.symlinkSync(path.resolve(__dirname, '../..'), path.join(project.dir, 'node_modules', '@ts-runtypes', 'devtools'));
    project.write(
      '.oxlintrc.extends.json',
      JSON.stringify(
        {
          categories: {correctness: 'off'},
          extends: ['./node_modules/@ts-runtypes/devtools/oxlint-recommended.json'],
          ignorePatterns: ['node_modules/**'],
        },
        null,
        2
      )
    );

    let stdout = '';
    let exitCode = 0;
    try {
      const result = await execFileAsync(OXLINT, ['-c', '.oxlintrc.extends.json', '.'], {cwd: project.dir});
      stdout = result.stdout;
    } catch (error) {
      const failed = error as {stdout?: string; code?: number};
      stdout = failed.stdout ?? '';
      exitCode = failed.code ?? 1;
    }

    // Same findings as the hand-written config: error-severity gates fail the
    // run, the validate advisory rides at its default warn level.
    expect(exitCode).toBe(1);
    expect(stdout).toContain('runtypes(no-enrichment-todo)');
    expect(stdout).toContain('runtypes(validate-skipped-member)');
    expect(stdout).toContain('[VL011]');
    expect(stdout).not.toContain('resolver failed');
  });
});

// A real consumer config drives the tsconfig setting end to end: oxlint reads
// `settings.runtypes.tsconfig` from the .oxlintrc.json, the plugin forwards it to
// the resolver as --tsconfig, and a cross-package type behind a `source` export
// condition resolves — no false MKR007. The runRule-based suite injects settings
// through a mock context; only this run proves they flow from an ACTUAL config
// through the real engine to the resolver spawn.
describe.runIf(ready)('oxlint tsconfig resolution end to end (settings.runtypes.tsconfig)', () => {
  let project: FixtureProject;

  // both getRunTypeId shapes + createValidateFn over a cross-package type — the
  // mion repro shape.
  const CONSUMER_SRC =
    "import {getRunTypeId, createValidateFn} from '@ts-runtypes/core';\n" +
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
        rules: {'runtypes/invalid-marker': 'error'},
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
      '.oxlintrc.source.json': oxlintrc({runtypes: {tsconfig: 'tsconfig.source.json'}}),
      '.oxlintrc.default.json': oxlintrc({runtypes: {}}),
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

  it('settings.runtypes.tsconfig resolves a source-condition cross-package marker (no MKR007)', {timeout: 120_000}, async () => {
    const {stdout, exitCode} = await runOxlint('.oxlintrc.source.json');
    expect(stdout).not.toContain('resolver failed');
    expect(stdout).not.toContain('resolver unavailable');
    expect(stdout).not.toContain('invalid-marker');
    expect(stdout).not.toContain('MKR007');
    expect(exitCode).toBe(0);
  });

  it(
    'without the source condition the same fixture still flags MKR007 (proves the setting is the mechanism)',
    {timeout: 120_000},
    async () => {
      const {stdout, exitCode} = await runOxlint('.oxlintrc.default.json');
      expect(exitCode).toBe(1);
      expect(stdout).toContain('runtypes(invalid-marker)');
      expect(stdout).toContain('[MKR007]');
    }
  );
});
