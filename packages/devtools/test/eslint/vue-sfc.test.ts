// vueSfc.ts: the module a `.vue` lint request scans, and where its findings land on the `.vue` file.

import {describe, expect, it} from 'vitest';
import {Family, Level, Severity, type Diagnostic} from '../../src/core/protocol.ts';
import {vueLintSource} from '../../src/lint/vueSfc.ts';

const FILE = '/project/src/Comp.vue';

const SFC = `<template>
  <div>{{ a }}</div>
</template>
<script lang="ts">
export interface User { id: number }
</script>

<script setup lang="ts">
import {createValidateFn} from '@mionjs/run-types';
const isUser = createValidateFn<User>();
</script>
`;

// Block text as oxlint hands it: the setup block's code without the newline after its tag.
const SETUP_BLOCK = `import {createValidateFn} from '@mionjs/run-types';\nconst isUser = createValidateFn<User>();\n`;

function diag(
  startLine: number,
  startCol: number,
  filePath = `${FILE}.ts`,
  end?: {endLine: number; endCol: number},
  related?: Diagnostic['related']
): Diagnostic {
  return {
    code: 'validate-symbol-root',
    family: Family.Marker,
    severity: Severity.Error,
    level: Level.RuntimeError,
    site: {filePath, startLine, startCol, ...end},
    related,
  };
}

const lineOf = (text: string, needle: string): number => text.slice(0, text.indexOf(needle)).split('\n').length;

describe('vueLintSource', () => {
  it('full SFC (ESLint): scripts kept in place, markup blanked, positions unchanged', () => {
    const source = vueLintSource(FILE, SFC, () => SFC);
    expect(source.virtualFile).toBe(`${FILE}.ts`);
    expect(source.text.length).toBe(SFC.length);
    expect(source.text.split('\n').length).toBe(SFC.split('\n').length);
    expect(source.text).not.toContain('<template>');
    expect(source.text).not.toContain('<script');
    // Both blocks form one module, so the type from <script> reaches <script setup>.
    expect(source.text).toContain('export interface User');
    const line = lineOf(SFC, 'createValidateFn<User>');
    expect(source.text.split('\n')[line - 1]).toBe(SFC.split('\n')[line - 1]);
    expect(source.toVue(diag(line, 16))?.site).toEqual({filePath: FILE, startLine: line, startCol: 16});
  });

  it('one oxlint block: the saved file gives the module, findings move onto the block lines', () => {
    const source = vueLintSource(FILE, SETUP_BLOCK, () => SFC);
    expect(source.virtualFile).toBe(`${FILE}.ts`);
    expect(source.text).toContain('export interface User');
    const line = lineOf(SFC, 'createValidateFn<User>');
    expect(source.toVue(diag(line, 16, `${FILE}.ts`, {endLine: line, endCol: 40}))?.site).toEqual({
      filePath: FILE,
      startLine: 2,
      startCol: 16,
      endLine: 2,
      endCol: 40,
    });
  });

  it('one oxlint block: a finding in the other block is left to that block', () => {
    const source = vueLintSource(FILE, SETUP_BLOCK, () => SFC);
    expect(source.toVue(diag(lineOf(SFC, 'export interface User'), 1))).toBeUndefined();
  });

  it('one oxlint block: an end past the block is dropped, the start stays', () => {
    const block = `export interface User { id: number }\n`;
    const source = vueLintSource(FILE, block, () => SFC);
    const line = lineOf(SFC, 'export interface User');
    expect(source.toVue(diag(line, 8, `${FILE}.ts`, {endLine: line + 5, endCol: 3}))?.site).toEqual({
      filePath: FILE,
      startLine: 1,
      startCol: 8,
    });
  });

  it('a block that starts on its tag line keeps its columns block-relative', () => {
    const sfc = `<template><p/></template>\n<script setup lang="ts">const first = 1; const second = 2;</script>\n`;
    const block = `const first = 1; const second = 2;`;
    const source = vueLintSource(FILE, block, () => sfc);
    const col = sfc.indexOf('const second') - sfc.indexOf('\n');
    expect(source.toVue(diag(2, col))?.site).toMatchObject({startLine: 1, startCol: block.indexOf('const second') + 1});
  });

  it('the only block, edited since the last save, is linted alone', () => {
    const sfc = `<template><p/></template>\n<script setup lang="ts">\n${SETUP_BLOCK}</script>\n`;
    const edited = `${SETUP_BLOCK}const extra = 1;\n`;
    const source = vueLintSource(FILE, edited, () => sfc);
    expect(source.text).toBe(edited);
    expect(source.toVue(diag(3, 1))?.site).toEqual({filePath: FILE, startLine: 3, startCol: 1});
  });

  it('a block edited since the last save beside another block reports nothing until saved', () => {
    // Alone it would miss the sibling block's types and report what the build never does.
    const source = vueLintSource(FILE, `${SETUP_BLOCK}const extra = 1;\n`, () => SFC);
    expect(source.toVue(diag(2, 16))).toBeUndefined();
  });

  it('an unreadable file lints the block alone as TypeScript', () => {
    const source = vueLintSource(FILE, SETUP_BLOCK, () => '');
    expect(source.virtualFile).toBe(`${FILE}.ts`);
    expect(source.text).toBe(SETUP_BLOCK);
  });

  it('a <script> in a string or an HTML comment is not a block', () => {
    const sfc = `<!-- <script setup lang="ts">\nconst old = 1;\n</script> -->\n<script setup lang="ts">\nconst tag = '<script>';\nconst next = 1;\n</script>\n`;
    const source = vueLintSource(FILE, sfc, () => sfc);
    expect(source.text.length).toBe(sfc.length);
    expect(source.text).not.toContain('const old');
    expect(source.text.match(/const next/g)).toHaveLength(1);
  });

  it('a generic attribute holding `>` keeps the block whole', () => {
    const sfc = `<script setup lang="ts" generic="T extends Array<string>">\nconst next = 1;\n</script>\n`;
    const source = vueLintSource(FILE, sfc, () => sfc);
    expect(source.text).not.toContain('">');
    expect(source.text.trim()).toBe('const next = 1;');
  });

  it('CRLF line endings keep lines and columns', () => {
    const sfc = SFC.replace(/\n/g, '\r\n');
    const block = SETUP_BLOCK.replace(/\n/g, '\r\n');
    const source = vueLintSource(FILE, block, () => sfc);
    expect(source.text.length).toBe(sfc.length);
    const line = lineOf(SFC, 'createValidateFn<User>');
    expect(source.toVue(diag(line, 16))?.site).toEqual({filePath: FILE, startLine: 2, startCol: 16});
  });

  it('a related site in the module moves with it, one in another file keeps its path', () => {
    const line = lineOf(SFC, 'createValidateFn<User>');
    const related = [
      {filePath: `${FILE}.ts`, startLine: line, startCol: 1, message: 'here'},
      {filePath: '/project/src/types.ts', startLine: 5, startCol: 2, message: 'declared here'},
    ];
    expect(vueLintSource(FILE, SFC, () => SFC).toVue(diag(line, 16, `${FILE}.ts`, undefined, related))?.related).toEqual([
      {filePath: FILE, startLine: line, startCol: 1, message: 'here'},
      related[1],
    ]);
    expect(vueLintSource(FILE, SETUP_BLOCK, () => SFC).toVue(diag(line, 16, `${FILE}.ts`, undefined, related))?.related).toEqual([
      {filePath: FILE, startLine: 2, startCol: 1, message: 'here'},
      related[1],
    ]);
  });

  it('a <script src> block is a real file, never part of the module', () => {
    const sfc = `<script src="./logic.ts"></script>\n<template><p/></template>\n`;
    const source = vueLintSource(FILE, sfc, () => sfc);
    expect(source.text.trim()).toBe('');
  });

  it('an unclosed <script> yields no block', () => {
    const sfc = `<template><p/></template>\n<script setup lang="ts">\nconst value = 1;\n`;
    expect(vueLintSource(FILE, sfc, () => sfc).text).not.toContain('<script');
  });

  it('a script with no lang registers as .js, like the build', () => {
    const sfc = `<script setup>\nconst value = 1;\n</script>\n`;
    expect(vueLintSource(FILE, sfc, () => sfc).virtualFile).toBe(`${FILE}.js`);
  });
});
