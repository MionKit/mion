// The REAL ESLint class loads the BUILT plugin through `configs.recommended`. Info shows only with `mion/info` turned
// on, and a `@mion-downgrade-error` line reports as a warning under `mion/warning`, like the build prints it.

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ESLint, type Linter} from 'eslint';
import tseslint from 'typescript-eslint';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {hasBinary, linkVue, makeFixtureProject, type FixtureProject} from './fixture.ts';

const DIST = path.resolve(__dirname, '../../dist/lint');
const ready = hasBinary() && fs.existsSync(path.join(DIST, 'index.js'));

// Marker coverage rule: both getRunTypeId shapes sit beside the validator and lint clean.
const WIDGET_TS = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';

class Widget {
  label = 'ok';
  render(): string { return this.label; }
}

export const isWidget = createValidateFn<Widget>();
export const widgetId = getRunTypeId<Widget>();
export const sampleId = getRunTypeId(new Widget());
`;

const LOWERED_TS = `import {createValidateFn} from '@mionjs/run-types';

// @mion-downgrade-error validate-symbol-root
export const isSymbol = createValidateFn<symbol>();
`;

// vue-eslint-parser's shape: the rule sees the WHOLE SFC as its text, positions in .vue coordinates.
const WIDGET_VUE = `<template>
  <p>{{ label }}</p>
</template>
<script lang="ts">
export interface Widget { label: string }
</script>

<script setup lang="ts">
import {createValidateFn} from '@mionjs/run-types';
export const isWidget = createValidateFn<Widget>();
export const isSymbol = createValidateFn<symbol>();
</script>
`;

// Stands in for vue-eslint-parser: an empty Program over the whole SFC text is all the mion rules read.
const sfcParser: Linter.Parser = {
  parseForESLint(code: string) {
    const lines = code.split('\n');
    const end = {line: lines.length, column: lines[lines.length - 1].length};
    return {
      ast: {
        type: 'Program',
        body: [],
        sourceType: 'module',
        range: [0, code.length],
        loc: {start: {line: 1, column: 0}, end},
        tokens: [],
        comments: [],
      },
    } as unknown as Linter.ESLintParseResult;
  },
};

interface LintPlugin {
  configs: {recommended: Linter.Config};
}

describe.runIf(ready)('eslint end to end (configs.recommended from the built plugin)', () => {
  let project: FixtureProject;
  let plugin: LintPlugin;
  let resetSession: () => void;
  let originalCwd: string;

  beforeAll(async () => {
    project = makeFixtureProject({'widget.ts': WIDGET_TS, 'lowered.ts': LOWERED_TS, 'Widget.vue': WIDGET_VUE});
    linkVue(project);
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

  const lint = async (rules?: Linter.RulesRecord): Promise<Map<string, Linter.LintMessage[]>> => {
    const eslint = new ESLint({
      cwd: project.dir,
      overrideConfigFile: true,
      overrideConfig: [
        {files: ['**/*.ts'], languageOptions: {parser: tseslint.parser as Linter.Parser}},
        {files: ['**/*.vue'], languageOptions: {parser: sfcParser}},
        plugin.configs.recommended,
        ...(rules ? [{rules}] : []),
      ],
    });
    const results = await eslint.lintFiles(['widget.ts', 'lowered.ts', 'Widget.vue']);
    return new Map(results.map((result) => [path.basename(result.filePath), result.messages]));
  };

  it('hides the Info-level validate-method-dropped method drop by default', {timeout: 120_000}, async () => {
    const messages = await lint();
    expect(messages.get('widget.ts')).toEqual([]);
  });

  it('reports a @mion-downgrade-error line as a warning under mion/warning', {timeout: 120_000}, async () => {
    expect((await lint()).get('lowered.ts')).toEqual([
      expect.objectContaining({
        ruleId: 'mion/warning',
        severity: 1,
        line: 4,
        message: expect.stringMatching(/^\[validate-symbol-root\] .*\(downgraded\)$/),
      }),
    ]);
  });

  it('shows Info findings at warn with mion/info turned on', {timeout: 120_000}, async () => {
    expect((await lint({'mion/info': 'warn'})).get('widget.ts')).toEqual([
      expect.objectContaining({
        ruleId: 'mion/info',
        severity: 1,
        message: expect.stringMatching(/\[validate-method-dropped\].*render/),
      }),
    ]);
  });

  it('lints a .vue file, reporting on its own lines with both script blocks as one module', {timeout: 120_000}, async () => {
    const symbolLine = WIDGET_VUE.split('\n').findIndex((line) => line.includes('createValidateFn<symbol>')) + 1;
    expect((await lint()).get('Widget.vue')).toEqual([
      expect.objectContaining({
        ruleId: 'mion/runtime-error',
        line: symbolLine,
        message: expect.stringMatching(/^\[validate-symbol-root\]/),
      }),
    ]);
  });
});
