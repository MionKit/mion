// DataOnly posture pin — the projection must hold with AND without the
// Temporal lib.
//
// The published package unconditionally loads formats/datetime/temporalFormats
// (index.d.ts → builders/static → builderTypes), whose DataOnlyNativeExtra
// augmentation references the global Temporal namespace through a
// `typeof globalThis` guard. The guard's fallback sits in DataOnly's union
// keep-list, so the WRONG fallback (`unknown`) absorbs the union and silently
// collapses `DataOnly<T>` to the identity for every consumer without the
// Temporal lib — methods and Promises survive at the type level, and
// `createJsonDecoderFn`'s `DataOnly<T>` return over-promises. That regression
// shipped unnoticed because every other type-level suite (this directory,
// `decodeReturnType.test.ts`) compiles inside a program that ALREADY has the
// temporal ambient (test/support/temporal-ambient.d.ts).
//
// So this suite compiles probes against the BUILT dist — the exact declaration
// graph a consumer resolves — through the real TypeScript compiler, in the two
// postures a consumer can be in:
//   • WITHOUT any Temporal types: DataOnly still projects (drop arm intact).
//   • WITH the canonical temporal ambient (the same
//     ts-go-runtypes/internal/testfixtures/temporal.d.ts both test lanes use):
//     the projection still holds AND Temporal instances are KEPT verbatim —
//     the augmentation's entire purpose.
import {describe, it, expect} from 'vitest';
import * as ts from 'typescript';
import {existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST_INDEX = resolve(HERE, '../../dist/index.d.ts');
const TEMPORAL_AMBIENT = resolve(HERE, '../../../../ts-go-runtypes/internal/testfixtures/temporal.d.ts');

// The probes assert with Expect<Equal<…>> so a correct projection compiles
// CLEAN and any drift (identity collapse included) is a type error.
const PROBE_PRELUDE = `import type {DataOnly} from '@ts-runtypes/core';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
`;

const DROP_PROBE = `${PROBE_PRELUDE}
interface Dirty {a: string; fn(): void; pending: Promise<number>}
type _drop = Expect<Equal<DataOnly<Dirty>, {a: string}>>;
interface Nested {outer: string; inner: {keep: number; fn: () => void}}
type _nested = Expect<Equal<DataOnly<Nested>, {outer: string; inner: {keep: number}}>>;
`;

const KEEP_PROBE = `${PROBE_PRELUDE}
type _keep = Expect<Equal<DataOnly<Temporal.Instant>, Temporal.Instant>>;
declare const kept: DataOnly<Temporal.Instant>;
kept.toJSON();
`;

const PROBE_PATH = '/__dataonly_posture_probe__.ts';

// Compiles the probe against the built dist with the real TS compiler and
// returns the diagnostics. `ambientFiles` are real on-disk roots (the temporal
// ambient for the WITH posture); everything but the virtual probe file reads
// through ts.sys, so module resolution walks the actual dist tree.
function compileProbe(probe: string, ambientFiles: string[] = []): string[] {
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    types: [],
    paths: {'@ts-runtypes/core': [DIST_INDEX]},
  };
  const host = ts.createCompilerHost(options);
  const baseGetSourceFile = host.getSourceFile.bind(host);
  const baseFileExists = host.fileExists.bind(host);
  const baseReadFile = host.readFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, ...rest) =>
    fileName === PROBE_PATH
      ? ts.createSourceFile(fileName, probe, languageVersion, true)
      : baseGetSourceFile(fileName, languageVersion, ...rest);
  host.fileExists = (fileName) => fileName === PROBE_PATH || baseFileExists(fileName);
  host.readFile = (fileName) => (fileName === PROBE_PATH ? probe : baseReadFile(fileName));
  const program = ts.createProgram([PROBE_PATH, ...ambientFiles], options, host);
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    const where = diagnostic.file ? `${diagnostic.file.fileName}:${diagnostic.start}` : '';
    return `${where} TS${diagnostic.code}: ${message}`;
  });
}

describe('DataOnly projects in both Temporal postures (against the built dist)', () => {
  it('has the built dist and the canonical temporal ambient to compile against', () => {
    expect(existsSync(DIST_INDEX), `missing ${DIST_INDEX} — run 'pnpm run check:builds'`).toBe(true);
    expect(existsSync(TEMPORAL_AMBIENT)).toBe(true);
  });

  it('WITHOUT the Temporal lib: non-data members still drop (no identity collapse)', () => {
    expect(compileProbe(DROP_PROBE)).toEqual([]);
  });

  it('WITH the temporal ambient: the same projection holds', () => {
    expect(compileProbe(DROP_PROBE, [TEMPORAL_AMBIENT])).toEqual([]);
  });

  it('WITH the temporal ambient: Temporal instances are kept verbatim', () => {
    expect(compileProbe(KEEP_PROBE, [TEMPORAL_AMBIENT])).toEqual([]);
  });
});
