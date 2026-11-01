// `@ts-expect-error` only proves some error happens; this proves the message names the mistyped option key.

import {describe, it, expect} from 'vitest';
import * as ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {makeHost, RESOLVING_OPTIONS} from './modelPipelineHarness.ts';

const CASE_FILE = fileURLToPath(new URL('./__routerOptionKeysCase__.ts', import.meta.url));

function errorsOf(body: string): string[] {
  const source = `import {createMionRouter, type MionSecurityHandlerOptions} from '@mionjs/router';\n${body}\n`;
  const options: ts.CompilerOptions = {...RESOLVING_OPTIONS, strict: true, noEmit: true};
  const program = ts.createProgram([CASE_FILE], options, makeHost(options, new Map([[CASE_FILE, source]])));
  const caseFile = program.getSourceFile(CASE_FILE)!;
  return program
    .getSemanticDiagnostics(caseFile)
    .map((d) => `TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
}

describe('unknown router option keys', () => {
  it('names the mistyped key on a handler, even next to a valid key', {timeout: 60_000}, () => {
    const errors = errorsOf(`const mion = createMionRouter.withTypes<{handler: MionSecurityHandlerOptions}>()();
export const r = mion.route((): string => 'x', {description: 'd', corz: false});`);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('UnknownOptionKey<"corz">');
  });

  it('names the mistyped key on the router factory, even next to a valid key', {timeout: 60_000}, () => {
    const errors = errorsOf(
      `export const mion = createMionRouter.withTypes<{router: {audit?: boolean}}>()({basePath: 'api', audti: true});`
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('UnknownOptionKey<"audti">');
  });

  it('accepts the declared keys', {timeout: 60_000}, () => {
    const errors =
      errorsOf(`const mion = createMionRouter.withTypes<{router: {audit?: boolean}; handler: MionSecurityHandlerOptions}>()({audit: true});
export const r = mion.route((): string => 'x', {description: 'd', cors: false});`);
    expect(errors).toEqual([]);
  });
});
