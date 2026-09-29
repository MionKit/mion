// On the real plugin and binary: a fatal Error never hides the RuntimeErrors after it, and a bundler whose
// buildStart context has no `warn` or `error` (webpack, rspack, esbuild, bun) still prints and still fails.
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import runtypesEsbuild from '../src/runtypes/esbuild.ts';
import runtypesRollup from '../src/runtypes/rollup.ts';
import {haltError, type HaltError} from '../src/core/surface.ts';
import {Family, Level, Severity, type Diagnostic} from '../src/core/protocol.ts';
import {BIN, callHook, createMarkerProject, hasBinary} from './helpers/inline.ts';

// MKR003 (marker in a generic function) is a fatal Error, VL002 (root `symbol`) a RuntimeError.
// Both getRunTypeId shapes must resolve.
const MIXED_SRC = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
export function makeValidator<T>() {
  return createValidateFn<T>();
}
export const isSymbol = createValidateFn<symbol>();
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`;

// A clean entry, and a file the bundle never imports that the tsconfig still includes: only buildStart sees it.
const CLEAN_ENTRY_SRC = `import {getRunTypeId} from '@mionjs/run-types';
export const idStatic = getRunTypeId<{name: string}>();
const sample = {name: 'Ada'};
export const idReflected = getRunTypeId(sample);
`;
const UNIMPORTED_SRC = `import {createValidateFn} from '@mionjs/run-types';
export const isSymbol = createValidateFn<symbol>();
`;

describe('a build prints every finding, then stops once with the real error', () => {
  const register = hasBinary() ? it : it.skip;
  let dir: string;

  beforeAll(() => {
    dir = createMarkerProject('rt-build-halt-');
    fs.writeFileSync(path.join(dir, 'entry.ts'), MIXED_SRC);
  });
  afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

  const makePlugin = () =>
    runtypesRollup({binary: BIN, cwd: dir, tsconfig: 'tsconfig.json', genDir: path.join(dir, '.mion')}) as any;

  register(
    'prints the RuntimeError before the fatal Error stops the build, and the halt carries code, id and loc',
    async () => {
      const plugin = makePlugin();
      const warnings: string[] = [];
      let halt: HaltError | undefined;
      const ctx = {
        warn: (message: string) => void warnings.push(message),
        error: (error: HaltError) => {
          halt = error;
          throw error;
        },
      };
      try {
        await expect(callHook(plugin.buildStart, ctx) as Promise<void>).rejects.toThrow(/build stopped on 2 mion errors/);
        expect(warnings.join('\n')).toContain('error MKR003');
        expect(warnings.join('\n')).toContain('error VL002');
        expect(halt!.message).toMatch(/First: .*entry\.ts\(\d+,\d+\): error (MKR003|VL002): /);
        expect(halt!.id).toBe(path.join(dir, 'entry.ts'));
        expect(halt!.loc).toMatchObject({file: path.join(dir, 'entry.ts'), line: expect.any(Number), column: expect.any(Number)});
      } finally {
        await callHook(plugin.buildEnd, ctx);
      }
    },
    120_000
  );

  register(
    'a context with no warn or error prints to stderr and still throws',
    async () => {
      const plugin = makePlugin();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await expect(callHook(plugin.buildStart, {}) as Promise<void>).rejects.toThrow(/build stopped on 2 mion errors/);
        const printed = warn.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('error MKR003');
        expect(printed).toContain('error VL002');
      } finally {
        warn.mockRestore();
        await callHook(plugin.buildEnd, {});
      }
    },
    120_000
  );
});

describe('esbuild stops on a finding only buildStart sees', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'fails the build for an error in a file the bundle never imports',
    async () => {
      const dir = createMarkerProject('rt-esbuild-halt-');
      fs.writeFileSync(path.join(dir, 'entry.ts'), CLEAN_ENTRY_SRC);
      fs.writeFileSync(path.join(dir, 'unimported.ts'), UNIMPORTED_SRC);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await expect(
          esbuild.build({
            entryPoints: [path.join(dir, 'entry.ts')],
            outfile: path.join(dir, 'bundle.mjs'),
            bundle: true,
            format: 'esm',
            platform: 'neutral',
            logLevel: 'silent',
            external: ['@mionjs/run-types'],
            plugins: [runtypesEsbuild({binary: BIN, cwd: dir, tsconfig: 'tsconfig.json', genDir: path.join(dir, '.mion')})],
          })
        ).rejects.toThrow(/build stopped on 1 mion error\. First: .*unimported\.ts.*VL002/);
        expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toContain('error VL002');
      } finally {
        warn.mockRestore();
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    120_000
  );
});

describe('the edits-mode re-sync', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'stops the build on an error only the drifted source holds, instead of falling back',
    async () => {
      const dir = createMarkerProject('rt-resync-halt-');
      const entry = path.join(dir, 'entry.ts');
      fs.writeFileSync(entry, CLEAN_ENTRY_SRC);
      const plugin = runtypesRollup({binary: BIN, cwd: dir, tsconfig: 'tsconfig.json', genDir: path.join(dir, '.mion')}) as any;
      const ctx = {
        warn: () => undefined,
        error: (error: HaltError) => {
          throw error;
        },
      };
      // An upstream plugin appended a marker call in a generic function: MKR003 exists only in the code handed over.
      const drifted = CLEAN_ENTRY_SRC + 'export function makeId<T>() {\n  return getRunTypeId<T>();\n}\n';
      try {
        await callHook(plugin.buildStart, ctx);
        await expect(callHook(plugin.transform, ctx, drifted, entry) as Promise<unknown>).rejects.toThrow(
          /build stopped on 1 mion error\. First: .*error MKR003: /
        );
      } finally {
        await callHook(plugin.buildEnd, ctx);
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    120_000
  );
});

describe('haltError', () => {
  const inB: Diagnostic = {
    code: 'VL002',
    family: Family.RunType,
    level: Level.RuntimeError,
    severity: Severity.Error,
    args: ['Symbol'],
    site: {filePath: 'src/b.ts', startLine: 3, startCol: 5},
  };

  it('names the file but leaves out the position when the error sits in another file than the one transformed', () => {
    const error = haltError(inB, 1, 'src/a.ts', '/app');
    expect(error.id).toBe('/app/src/b.ts');
    expect(error.loc).toBeUndefined();
  });

  it('sets a 0-based column when the error sits in the file transformed', () => {
    expect(haltError(inB, 1, 'src/b.ts', '/app').loc).toEqual({file: '/app/src/b.ts', line: 3, column: 4});
  });
});
