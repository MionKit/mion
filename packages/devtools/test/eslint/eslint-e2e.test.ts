// The REAL ESLint class loads the BUILT plugin through `configs.recommended`. Info shows only with `levels: 'all'`,
// and a `@mion-downgrade-error` line reports as a warning under `runtypes/downgraded-error`, like the build prints it.

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ESLint, type Linter} from 'eslint';
import tseslint from 'typescript-eslint';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {hasBinary, makeFixtureProject, type FixtureProject} from './fixture.ts';

const DIST = path.resolve(__dirname, '../../dist/lint');
const ready = hasBinary() && fs.existsSync(path.join(DIST, 'index.js'));

const WIDGET_TS = `import {createValidateFn} from '@mionjs/run-types';

class Widget {
  label = 'ok';
  render(): string { return this.label; }
}

export const isWidget = createValidateFn<Widget>();
`;

const LOWERED_TS = `import {createValidateFn} from '@mionjs/run-types';

// @mion-downgrade-error VL002
export const isSymbol = createValidateFn<symbol>();
`;

interface LintPlugin {
  configs: {recommended: Linter.Config};
}

describe.runIf(ready)('eslint end to end (configs.recommended from the built plugin)', () => {
  let project: FixtureProject;
  let plugin: LintPlugin;
  let resetSession: () => void;
  let originalCwd: string;

  beforeAll(async () => {
    project = makeFixtureProject({'widget.ts': WIDGET_TS, 'lowered.ts': LOWERED_TS});
    // The plugin roots its resolver at process.cwd(), like an editor or CI run from the project root.
    originalCwd = process.cwd();
    process.chdir(project.dir);
    plugin = ((await import(pathToFileURL(path.join(DIST, 'index.js')).href)) as {default: LintPlugin}).default;
    resetSession = ((await import(pathToFileURL(path.join(DIST, 'session.js')).href)) as {resetSharedSession: () => void})
      .resetSharedSession;
  });

  afterAll(() => {
    resetSession?.();
    process.chdir(originalCwd);
    project?.cleanup();
  });

  const lint = async (settings?: Record<string, unknown>): Promise<Map<string, Linter.LintMessage[]>> => {
    const eslint = new ESLint({
      cwd: project.dir,
      overrideConfigFile: true,
      overrideConfig: [
        {files: ['**/*.ts'], languageOptions: {parser: tseslint.parser as Linter.Parser}},
        plugin.configs.recommended,
        ...(settings ? [{settings}] : []),
      ],
    });
    const results = await eslint.lintFiles(['widget.ts', 'lowered.ts']);
    return new Map(results.map((result) => [path.basename(result.filePath), result.messages]));
  };

  it('hides the Info-level VL011 method drop by default', {timeout: 120_000}, async () => {
    const messages = await lint();
    expect(messages.get('widget.ts')).toEqual([]);
  });

  it('reports a @mion-downgrade-error line as a warning under runtypes/downgraded-error', {timeout: 120_000}, async () => {
    const lowered = (await lint()).get('lowered.ts')!;
    expect(lowered).toHaveLength(1);
    expect(lowered[0]!.ruleId).toBe('runtypes/downgraded-error');
    expect(lowered[0]!.severity).toBe(1);
    expect(lowered[0]!.line).toBe(4);
    expect(lowered[0]!.message).toMatch(/^\[VL002\] .*\(downgraded\)$/);
  });

  it("shows Info findings at warn with settings.runtypes.levels: 'all'", {timeout: 120_000}, async () => {
    const widget = (await lint({runtypes: {levels: 'all'}})).get('widget.ts')!;
    expect(widget).toHaveLength(1);
    expect(widget[0]!.ruleId).toBe('runtypes/validate-skipped-member');
    expect(widget[0]!.severity).toBe(1);
    expect(widget[0]!.message).toContain('[VL011]');
    expect(widget[0]!.message).toContain('render');
  });
});
