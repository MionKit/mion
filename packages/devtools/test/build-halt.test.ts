// How a build prints mion findings and stops. Three things are pinned here, each on the real plugin and binary:
//   - a build prints EVERY finding before it stops, so a fatal Error never hides the RuntimeErrors after it;
//   - the halt names the first error's code and place, and carries `id` / `loc` for vite's overlay;
//   - a bundler whose buildStart context has no `warn` or `error` (webpack, rspack, esbuild, bun) still prints
//     and still fails, where the findings used to vanish and the build passed.
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import runtypesEsbuild from '../src/runtypes/esbuild.ts';
import runtypesRollup from '../src/runtypes/rollup.ts';
import {BIN, createMarkerProject, hasBinary} from './helpers/inline.ts';

// MKR003 (a marker in a generic function) is a fatal Error; VL002 (a root `symbol`) a RuntimeError. Both call
// shapes of getRunTypeId ride along and must resolve.
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

type Hook = ((...args: unknown[]) => unknown) | {handler: (...args: unknown[]) => unknown};
const callHook = (hook: Hook, thisArg: unknown, ...args: unknown[]): unknown =>
  typeof hook === 'function' ? hook.apply(thisArg, args) : hook.handler.apply(thisArg, args);

describe('a host context with no warn or error', () => {
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
    'a context with no warn or error prints to stderr and still throws',
    async () => {
      const plugin = makePlugin();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await expect(callHook(plugin.buildStart, {}) as Promise<void>).rejects.toThrow(/1 unsupported-type error — build halted/);
        const printed = warn.mock.calls.map((call) => String(call[0])).join('\n');
        expect(printed).toContain('error MKR003');
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
        ).rejects.toThrow(/1 unsupported-type error — build halted/);
        expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toContain('error VL002');
      } finally {
        warn.mockRestore();
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    120_000
  );
});
